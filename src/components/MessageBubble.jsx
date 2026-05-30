import './MessageBubble.css'

// Detecta imagens ![alt](url), vídeos [video:url] e texto
function parseContent(text) {
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|\[video:([^\]]+)\]/g
  const parts = []
  let last = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) })
    if (match[1] !== undefined) {
      parts.push({ type: 'image', alt: match[1], url: match[2] })
    } else {
      parts.push({ type: 'video', url: match[3] })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts.length ? parts : [{ type: 'text', content: text }]
}

function formatText(text) {
  const combined = /(\*[^*]+\*|https?:\/\/[^\s]+)/g
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(combined)
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>
    }
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="bubble-link">{part}</a>
    }
    return part.split('\n').map((line, j, arr) =>
      j < arr.length - 1 ? [line, <br key={`br-${i}-${j}`} />] : line
    )
  })
}

const CheckIcon = ({ status }) => {
  if (status === 'sent') {
    return (
      <svg className="check-icon" viewBox="0 0 16 15" fill="currentColor">
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z"/>
      </svg>
    )
  }
  return (
    <svg className="check-icon check-read" viewBox="0 0 16 15" fill="currentColor">
      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
    </svg>
  )
}

function PhotoGallery({ images }) {
  if (images.length === 1) {
    return (
      <img
        src={images[0].url}
        alt={images[0].alt || 'produto'}
        className="bubble-image"
        onError={e => { e.target.style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`bubble-gallery bubble-gallery--${Math.min(images.length, 3)}`}>
      {images.map((img, i) => (
        <img
          key={i}
          src={img.url}
          alt={img.alt || 'produto'}
          className="gallery-img"
          onError={e => { e.target.parentElement?.classList.add('img-error'); e.target.style.display = 'none' }}
        />
      ))}
    </div>
  )
}

export default function MessageBubble({ message, isFirst }) {
  const isAgent = message.sender === 'agent'
  const parts = parseContent(message.text)

  const images = parts.filter(p => p.type === 'image')
  const videos = parts.filter(p => p.type === 'video')
  const textParts = parts.filter(p => p.type === 'text')

  const hasMedia = images.length > 0 || videos.length > 0

  return (
    <div className={`bubble-wrapper ${isAgent ? 'bubble-wrapper--agent' : 'bubble-wrapper--user'}`}>
      <div className={`bubble ${isAgent ? 'bubble--agent' : 'bubble--user'} ${isFirst ? 'bubble--first' : ''} ${hasMedia ? 'bubble--has-image' : ''}`}>
        {textParts.map((part, i) =>
          <p key={i} className="bubble-text">{formatText(part.content)}</p>
        )}
        {images.length > 0 && <PhotoGallery images={images} />}
        {videos.map((v, i) => (
          <video
            key={i}
            src={v.url}
            controls
            playsInline
            className="bubble-video"
            onError={e => { e.target.style.display = 'none' }}
          />
        ))}
        <div className="bubble-meta">
          <span className="bubble-time">{message.time}</span>
          {!isAgent && <CheckIcon status={message.status} />}
        </div>
      </div>
      {message.whatsappUrl && (
        <a
          href={message.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="whatsapp-cta"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Falar com a Gaby no WhatsApp
        </a>
      )}
    </div>
  )
}
