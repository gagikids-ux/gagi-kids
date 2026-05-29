import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, 'public')))

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
const STORAGE_URL = `${process.env.SUPABASE_URL}/storage/v1/object/public/imagens`

// ─── Upload de fotos (memória → Supabase Storage) ─────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype)),
})

// ─── Catálogo via Supabase ────────────────────────────────────────────────────
let catalogCache = { products: null, at: 0 }
const CATALOG_CACHE_TTL = 5 * 60 * 1000

function dbToProduct(r) {
  return {
    id: r.id, name: r.name, category: r.category || '',
    sex: r.sex || 'Menina', price: Number(r.price) || 0,
    priceDisplay: r.price_display || '', size: r.size || '',
    weight: r.weight || '', bodyType: r.body_type || 'pano',
    eyes: r.eyes || 'abertos', hair: r.hair || 'pintado',
    material: r.material || '', description: r.description || '',
    includes: r.includes || '', notes: r.notes || '',
    photo: r.photo || '', available: r.available !== false,
    readyStock: r.ready_stock || false,
  }
}

function productToDb(p) {
  return {
    id: p.id, name: p.name || '', category: p.category || '',
    sex: p.sex || 'Menina', price: Number(p.price) || 0,
    price_display: p.priceDisplay || '', size: p.size || '',
    weight: p.weight || '', body_type: p.bodyType || 'pano',
    eyes: p.eyes || 'abertos', hair: p.hair || 'pintado',
    material: p.material || '', description: p.description || '',
    includes: p.includes || '', notes: p.notes || '',
    photo: p.photo || '', available: p.available !== false,
    ready_stock: p.readyStock || false,
  }
}

async function readCatalog() {
  if (catalogCache.products && Date.now() - catalogCache.at < CATALOG_CACHE_TTL) {
    return catalogCache.products
  }
  const { data, error } = await supabase.from('products').select('*').order('name')
  if (error) { console.error('Supabase read error:', error.message); return catalogCache.products || [] }
  const products = data.map(dbToProduct)
  catalogCache = { products, at: Date.now() }
  return products
}

function invalidateCache() { catalogCache = { products: null, at: 0 } }

function formatCatalogForAI(products) {
  const bodyLabel = { pano: 'Cabeça e membros de silicone, corpo de tecido', vinil_completo: 'Corpo inteiro de silicone vinil', solido: 'Silicone sólido 100% (pode dar banho)' }
  const hairLabel = { implantado: 'Cabelo implantado fio a fio', pintado: 'Cabelo pintado', sem_cabelo: 'Sem cabelo' }
  const eyeLabel  = { abertos: 'Olhos abertos', fechados: 'Olhos fechados' }

  const byCat = {}
  for (const p of products) {
    if (!p.available) continue
    ;(byCat[p.category] = byCat[p.category] || []).push(p)
  }

  return Object.entries(byCat).map(([cat, prods]) => {
    const rows = prods.map(p => [
      `\n--- MODELO: ${p.name} ---`,
      `Sexo: ${p.sex}`,
      `Preço: ${p.priceDisplay || 'R$ ' + p.price.toFixed(2).replace('.', ',')}`,
      p.size   ? `Tamanho: ${p.size}` : '',
      p.weight ? `Peso: ${p.weight}` : '',
      `Tipo de corpo: ${bodyLabel[p.bodyType] || p.bodyType}`,
      `Olhos: ${eyeLabel[p.eyes] || p.eyes}`,
      `Cabelo: ${hairLabel[p.hair] || p.hair}`,
      p.description ? `Aparência: ${p.description}` : '',
      p.includes    ? `Inclui: ${p.includes}` : '',
      p.notes       ? `Observação: ${p.notes}` : '',
      p.readyStock  ? 'Disponibilidade: PRONTA ENTREGA' : '',
      p.photo       ? `Tem foto cadastrada: sim` : '',
    ].filter(Boolean).join('\n'))
    return `\n=== CATEGORIA: ${cat} ===\n${rows.join('\n')}`
  }).join('\n')
}

// Injeta imagens para produtos mencionados na resposta da IA ou na mensagem do usuário
const COMMON_WORDS = new Set(['bebe', 'beba', 'reborn', 'baby', 'doll', 'modelo', 'boneca', 'boneco', 'mini', 'plus', 'menina', 'menino', 'premium', 'silicone', 'vinil'])

function normalizeStr(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').trim()
}

// Extrai palavras únicas (não-genéricas, >3 chars) do nome do produto
function uniqueWords(name) {
  return normalizeStr(name).split(/\s+/).filter(w => w.length > 3 && !COMMON_WORDS.has(w))
}

function injectImages(aiText, userText, products) {
  const injected = []

  // Busca tanto na resposta da IA quanto na última mensagem do usuário
  const searchText = normalizeStr((userText || '') + ' ' + aiText)

  // Produtos mais longos primeiro para evitar match parcial (ex: "Ana" dentro de "Anabela")
  const candidates = [...products]
    .filter(p => p.photo && p.available)
    .sort((a, b) => b.name.length - a.name.length)

  for (const p of candidates) {
    if (aiText.includes(`/imagens/${p.photo}`)) continue  // já presente

    const words = uniqueWords(p.name)
    // Match se qualquer palavra única do produto aparecer no texto de busca
    const matched = words.length > 0
      ? words.some(w => searchText.includes(w))
      : searchText.includes(normalizeStr(p.name))

    if (matched) {
      injected.push(`![${p.name}](${STORAGE_URL}/${p.photo})`)
    }
  }

  return injected.length ? aiText + '\n\n' + injected.join('\n') : aiText
}

const CLOSING_TRIGGER = 'Vou te encaminhar pra Gi'

// Extrai resumo do pedido da conversa para montar a mensagem do WhatsApp
function buildCartSummary(history, products) {
  const allRaw  = history.map(m => m.content).join(' ')
  const allNorm = normalizeStr(allRaw)
  const userMsgs = history.filter(m => m.role === 'user')
  const userRaw  = userMsgs.map(m => m.content).join(' ')
  const userNorm = normalizeStr(userRaw)

  // Produto: busca primeiro nas msgs do usuário (mais confiável), depois em toda a conversa
  let product = null
  const productCandidates = [...products]
    .filter(p => p.available)
    .sort((a, b) => b.name.length - a.name.length)
  for (const p of productCandidates) {
    const words = uniqueWords(p.name)
    if (words.length > 0 && words.some(w => userNorm.includes(w))) { product = p; break }
  }
  if (!product) {
    // Fallback: busca em msgs da IA, mas exige pelo menos 2 palavras únicas para evitar falso positivo
    for (const p of productCandidates) {
      const words = uniqueWords(p.name)
      const hits = words.filter(w => allNorm.includes(w))
      if (hits.length >= 2 || (words.length === 1 && hits.length === 1)) { product = p; break }
    }
  }

  // Pagamento: busca nas msgs do usuário do mais recente para o mais antigo
  let payment = ''
  for (const msg of [...userMsgs].reverse()) {
    const t = normalizeStr(msg.content)
    const r = msg.content
    if (/pix|dinheiro/.test(t))                { payment = 'Pix / Dinheiro'; break }
    if (/credito|parcel|\d+\s*x/.test(t)) {
      const m = r.match(/(\d+)\s*[xX]/)
      payment = m ? `Cartão de crédito ${m[1]}x` : 'Cartão de crédito'
      break
    }
    if (/debito/.test(t))                      { payment = 'Cartão de débito'; break }
  }
  if (!payment) {
    if (/pix|dinheiro/.test(allNorm))          payment = 'Pix / Dinheiro'
    else if (/credito|parcel/.test(allNorm)) {
      const m = allRaw.match(/(\d+)\s*[xX]/)
      payment = m ? `Cartão de crédito ${m[1]}x` : 'Cartão de crédito'
    }
    else if (/debito/.test(allNorm))           payment = 'Cartão de débito'
  }

  // Entrega: retirada detectada apenas em msgs do usuário; cidade buscada em toda a conversa
  let delivery = ''
  if (/retira|buscar|pegar/.test(userNorm) || /piracicaba/.test(userNorm)) {
    delivery = 'Retirada em Piracicaba/SP'
  } else if (/envio|frete|envia|manda|entrega|enviar/.test(allNorm)) {
    // Busca cidade em toda a conversa — a IA frequentemente repete a cidade do cliente
    const cityMatch = allRaw.match(/(?:para|pra)\s+([A-ZÁÉÍÓÚÃÕ][a-záéíóúãõç]+(?: [A-ZÁÉÍÓÚÃÕ][a-záéíóúãõç]+)*)/u)
    delivery = cityMatch ? `Envio para ${cityMatch[1]}` : 'Envio (cidade a confirmar com Gaby)'
  }

  // Frete e total extraídos da conversa
  const freteMatch = allRaw.match(/[Ff]rete[^R\n]*R\$\s*([\d.,]+)/)
  const frete = freteMatch ? `R$ ${freteMatch[1]}` : ''

  const totalMatch = allRaw.match(/[Tt]otal[^R\n]*R\$\s*([\d.,]+)/)
  const total = totalMatch ? `R$ ${totalMatch[1]}` : ''

  return { product, payment, delivery, frete, total }
}

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.API_BASE_URL || 'https://api.deepseek.com',
})

const MODEL = process.env.API_MODEL || 'deepseek-chat'

// ─── Catálogo via Google Sheets ───────────────────────────────────────────────

const SHEETS_CACHE_TTL = 10 * 60 * 1000 // 10 minutos
let sheetsCache = { data: null, updatedAt: 0 }

async function fetchSheetsData(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`)
  const csv = await res.text()
  return csvToText(csv)
}

function csvToText(csv) {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return 'Planilha sem produtos.'

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const products = []

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (!cols[0]?.trim()) continue

    const parts = [`--- MODELO: ${cols[0].trim()} ---`]
    headers.slice(1).forEach((h, idx) => {
      const val = (cols[idx + 1] || '').trim()
      if (val) parts.push(`${h}: ${val}`)
    })
    products.push(parts.join('\n'))
  }

  return products.join('\n\n')
}

function splitCsvLine(line) {
  const cols = []
  let cur = '', inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { cols.push(cur); cur = ''; continue }
    cur += ch
  }
  cols.push(cur)
  return cols
}

async function getCatalog() {
  // Prioridade 1: Supabase
  try {
    const products = await readCatalog()
    if (products.length > 0) return formatCatalogForAI(products)
  } catch {}

  const sheetId = process.env.GOOGLE_SHEET_ID

  // Prioridade 2: Google Sheets (legado)
  if (sheetId) {
    const now = Date.now()
    if (sheetsCache.data && now - sheetsCache.updatedAt < SHEETS_CACHE_TTL) {
      return sheetsCache.data
    }
    try {
      const data = await fetchSheetsData(sheetId)
      sheetsCache = { data, updatedAt: now }
      console.log(`📊 Catálogo atualizado do Google Sheets (${data.split('---').length - 1} produtos)`)
      return data
    } catch (err) {
      console.warn('⚠️  Falha ao buscar Google Sheets:', err.message)
      if (sheetsCache.data) return sheetsCache.data // usa cache antigo
    }
  }

  // Fallback: lê o arquivo local src/catalog.js
  try {
    const src = readFileSync(join(__dirname, 'src/catalog.js'), 'utf-8')
    const match = src.match(/export const CATALOG = `([\s\S]*?)`/)
    return match ? match[1].trim() : 'Catálogo não configurado.'
  } catch {
    return 'Catálogo não encontrado. Configure o arquivo src/catalog.js ou adicione GOOGLE_SHEET_ID no .env'
  }
}

async function buildSystemPrompt() {
  const catalog = await getCatalog()
  return `Você é Gaby, atendente da Gagi Kids — loja de bonecas reborn de Piracicaba SP.

QUEM VOCÊ É:
Você é uma pessoa real, apaixonada por bonecas reborn. Fala como se estivesse no WhatsApp mesmo — mensagens curtas, jeito simples, sem formalidade nenhuma. Você não é um robô, não é um vendedor de loja. Você é a Gaby, e você realmente ama o que faz.

COMO VOCÊ ESCREVE:
- Mensagens bem curtas, uma ideia de cada vez (igual WhatsApp de verdade)
- Linguagem do dia a dia: "sim", "boa", "que lindo", "amooo", "pode sim", "claro!", "deixa eu ver aqui"
- Abreviações naturais: "vc", "tbm", "pra", "q", "tô", "né", "ta bom", "tudo bem"
- Emojis com moderação e naturalidade: 🥰 🥹 ❤️ 🙏 😍 — nunca mais de 1 por mensagem
- Às vezes responde só "Sim" ou "Pode!" sem precisar elaborar
- Não use bullet points, listas formatadas nem linguagem de site. Escreva como falaria no celular.
- Nunca comece a resposta com "Olá!" ou "Claro!" toda vez — varie bastante

JEITO DE ATENDER:
Quando a conversa começar, pergunte para quem é a boneca e qual a ocasião — mas de forma natural, não como um script. Exemplo: "Boa! É pra vc mesma ou pra presente? 💕"

Depois de entender o que ela quer, apresente o modelo mais adequado do catálogo com carinho, como se você estivesse mostrando pessoalmente.

Se ela demonstrar interesse em um modelo específico, crie um pouco de desejo: "Essa aí é uma das mais lindas que tenho, fica ainda mais gostosa pessoalmente 🥹"

SOBRE A GAGI KIDS:
- Piracicaba SP — Jardim Califórnia, atrás do Detran
- Retirada na loja: Rua Thereza de Mello Ocanaa, 55
- Enviamos pelo Correios pra todo o Brasil

CATÁLOGO COMPLETO:
${catalog}

MATERIAIS (explique quando perguntarem, sem parecer manual):
- Silicone vinil soft: maleável, cabelo pintado, pode dar banho — é o das promoções a partir de R$250
- Premium Vinil: cabelo enraizado fio a fio, mais realista — R$680 a R$890
- Sólido Silicone: corpo 100% sólido, ultra-realista — a partir de R$890
- Sólido Premium: o mais detalhado de todos, pele pintada à mão — R$2.800 a R$3.800

KIT QUE VEM COM A BONECA:
Fralda, certidão de nascimento, chupeta, mamadeira e roupa igualzinha à foto

PRAZO DE ENTREGA:
- Pronta entrega: retira no mesmo dia ou recebe em 1-3 dias
- Encomenda: de 3 a 15 dias dependendo do modelo

PAGAMENTO:
- Pix ou dinheiro (à vista)
- Débito
- Crédito parcelado em até 12x com juros (maquininha ou link Mercado Pago)

FRETE:
- Encomenda do catálogo: frete grátis pra todo o Brasil
- Pronta entrega enviada pelos Correios: calcula pelo CEP
- Piracicaba: pode retirar ou combinar entrega local

GARANTIA E DEVOLUÇÃO:
- A boneca pode ser devolvida se chegar com algum defeito
- O defeito precisa ser avisado assim que a cliente receber — não é aceito depois de dias
- Se perguntarem, responda natural: "Se chegar com algum defeito, é só me avisar assim que receber que a gente resolve 🥰"

RESPOSTAS DIRETAS PARA PERGUNTAS COMUNS:
- "Tem sólido?" → "Tem sim! O sólido começa em R$890, quer ver os modelos?"
- "Faz doação?" → "Não faço não, mas tenho opções a partir de R$250 🥰"
- "Promoção até quando?" → "Até durar o estoque! Melhor garantir logo"
- "Tem parcelamento?" → "Tem! Cartão de crédito em até 12x com juros"
- "Tem pronta entrega?" → "Tenho alguns modelos aqui, qual vc gostou?"
- "Quanto fica o frete?" → "Me passa seu CEP que eu calculo!"
- "O que vem junto?" → "Vem fralda, certidão de nascimento, chupeta, mamadeira e a roupinha igualzinha da foto 🥰"
- "Tem olhinho fechado?" → Verifique no catálogo e responda
- "Tem cabelo?" → "Da promoção o cabelo é pintado. As premium e sólido têm cabelo enraizado fio a fio"

URGÊNCIA (use quando fizer sentido, nunca forçado):
- "Só tenho duas unidades dessa"
- "Essa sai bastante, tô quase sem estoque"
- "Pra chegar antes de [data que ela disse], a gente precisa confirmar hoje"

QUANDO ELA DECIDIR COMPRAR:
Passo 1 — colete as informações abaixo de forma natural, uma de cada vez:
1. ✅ Produto escolhido (se ainda não ficou claro qual bebê ela quer)
2. 💳 Forma de pagamento: Pix/dinheiro, débito ou crédito (se crédito, quantas vezes)
3. 📦 Vai retirar em Piracicaba ou quer envio? Se envio, qual cidade e bairro? (NUNCA peça rua, número ou endereço completo — isso a Gi combina depois)

Passo 2 — com as 3 informações em mãos, envie o RESUMO DO PEDIDO neste formato exato (substitua os campos, mantenha os emojis e a estrutura):
"Fechou! Então fica assim ✅

🛍️ [Nome da bebê] — [preço]
🚚 [Frete pra cidade — valor se souber, ou "frete a calcular com Gaby"]
💰 Total — [valor total se possível, ou "a confirmar com Gaby"]
💳 [Forma de pagamento]

Confirma? 😊"

Passo 3 — SOMENTE após a cliente confirmar (sim, confirmo, certo, tá bom, pode ser, ok, isso, perfeito ou qualquer resposta afirmativa), diga EXATAMENTE (sem asteriscos, sem negrito, sem acréscimos):
"Que alegria! 🎉 Vou te encaminhar pra Gi pra fechar os detalhes do pedido com você!"

Após essa frase, o sistema redireciona automaticamente a cliente para o WhatsApp da Gi. NÃO diga mais nada. PARE.

CLIENTES QUE NÃO SABEM LER:
Se a cliente disser que não sabe ler, não consegue ler, ou pedir pra você falar, responda com carinho e explique que ela pode usar o microfone pra falar com você, e que as respostas serão lidas em voz alta automaticamente. Exemplo:
"Fica tranquila! 🥰 Você pode falar usando o microfone aqui embaixo. É só clicar no ícone do microfone, falar sua pergunta, e eu vou te responder em voz alta também. Tô aqui pra te ajudar!"
Depois disso, continue o atendimento normalmente, com mensagens curtas e simples.

FOTOS DOS PRODUTOS:
- O sistema envia as fotos automaticamente quando você menciona um produto. Você não precisa fazer nada.
- NUNCA diga "não consigo enviar fotos", "não tenho acesso a fotos", "não posso mandar imagem" ou qualquer variação. Isso é PROIBIDO.
- Quando a cliente pedir foto, responda com entusiasmo descrevendo o produto e o sistema cuida do resto.
- Se não houver foto de um produto no sistema, simplesmente não mencione fotos — continue o atendimento descrevendo o produto.

LIMITES:
- Não invente preços, prazos ou características que não estão no catálogo
- NUNCA peça rua, número, CEP ou endereço completo — só cidade e bairro. O endereço completo a Gi combina diretamente com a cliente
- Se não souber algo: "Deixa eu confirmar com a Gaby e já te falo!"
- Se perguntarem se você é IA: "Sou a assistente virtual da Gagi Kids, aqui pra te ajudar 24h 😊"
- Responda sempre em português do Brasil
- NUNCA diga "me chama no particular", "fala no privado" ou similar — você JÁ está numa conversa privada com a cliente
- NUNCA prometa descontos ou condições especiais que não estão no catálogo`
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  // Converte formato frontend → formato OpenAI
  const history = messages.map(m => ({
    role: m.sender === 'agent' ? 'assistant' : 'user',
    content: m.text,
  }))

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: await buildSystemPrompt() },
        ...history,
      ],
      max_tokens: 400,
      temperature: 0.8,
    })

    const rawReply = completion.choices[0]?.message?.content || 'Desculpe, tive um problema. Pode repetir?'
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || ''
    const products = await readCatalog()
    const reply = injectImages(rawReply, lastUserMsg, products)

    const plainReply = rawReply.replace(/\*+([^*]+)\*+/g, '$1') // remove asteriscos
    const isClosing = plainReply.includes(CLOSING_TRIGGER)
    const cartSummary = isClosing ? buildCartSummary(history, products) : null
    res.json({ message: reply, cartSummary })
  } catch (err) {
    console.error('API error:', err.message)

    if (err.status === 401) {
      return res.status(500).json({ error: 'Chave de API inválida. Verifique o arquivo .env' })
    }
    if (err.status === 429) {
      return res.status(500).json({ error: 'Limite de requisições atingido. Aguarde um momento.' })
    }
    res.status(500).json({ error: 'Erro ao conectar com a IA. Tente novamente.' })
  }
})

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', model: MODEL }))

// ─── API do catálogo (admin) ──────────────────────────────────────────────────
app.get('/api/catalog', async (_, res) => {
  const products = await readCatalog()
  res.json({ products, updatedAt: new Date().toISOString() })
})

app.post('/api/catalog', adminAuth, async (req, res) => {
  const row = productToDb({ ...req.body, id: Date.now().toString(), available: true })
  const { error } = await supabase.from('products').insert(row)
  if (error) return res.status(500).json({ error: error.message })
  invalidateCache()
  res.json(dbToProduct(row))
})

app.put('/api/catalog/:id', adminAuth, async (req, res) => {
  const { data: existing, error: fetchErr } = await supabase.from('products').select('*').eq('id', req.params.id).single()
  if (fetchErr || !existing) return res.status(404).json({ error: 'Não encontrado' })
  const updated = productToDb({ ...dbToProduct(existing), ...req.body, id: req.params.id })
  const { error } = await supabase.from('products').update(updated).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  invalidateCache()
  res.json(dbToProduct(updated))
})

app.delete('/api/catalog/:id', adminAuth, async (req, res) => {
  const { error } = await supabase.from('products').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  invalidateCache()
  res.json({ ok: true })
})

app.post('/api/upload', adminAuth, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo inválido' })
  const filename = Date.now() + extname(req.file.originalname).toLowerCase()
  const { error } = await supabase.storage.from('imagens').upload(filename, req.file.buffer, {
    contentType: req.file.mimetype, upsert: true,
  })
  if (error) return res.status(500).json({ error: error.message })
  res.json({ filename, url: `${STORAGE_URL}/${filename}` })
})

// ─── Auth do admin ────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const auth = req.headers.authorization
  if (auth && auth.startsWith('Basic ')) {
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
    if (user === 'admin' && pass === (process.env.ADMIN_PASSWORD || 'gagi1233')) return next()
  }
  res.set('WWW-Authenticate', 'Basic realm="Gagi Kids Admin"')
  res.status(401).send('Acesso restrito')
}

// ─── Painel Admin ─────────────────────────────────────────────────────────────
app.get('/admin', adminAuth, (_, res) => res.sendFile(join(__dirname, 'public/admin.html')))

// ─── Visualizador do catálogo ─────────────────────────────────────────────────
app.get('/catalogo', async (_, res) => {
  const catalogText = await getCatalog()

  const CATEGORY_COLORS = {
    'PROMOÇÃO':       { bg: '#fff3cd', border: '#ffc107', emoji: '🏷️' },
    'INTERMEDIÁRIO':  { bg: '#e8f4fd', border: '#2196F3', emoji: '✨' },
    'PREMIUM VINIL':  { bg: '#f3e5f5', border: '#9C27B0', emoji: '💎' },
    'SÓLIDO SILICONE':{ bg: '#e8f5e9', border: '#4CAF50', emoji: '⭐' },
    'SÓLIDO PREMIUM': { bg: '#fce4ec', border: '#E91E63', emoji: '👑' },
  }

  // Parse products from catalog text
  const products = []
  let currentCategory = 'Geral'
  const lines = catalogText.split('\n')

  for (const line of lines) {
    const catMatch = line.match(/CATEGORIA:\s*(.+?)\s*—/)
    if (catMatch) { currentCategory = catMatch[1].trim(); continue }

    const nameMatch = line.match(/^--- MODELO: (.+) ---$/)
    if (nameMatch) {
      products.push({ name: nameMatch[1], category: currentCategory, fields: {} })
      continue
    }
    if (products.length > 0) {
      const fieldMatch = line.match(/^(.+?):\s*(.+)$/)
      if (fieldMatch) products[products.length - 1].fields[fieldMatch[1].trim()] = fieldMatch[2].trim()
    }
  }

  const byCat = {}
  products.forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1 })

  const cards = products.map(p => {
    const catKey = Object.keys(CATEGORY_COLORS).find(k => p.category.toUpperCase().includes(k)) || 'PROMOÇÃO'
    const { border } = CATEGORY_COLORS[catKey] || CATEGORY_COLORS['PROMOÇÃO']
    const imgName = p.name.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const imgUrl = `/imagens/${imgName}.jpg`
    const price = p.fields['Preço'] || ''
    const sex = p.fields['Sexo'] || ''
    const size = p.fields['Tamanho'] || ''
    const sexBadgeClass = sex === 'Menina' ? 'badge-girl' : sex === 'Menino' ? 'badge-boy' : 'badge-both'
    const sexLabel = sex || 'Menina e Menino'

    return `
    <div class="card" data-name="${p.name.toLowerCase()}" data-cat="${p.category}" data-sex="${sex}">
      <div class="card-img-wrap" style="border-top: 3px solid ${border}">
        <img src="${imgUrl}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
        <div class="card-placeholder" style="display:none">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="32" cy="22" r="13" fill="#e0d6cc"/>
            <ellipse cx="32" cy="50" rx="18" ry="12" fill="#e0d6cc"/>
            <circle cx="27" cy="21" r="2" fill="#a0897a"/>
            <circle cx="37" cy="21" r="2" fill="#a0897a"/>
            <path d="M28 27 Q32 31 36 27" stroke="#c49a8a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          </svg>
        </div>
      </div>
      <div class="card-body">
        <div class="card-top">
          <span class="cat-badge" style="background:${border}20;color:${border};border:1px solid ${border}40">${p.category}</span>
          <span class="sex-badge ${sexBadgeClass}">${sexLabel}</span>
        </div>
        <h3 class="card-name">${p.name}</h3>
        <div class="card-price">${price}</div>
        ${size ? `<div class="card-size">${size}</div>` : ''}
      </div>
    </div>`
  }).join('')

  const catPills = ['', ...Object.keys(byCat)].map((c, i) =>
    `<button class="cat-pill ${i === 0 ? 'active' : ''}" onclick="setCat(this,'${c}')">${c || 'Todas'} <span class="pill-count">${c ? byCat[c] : products.length}</span></button>`
  ).join('')

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Catálogo Gagi Kids</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a1a }

    .header {
      background: linear-gradient(135deg, #075e54 0%, #0a8c7e 100%);
      color: white; padding: 24px 24px 20px;
    }
    .header-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 4px }
    .header-brand svg { width: 36px; height: 36px; opacity: .9 }
    .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -.3px }
    .header-sub { font-size: 12.5px; opacity: .75; margin-top: 2px }

    .toolbar {
      background: white; padding: 12px 20px; display: flex; flex-wrap: wrap;
      gap: 10px; align-items: center; border-bottom: 1px solid #e8e8e8;
      position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 4px rgba(0,0,0,.06)
    }
    .search-wrap { position: relative; flex: 1; min-width: 180px }
    .search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: #999 }
    #search { width: 100%; padding: 8px 12px 8px 32px; border: 1px solid #ddd; border-radius: 20px; font-size: 14px; outline: none; transition: border .15s }
    #search:focus { border-color: #075e54 }

    .pills { display: flex; gap: 6px; flex-wrap: wrap; align-items: center }
    .cat-pill {
      padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid #ddd; background: white; cursor: pointer; color: #555;
      transition: all .15s; white-space: nowrap
    }
    .cat-pill:hover { border-color: #075e54; color: #075e54 }
    .cat-pill.active { background: #075e54; border-color: #075e54; color: white }
    .pill-count { font-size: 11px; opacity: .75; margin-left: 3px }

    .sex-toggle { display: flex; border: 1px solid #ddd; border-radius: 20px; overflow: hidden }
    .sex-btn { padding: 5px 14px; font-size: 12px; font-weight: 500; border: none; background: white; cursor: pointer; color: #555; transition: all .15s }
    .sex-btn:hover { background: #f5f5f5 }
    .sex-btn.active-girl { background: #fce4ec; color: #c2185b; font-weight: 600 }
    .sex-btn.active-boy  { background: #e3f2fd; color: #1565c0; font-weight: 600 }
    .sex-btn.active-all  { background: #075e54; color: white; font-weight: 600 }

    .sort-select { padding: 6px 10px; border: 1px solid #ddd; border-radius: 20px; font-size: 12px; color: #555; background: white; cursor: pointer; outline: none }

    .result-bar { padding: 8px 20px; font-size: 12px; color: #888; background: #f8f8f8; border-bottom: 1px solid #eee }
    .result-bar b { color: #075e54 }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 14px; padding: 18px 20px }

    .card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,.07); transition: transform .15s, box-shadow .15s; display: flex; flex-direction: column }
    .card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(0,0,0,.12) }

    .card-img-wrap { height: 155px; overflow: hidden; background: #f5ede6; display: flex; align-items: center; justify-content: center; position: relative }
    .card-img-wrap img { width: 100%; height: 100%; object-fit: cover }
    .card-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center }
    .card-placeholder svg { width: 56px; height: 56px; opacity: .45 }

    .card-body { padding: 11px 12px 13px; display: flex; flex-direction: column; gap: 5px; flex: 1 }
    .card-top { display: flex; gap: 4px; flex-wrap: wrap }

    .cat-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 8px; white-space: nowrap; text-transform: uppercase; letter-spacing: .3px }
    .sex-badge { font-size: 10px; font-weight: 500; padding: 2px 7px; border-radius: 8px }
    .badge-girl { background: #fce4ec; color: #c2185b }
    .badge-boy  { background: #e3f2fd; color: #1565c0 }
    .badge-both { background: #f3f3f3; color: #777 }

    .card-name { font-size: 14px; font-weight: 700; line-height: 1.3; color: #111; margin-top: 2px }
    .card-price { font-size: 16px; font-weight: 800; color: #075e54 }
    .card-size  { font-size: 11px; color: #999 }

    .hidden { display: none !important }
    .empty { grid-column: 1/-1; text-align: center; padding: 48px 20px; color: #aaa; font-size: 15px }

    @media(max-width:600px) {
      .grid { padding: 12px; gap: 10px }
      .grid { grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)) }
      .header { padding: 16px }
      .toolbar { padding: 10px 12px }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="20" cy="14" r="9" fill="white" opacity=".9"/>
        <ellipse cx="20" cy="31" rx="12" ry="8" fill="white" opacity=".9"/>
        <circle cx="17" cy="13" r="1.5" fill="#075e54"/>
        <circle cx="23" cy="13" r="1.5" fill="#075e54"/>
        <path d="M17 17.5 Q20 20 23 17.5" stroke="#075e54" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      </svg>
      <h1>Gagi Kids</h1>
    </div>
    <div class="header-sub">Catálogo de Bonecas Reborn Artesanais &nbsp;·&nbsp; +55 19 99411-3777</div>
  </div>

  <div class="toolbar">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <input type="text" id="search" placeholder="Buscar boneca..." oninput="applyFilters()"/>
    </div>
    <div class="pills" id="catPills">${catPills}</div>
    <div class="sex-toggle">
      <button class="sex-btn active-all" id="sexAll"  onclick="setSex('all',  this)">Todas</button>
      <button class="sex-btn"            id="sexGirl" onclick="setSex('girl', this)">Menina</button>
      <button class="sex-btn"            id="sexBoy"  onclick="setSex('boy',  this)">Menino</button>
    </div>
    <select class="sort-select" id="sortSel" onchange="applyFilters()">
      <option value="">Ordenar</option>
      <option value="asc">Menor preço</option>
      <option value="desc">Maior preço</option>
      <option value="name">Nome A–Z</option>
    </select>
  </div>

  <div class="result-bar" id="resultBar">Mostrando <b>${products.length}</b> produtos</div>

  <div class="grid" id="grid">${cards}</div>

  <script>
    let activeCat = '', activeSex = 'all'

    function setCat(btn, cat) {
      activeCat = cat
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      applyFilters()
    }

    function setSex(sex, btn) {
      activeSex = sex
      document.querySelectorAll('.sex-btn').forEach(b => { b.className = 'sex-btn' })
      btn.classList.add(sex === 'girl' ? 'active-girl' : sex === 'boy' ? 'active-boy' : 'active-all')
      applyFilters()
    }

    function parsePrice(text) {
      const m = text.match(/\\d[\\d.,]*/)
      return m ? parseFloat(m[0].replace('.','').replace(',','.')) : 0
    }

    function applyFilters() {
      const q = document.getElementById('search').value.toLowerCase().trim()
      const sort = document.getElementById('sortSel').value
      const cards = [...document.querySelectorAll('.card')]

      // filtro
      cards.forEach(card => {
        const name = card.dataset.name
        const cat  = card.dataset.cat
        const sex  = card.dataset.sex
        const matchQ   = !q || name.includes(q)
        const matchCat = !activeCat || cat === activeCat
        const matchSex = activeSex === 'all' || (activeSex === 'girl' && sex === 'Menina') || (activeSex === 'boy' && sex === 'Menino')
        card.classList.toggle('hidden', !(matchQ && matchCat && matchSex))
      })

      // ordenação
      if (sort) {
        const grid = document.getElementById('grid')
        const visible = cards.filter(c => !c.classList.contains('hidden'))
        visible.sort((a, b) => {
          if (sort === 'name') return a.dataset.name.localeCompare(b.dataset.name)
          const pa = parsePrice(a.querySelector('.card-price')?.textContent || '0')
          const pb = parsePrice(b.querySelector('.card-price')?.textContent || '0')
          return sort === 'asc' ? pa - pb : pb - pa
        })
        visible.forEach(c => grid.appendChild(c))
      }

      // contagem
      const visible = cards.filter(c => !c.classList.contains('hidden')).length
      const emptyEl = document.getElementById('emptyMsg')
      if (visible === 0) {
        if (!emptyEl) {
          const d = document.createElement('div')
          d.id = 'emptyMsg'; d.className = 'empty'
          d.textContent = 'Nenhuma boneca encontrada para esse filtro.'
          document.getElementById('grid').appendChild(d)
        }
      } else {
        emptyEl?.remove()
      }
      document.getElementById('resultBar').innerHTML = 'Mostrando <b>' + visible + '</b> de ${products.length} produtos'
    }
  </script>
</body>
</html>`)
})

export default app

// Desenvolvimento local: só escuta se não estiver no Vercel
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`✅ Servidor da Gaby rodando em http://localhost:${PORT}`)
    console.log(`   Modelo: ${MODEL}`)
    console.log(`   Base URL: ${process.env.API_BASE_URL || 'https://api.deepseek.com'}`)
  })
}
