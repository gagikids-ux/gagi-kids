import { useState, useRef, useEffect, useCallback } from 'react'
import './MessageInput.css'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const hasSpeech = !!SpeechRecognition

export default function MessageInput({ onSend, disabled }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)
  const committedRef = useRef('')

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [text])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
    setInterim('')
  }, [])

  const startListening = useCallback(() => {
    if (!hasSpeech) return
    committedRef.current = text

    const rec = new SpeechRecognition()
    rec.lang = 'pt-BR'
    rec.interimResults = true
    rec.continuous = false
    recognitionRef.current = rec

    rec.onresult = (e) => {
      let interimText = ''
      let finalText = committedRef.current
      for (const result of e.results) {
        if (result.isFinal) {
          finalText += (finalText ? ' ' : '') + result[0].transcript
          committedRef.current = finalText
          interimText = ''
        } else {
          interimText += result[0].transcript
        }
      }
      setText(finalText)
      setInterim(interimText)
    }

    rec.onend = () => {
      setListening(false)
      setInterim('')
      recognitionRef.current = null
      // foca no textarea para o usuário poder editar/enviar
      textareaRef.current?.focus()
    }

    rec.onerror = () => {
      setListening(false)
      setInterim('')
      recognitionRef.current = null
    }

    rec.start()
    setListening(true)
  }, [text])

  const toggleVoice = () => {
    if (listening) stopListening()
    else startListening()
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    if (listening) stopListening()
    onSend(trimmed)
    setText('')
    committedRef.current = ''
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasText = text.trim().length > 0
  const displayPlaceholder = listening ? (interim || 'Ouvindo...') : 'Mensagem'

  return (
    <div className="input-bar">
      <button className="input-icon-btn" aria-label="Emoji">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
        </svg>
      </button>

      <button className="input-icon-btn" aria-label="Anexo">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6h-1.5v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/>
        </svg>
      </button>

      <div className={`input-field-wrapper ${listening ? 'input-field-wrapper--listening' : ''}`}>
        <textarea
          ref={textareaRef}
          className="input-field"
          placeholder={displayPlaceholder}
          value={text}
          onChange={e => { setText(e.target.value); committedRef.current = e.target.value }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
        />
        {listening && !text && (
          <span className="listening-interim">{interim}</span>
        )}
      </div>

      {hasSpeech && !hasText && (
        <button
          className={`input-icon-btn mic-btn ${listening ? 'mic-btn--active' : ''}`}
          onClick={toggleVoice}
          disabled={disabled}
          aria-label={listening ? 'Parar gravação' : 'Falar mensagem'}
        >
          {listening ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          )}
        </button>
      )}

      <button
        className={`send-btn ${hasText ? 'send-btn--active' : ''}`}
        onClick={hasText ? handleSend : undefined}
        disabled={disabled || !hasText}
        aria-label="Enviar"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>
  )
}
