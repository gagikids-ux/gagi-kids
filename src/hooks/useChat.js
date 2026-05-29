import { useState, useCallback, useRef, useEffect } from 'react'

const AGENT_NAME = 'Gaby s2'
const WHATSAPP_NUMBER = '5519994113777'
const CLOSING_TRIGGER = 'Vou te encaminhar pra Gi'

const GREETING = 'Olá! Seja bem-vinda à Gagi Kids! Sou a Gaby, sua consultora de bonecas reborn. 😊\n\nPosso te ajudar a encontrar a bonecinha perfeita. Me conta: é pra você ou é um presente especial?'

function buildWhatsAppUrl(cartSummary) {
  const lines = ['Olá! 👋 Escolhi minha bebê com sua assistente e vim finalizar o pagamento com você!\n']

  if (cartSummary?.product) {
    const p = cartSummary.product
    const price = p.priceDisplay || `R$ ${p.price}`
    lines.push(`🛍️ Bebê: ${p.name} (${price})`)
  }
  if (cartSummary?.frete)    lines.push(`🚚 Frete: ${cartSummary.frete}`)
  if (cartSummary?.total)    lines.push(`💰 Total: ${cartSummary.total}`)
  if (cartSummary?.payment)  lines.push(`💳 Pagamento: ${cartSummary.payment}`)
  if (cartSummary?.delivery) lines.push(`📦 Entrega: ${cartSummary.delivery}`)

  lines.push('\nPode confirmar os detalhes? 😊')
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`
}

const CANT_READ_PATTERNS = [
  /n[aã]o\s+sei\s+(ler|escrever)/i,
  /n[aã]o\s+consigo\s+(ler|escrever)/i,
  /sou\s+analfabet[ao]/i,
  /n[aã]o\s+sei\s+ler/i,
  /l[eê]\s+pra\s+mim/i,
  /leia\s+pra\s+mim/i,
  /pode\s+(ler|falar)\s+pra\s+mim/i,
]

function detectCantRead(text) {
  return CANT_READ_PATTERNS.some(p => p.test(text))
}

function cleanForSpeech(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')          // imagens markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')              // **negrito**
    .replace(/\*([^*]+)\*/g, '$1')                  // *itálico*
    .replace(/\*/g, '')                              // asteriscos restantes
    .replace(/https?:\/\/\S+/g, '')                 // URLs
    // abreviações → forma por extenso para leitura correta
    .replace(/R\$\s*(\d+(?:[.,]\d+)?)/g, '$1 reais')
    .replace(/(\d+(?:[.,]\d+)?)\s*cm\b/gi, '$1 centímetros')
    .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi, '$1 quilos')
    .replace(/(\d+(?:[.,]\d+)?)\s*g\b/g, '$1 gramas')
    .replace(/\b(\d+)\s*x\b/gi, '$1 vezes')
    // emojis
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '') // pares substitutos (🥰🎉 etc)
    .replace(/[☀-➿]/g, '')                // símbolos miscelâneos
    .replace(/[⌀-⏿]/g, '')                // símbolos técnicos
    .replace(/[⬀-⯿]/g, '')                // setas e formas
    .replace(/️/g, '')                         // seletor de variação emoji
    .replace(/‍/g, '')                         // zero-width joiner
    // pausas: linhas sem pontuação final recebem ponto antes da quebra
    .replace(/([^.!?,\n])\n/g, '$1. ')
    .replace(/\n/g, ' ')
    .replace(/\.{2,}/g, '.')  // reticências → ponto simples
    .replace(/\s+/g, ' ')
    .trim()
}

function pickFemaleVoice(voices) {
  const femaleNames = ['maria', 'luciana', 'vitoria', 'fernanda', 'brazil female', 'feminina', 'female']
  // voz feminina pt-BR por nome
  const byName = voices.find(v =>
    v.lang.startsWith('pt') && femaleNames.some(n => v.name.toLowerCase().includes(n))
  )
  if (byName) return byName
  // qualquer pt-BR
  return voices.find(v => v.lang === 'pt-BR')
    || voices.find(v => v.lang.startsWith('pt'))
    || null
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const clean = cleanForSpeech(text)
  if (!clean) return

  const utter = new SpeechSynthesisUtterance(clean)
  utter.lang = 'pt-BR'
  utter.rate = 0.92
  utter.pitch = 1.1

  const doSpeak = () => {
    const voice = pickFemaleVoice(window.speechSynthesis.getVoices())
    if (voice) utter.voice = voice
    window.speechSynthesis.speak(utter)
  }

  // getVoices() pode retornar vazio antes do evento onvoiceschanged
  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak()
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null
      doSpeak()
    }
  }
}

function getTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function makeMessage(text, sender) {
  return {
    id: Date.now() + Math.random(),
    text,
    sender,
    time: getTime(),
    status: sender === 'agent' ? 'read' : 'sent',
  }
}

export function useChat() {
  const [messages, setMessages] = useState([makeMessage(GREETING, 'agent')])
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState(null)
  const [audioMode, setAudioMode] = useState(false)
  const [countdown, setCountdown] = useState(null) // null = não redirecionando
  const historyRef = useRef([makeMessage(GREETING, 'agent')])
  const audioModeRef = useRef(false)
  const whatsappUrlRef = useRef(null)

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      window.location.href = whatsappUrlRef.current
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const toggleAudio = useCallback(() => {
    setAudioMode(prev => {
      const next = !prev
      audioModeRef.current = next
      if (!next) window.speechSynthesis?.cancel()
      return next
    })
  }, [])

  const enableAudio = useCallback(() => {
    setAudioMode(true)
    audioModeRef.current = true
  }, [])

  const sendMessage = useCallback(async (text) => {
    setError(null)
    window.speechSynthesis?.cancel()

    // detecta se cliente não sabe ler e ativa modo áudio automaticamente
    if (detectCantRead(text)) enableAudio()

    const userMsg = makeMessage(text, 'user')
    const updatedHistory = [...historyRef.current, userMsg]
    historyRef.current = updatedHistory

    setMessages(updatedHistory)
    setIsTyping(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedHistory }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro desconhecido')
      }

      const agentMsg = makeMessage(data.message, 'agent')
      const plainMsg = data.message.replace(/\*+([^*]+)\*+/g, '$1')
      if (data.cartSummary !== undefined && plainMsg.includes(CLOSING_TRIGGER)) {
        const url = buildWhatsAppUrl(data.cartSummary)
        agentMsg.whatsappUrl = url
        whatsappUrlRef.current = url
        setCountdown(3)
      }
      const finalHistory = [...updatedHistory, agentMsg]
      historyRef.current = finalHistory
      setMessages(finalHistory)

      if (audioModeRef.current) speak(data.message)
    } catch (err) {
      console.error(err)
      setError(err.message)
      const errorMsg = makeMessage(
        'Desculpe, tive uma dificuldade técnica. Pode tentar novamente? 😊',
        'agent'
      )
      const finalHistory = [...updatedHistory, errorMsg]
      historyRef.current = finalHistory
      setMessages(finalHistory)
      if (audioModeRef.current) speak(errorMsg.text)
    } finally {
      setIsTyping(false)
    }
  }, [enableAudio])

  return { messages, isTyping, error, sendMessage, agentName: AGENT_NAME, audioMode, toggleAudio, countdown }
}
