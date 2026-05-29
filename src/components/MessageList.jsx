import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'
import './MessageList.css'

export default function MessageList({ messages, isTyping }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="message-list">
      <div className="date-separator">
        <span>Hoje</span>
      </div>

      {messages.map((msg, index) => {
        const prev = messages[index - 1]
        const isFirst = !prev || prev.sender !== msg.sender
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isFirst={isFirst}
          />
        )
      })}

      {isTyping && <TypingIndicator />}

      <div ref={bottomRef} className="scroll-anchor" />
    </div>
  )
}
