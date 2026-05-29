import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function productToDb(p) {
  return {
    id:            p.id,
    name:          p.name          || '',
    category:      p.category      || '',
    sex:           p.sex           || 'Menina',
    price:         Number(p.price) || 0,
    price_display: p.priceDisplay  || '',
    size:          p.size          || '',
    weight:        p.weight        || '',
    body_type:     p.bodyType      || 'pano',
    eyes:          p.eyes          || 'abertos',
    hair:          p.hair          || 'pintado',
    material:      p.material      || '',
    description:   p.description   || '',
    includes:      p.includes      || '',
    notes:         p.notes         || '',
    photo:         p.photo         || '',
    available:     p.available !== false,
    ready_stock:   p.readyStock    || false,
  }
}

async function main() {
  console.log('🚀 Iniciando setup do Supabase...\n')

  // 1. Criar bucket de imagens (público)
  console.log('📦 Criando bucket "imagens"...')
  const { error: bucketErr } = await supabase.storage.createBucket('imagens', {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    fileSizeLimit: 8 * 1024 * 1024,
  })
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    console.error('❌ Erro ao criar bucket:', bucketErr.message)
  } else {
    console.log('✅ Bucket pronto\n')
  }

  // 2. Upload das fotos locais
  const imgDir = join(ROOT, 'imagens')
  if (existsSync(imgDir)) {
    const files = readdirSync(imgDir).filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    console.log(`🖼️  Enviando ${files.length} fotos para o Supabase Storage...`)
    for (const file of files) {
      const buffer = readFileSync(join(imgDir, file))
      const mime = file.endsWith('.png') ? 'image/png'
                 : file.endsWith('.gif') ? 'image/gif'
                 : file.endsWith('.webp') ? 'image/webp'
                 : 'image/jpeg'
      const { error } = await supabase.storage.from('imagens').upload(file, buffer, {
        contentType: mime, upsert: true,
      })
      if (error) console.warn(`  ⚠️  ${file}: ${error.message}`)
      else       console.log(`  ✅ ${file}`)
    }
    console.log()
  }

  // 3. Migrar catalog.json → tabela products
  const catalogPath = join(ROOT, 'catalog.json')
  if (!existsSync(catalogPath)) {
    console.log('⚠️  catalog.json não encontrado, pulando migração de produtos.')
    return
  }

  const { products } = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  console.log(`📋 Migrando ${products.length} produtos para Supabase...`)

  const rows = products.map(productToDb)
  const { error: insertErr } = await supabase.from('products').upsert(rows, { onConflict: 'id' })
  if (insertErr) {
    console.error('❌ Erro ao inserir produtos:', insertErr.message)
  } else {
    console.log(`✅ ${rows.length} produtos migrados com sucesso!\n`)
  }

  console.log('🎉 Setup concluído!')
  console.log(`🔗 Storage público: ${process.env.SUPABASE_URL}/storage/v1/object/public/imagens/`)
}

main().catch(console.error)
