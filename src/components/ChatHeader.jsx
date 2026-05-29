import './ChatHeader.css'

function RebornAvatar() {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Background */}
      <circle cx="50" cy="50" r="50" fill="#f9efe6"/>
      {/* Hair back */}
      <ellipse cx="50" cy="27" rx="33" ry="22" fill="#7a4a28"/>
      <ellipse cx="17" cy="44" rx="10" ry="16" fill="#7a4a28"/>
      <ellipse cx="83" cy="44" rx="10" ry="16" fill="#7a4a28"/>
      {/* Face */}
      <ellipse cx="50" cy="57" rx="31" ry="29" fill="#f2c49a"/>
      {/* Forehead */}
      <ellipse cx="50" cy="40" rx="25" ry="17" fill="#f2c49a"/>
      {/* Hair front fringe */}
      <path d="M25 36 Q50 18 75 36 Q60 28 50 30 Q40 28 25 36Z" fill="#7a4a28"/>
      {/* Eyebrows */}
      <path d="M31 48 Q37 44 43 46" stroke="#5a3415" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M57 46 Q63 44 69 48" stroke="#5a3415" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Eyes */}
      <ellipse cx="38" cy="54" rx="5.5" ry="6.5" fill="#2a1508"/>
      <ellipse cx="62" cy="54" rx="5.5" ry="6.5" fill="#2a1508"/>
      {/* Iris */}
      <ellipse cx="38" cy="54" rx="4" ry="4.5" fill="#5c3a1e"/>
      <ellipse cx="62" cy="54" rx="4" ry="4.5" fill="#5c3a1e"/>
      {/* Eye shine */}
      <circle cx="40" cy="52" r="1.8" fill="white"/>
      <circle cx="64" cy="52" r="1.8" fill="white"/>
      {/* Nose */}
      <ellipse cx="50" cy="64" rx="3.5" ry="2.5" fill="#e09a72"/>
      <ellipse cx="47.5" cy="65" rx="1.2" ry="1.2" fill="#c8825a"/>
      <ellipse cx="52.5" cy="65" rx="1.2" ry="1.2" fill="#c8825a"/>
      {/* Cheeks */}
      <ellipse cx="25" cy="67" rx="9" ry="6" fill="#f4a0a0" opacity="0.55"/>
      <ellipse cx="75" cy="67" rx="9" ry="6" fill="#f4a0a0" opacity="0.55"/>
      {/* Mouth */}
      <path d="M41 74 Q50 82 59 74" stroke="#c8705e" strokeWidth="2.5" fill="#e8927e" strokeLinecap="round"/>
      {/* Hair curl detail */}
      <path d="M29 35 Q24 42 27 50" stroke="#6a3c20" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M71 35 Q76 42 73 50" stroke="#6a3c20" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export default function ChatHeader({ agentName, audioMode, onToggleAudio }) {
  return (
    <header className="chat-header">
      <div className="header-left">
        <div className="avatar">
          <RebornAvatar />
        </div>
        <div className="header-info">
          <span className="header-name">{agentName}</span>
          <span className="header-status">
            <span className="status-dot" />
            online
          </span>
        </div>
      </div>

      <div className="header-actions">
        <button
          className={`icon-btn ${audioMode ? 'icon-btn--audio-on' : ''}`}
          onClick={onToggleAudio}
          aria-label={audioMode ? 'Desativar leitura em voz alta' : 'Ativar leitura em voz alta'}
          title={audioMode ? 'Leitura em voz alta: ativada' : 'Leitura em voz alta: desativada'}
        >
          {audioMode ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
          )}
        </button>
        <button className="icon-btn" aria-label="Mais opções">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
          </svg>
        </button>
      </div>
    </header>
  )
}
