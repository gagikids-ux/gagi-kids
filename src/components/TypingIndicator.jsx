import './TypingIndicator.css'

export default function TypingIndicator() {
  return (
    <div className="bubble-wrapper bubble-wrapper--agent">
      <div className="bubble bubble--agent bubble--first typing-bubble">
        <div className="typing-dots">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      </div>
    </div>
  )
}
