import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function parsePrice(s) {
  const m = (s || '').match(/R\$\s*([\d.,]+)/)
  return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0
}

function bodyType(category, material) {
  const cat = category.toUpperCase()
  const mat = (material || '').toLowerCase()
  if (cat.includes('SÓLIDO') || mat.includes('sólido') || mat.includes('solido')) return 'solido'
  return 'pano'
}

function eyes(description, name) {
  const t = ((description || '') + ' ' + (name || '')).toLowerCase()
  if (/fechad|dormind|sono|sleep|olho.*fech/.test(t)) return 'fechados'
  return 'abertos'
}

function hair(material, description, extraFields) {
  const t = ((material || '') + ' ' + (description || '') + ' ' + (extraFields || '')).toLowerCase()
  if (/enraizado|implantado|fio a fio|rooted/.test(t)) return 'implantado'
  if (/sem cabelo|careca|bald/.test(t)) return 'sem_cabelo'
  return 'pintado'
}

const src = readFileSync(join(__dirname, '../src/catalog.js'), 'utf-8')
const match = src.match(/export const CATALOG = `([\s\S]*?)`/)
if (!match) throw new Error('CATALOG not found')

const text = match[1]
const products = []
let currentCategory = 'PROMOÇÃO'
let currentProduct = null

for (const line of text.split('\n')) {
  const catMatch = line.match(/CATEGORIA:\s*([A-ZÁÉÍÓÚÃÕ\s]+?)\s*—/)
  if (catMatch) { currentCategory = catMatch[1].trim(); continue }

  const nameMatch = line.match(/^---\s*MODELO:\s*(.+?)\s*---$/)
  if (nameMatch) {
    if (currentProduct) products.push(currentProduct)
    const rawName = nameMatch[1].replace(/[\u{1F300}-\u{1FFFF}]/gu, '').replace(/[☀-➿]/g, '').trim()
    currentProduct = { name: rawName, category: currentCategory, fields: {}, extra: [] }
    continue
  }

  if (currentProduct) {
    const fm = line.match(/^(.+?):\s*(.+)$/)
    if (fm) currentProduct.fields[fm[1].trim()] = fm[2].trim()
  }
}
if (currentProduct) products.push(currentProduct)

const output = products.map((p, i) => {
  const sex = (p.fields['Sexo'] || '').replace(/[^\w\s]/gu, '').trim() || 'Menina'
  const mat = p.fields['Material'] || ''
  const desc = p.fields['Aparência'] || ''
  const cabelo = p.fields['Cabelo'] || ''
  const priceStr = (p.fields['Preço'] || '').replace(/\s*\(.*?\)/g, '').trim()
  const size = (p.fields['Tamanho'] || '').split('|')[0].replace('~', '').trim()
  const weight = (p.fields['Tamanho'] || '').split('|')[1]?.replace('Peso:', '').replace('~', '').trim() || p.fields['Peso'] || ''

  return {
    id: slugify(p.name) + '-' + (i + 1),
    name: p.name,
    category: p.category,
    sex: sex.includes('Menino') ? 'Menino' : 'Menina',
    price: parsePrice(priceStr),
    priceDisplay: priceStr,
    size,
    weight,
    bodyType: bodyType(p.category, mat),
    eyes: eyes(desc, p.name),
    hair: hair(mat, desc, cabelo),
    material: mat,
    description: desc,
    includes: p.fields['Inclui'] || '',
    notes: [p.fields['Observação'], p.fields['Ideal para'], p.fields['Diferencial']].filter(Boolean).join(' | '),
    photo: '',
    available: true,
    readyStock: false,
  }
})

writeFileSync(
  join(__dirname, '../catalog.json'),
  JSON.stringify({ updatedAt: new Date().toISOString(), products: output }, null, 2),
  'utf-8'
)
console.log(`✅ ${output.length} produtos migrados → catalog.json`)
