/**
 * Importador de Catálogo WhatsApp
 * --------------------------------
 * Abre o catálogo público com um browser real, intercepta as chamadas de API
 * e extrai todos os produtos automaticamente para o arquivo src/catalog.js
 *
 * Como usar:
 *   npm run importar
 */

import puppeteer from 'puppeteer'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const CATALOG_URL = 'https://www.whatsapp.com/catalog/5519994113777/?app_absent=0'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '../src/catalog.js')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price) {
  if (!price && price !== 0) return 'consultar'
  const num = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''))
  if (isNaN(num)) return String(price)
  return `R$ ${(num / 1000).toFixed(2).replace('.', ',')}`
}

function buildCatalogJs(products) {
  const lines = products.map(p => {
    const parts = [`--- MODELO: ${p.name} ---`]
    if (p.price)       parts.push(`Preço: ${p.price}`)
    if (p.description) parts.push(`Descrição: ${p.description}`)
    if (p.currency)    parts.push(`Moeda: ${p.currency}`)
    return parts.join('\n')
  }).join('\n\n')

  return `/*
  CATÁLOGO GAGI KIDS — gerado automaticamente
  Última atualização: ${new Date().toLocaleString('pt-BR')}
  Total de produtos: ${products.length}

  Para atualizar, rode novamente: npm run importar
*/

export const CATALOG = \`
CATÁLOGO GAGI KIDS — BONECAS REBORN ARTESANAIS
===============================================

📞 WhatsApp: +55 19 99411-3777
🛍️ Catálogo: https://wa.me/c/5519994113777
📦 Entregamos para todo o Brasil
💳 PIX (5% desconto), cartão em até 12x, boleto

-----------------------------------------------

${lines}

-----------------------------------------------
INFORMAÇÕES GERAIS:
- Todas as bonecas são 100% artesanais, feitas à mão
- Cada peça é única — pequenas variações fazem parte do charme
- Frete calculado pelo CEP após confirmação do pedido
- Trocas e devoluções: 7 dias corridos após recebimento
- Atendimento: segunda a sábado, 9h às 18h
\`
`
}

// ─── Extração via interceptação de rede ──────────────────────────────────────

async function extrairViaRede(page) {
  const produtos = []

  page.on('response', async (response) => {
    const url = response.url()
    const ct  = response.headers()['content-type'] || ''

    if (!ct.includes('json')) return

    // Filtra só chamadas relacionadas ao catálogo/produtos
    const relevant = ['catalog', 'product', 'item', 'biz', 'commerce', 'inventory']
    if (!relevant.some(k => url.toLowerCase().includes(k))) return

    try {
      const json = await response.json()
      const text = JSON.stringify(json)

      // Só processa se parecer ter dados de produto
      if (!text.includes('name') && !text.includes('price')) return

      console.log(`  → API encontrada: ${url.slice(0, 80)}...`)

      // Tenta extrair array de produtos de diferentes estruturas de resposta
      const candidates = [
        json?.products,
        json?.data?.products,
        json?.catalog?.products,
        json?.items,
        json?.data?.items,
        Array.isArray(json) ? json : null,
      ].filter(Boolean)

      for (const list of candidates) {
        if (!Array.isArray(list) || list.length === 0) continue

        list.forEach(item => {
          const name = item.name || item.title || item.product_name
          if (!name) return

          const rawPrice = item.price ?? item.retailer_price ?? item.sale_price
          const currency = item.currency || item.price_currency || 'BRL'

          produtos.push({
            name:        name.trim(),
            price:       rawPrice != null ? formatPrice(rawPrice) : null,
            currency,
            description: (item.description || item.short_description || '').trim() || null,
            imageUrl:    item.image_url || item.image || item.thumbnail_url || null,
          })
        })

        if (produtos.length > 0) {
          console.log(`  ✅ ${produtos.length} produtos extraídos da API`)
        }
      }
    } catch (_) {}
  })

  return produtos
}

// ─── Extração via DOM (fallback) ─────────────────────────────────────────────

async function extrairViaDom(page) {
  return page.evaluate(() => {
    const produtos = []

    // Seletores candidatos para cards de produto em páginas WhatsApp
    const seletoresCard = [
      '[data-testid="catalog-product-item"]',
      '[data-testid="product-item"]',
      '[class*="CatalogItem"]',
      '[class*="ProductItem"]',
      '[class*="product-item"]',
      '[class*="catalog-item"]',
      'li[class*="item"]',
    ]

    let cards = []
    for (const sel of seletoresCard) {
      cards = [...document.querySelectorAll(sel)]
      if (cards.length > 0) break
    }

    if (cards.length === 0) {
      // Tenta qualquer elemento que pareça ter nome + preço juntos
      document.querySelectorAll('div, li, article').forEach(el => {
        const text = el.innerText || ''
        if (text.includes('R$') && text.length < 400) {
          cards.push(el)
        }
      })
    }

    cards.forEach(card => {
      const seletoresNome  = ['[data-testid*="name"]','h1','h2','h3','h4','[class*="name"]','[class*="title"]']
      const seletoresPreco = ['[data-testid*="price"]','[class*="price"]','span[class*="Price"]']
      const seletoresDesc  = ['[data-testid*="desc"]','[class*="desc"]','p']

      const nome  = seletoresNome .reduce((v, s) => v || card.querySelector(s)?.innerText?.trim(), '')
      const preco = seletoresPreco.reduce((v, s) => v || card.querySelector(s)?.innerText?.trim(), '')
      const desc  = seletoresDesc .reduce((v, s) => v || card.querySelector(s)?.innerText?.trim(), '')
      const img   = card.querySelector('img')?.src

      if (nome) produtos.push({ name: nome, price: preco || null, description: desc || null, imageUrl: img || null })
    })

    return produtos
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 Iniciando importação do catálogo WhatsApp...')
  console.log(`   URL: ${CATALOG_URL}\n`)

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  // Começa a monitorar a rede ANTES de navegar
  const produtosRede = await extrairViaRede(page)

  console.log('🌐 Carregando página...')
  await page.goto(CATALOG_URL, { waitUntil: 'networkidle2', timeout: 45000 })

  // Aguarda mais um pouco para chamadas de API tardias
  await new Promise(r => setTimeout(r, 5000))

  // Scroll para forçar carregamento de produtos com lazy loading
  console.log('📜 Scrollando para carregar todos os produtos...')
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 600)
      await new Promise(r => setTimeout(r, 500))
    }
    window.scrollTo(0, 0)
  })

  await new Promise(r => setTimeout(r, 2000))

  // Tenta DOM se a rede não trouxe resultados
  let produtos = produtosRede.length > 0 ? produtosRede : await extrairViaDom(page)

  // Remove duplicatas por nome
  const vistos = new Set()
  produtos = produtos.filter(p => {
    if (vistos.has(p.name)) return false
    vistos.add(p.name)
    return true
  })

  await browser.close()

  // ─── Resultado ──────────────────────────────────────────────────────────────

  if (produtos.length === 0) {
    console.log('\n⚠️  Nenhum produto extraído automaticamente.')
    console.log('   O WhatsApp pode ter bloqueado o acesso.')
    console.log('   Solução: preencha o src/catalog.js manualmente ou envie prints dos produtos.')
    process.exit(1)
  }

  console.log(`\n✅ ${produtos.length} produto(s) encontrado(s):\n`)
  produtos.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name}${p.price ? ` — ${p.price}` : ''}`)
    if (p.description) console.log(`     ${p.description.slice(0, 80)}...`)
  })

  const conteudo = buildCatalogJs(produtos)
  writeFileSync(OUTPUT_PATH, conteudo, 'utf-8')

  console.log(`\n💾 Catálogo salvo em: src/catalog.js`)
  console.log('   Reinicie o servidor (npm start) para aplicar as mudanças.\n')
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message)
  process.exit(1)
})
