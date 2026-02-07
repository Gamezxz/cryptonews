"use client";

import { useState, useRef, useEffect } from "react";

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:13002";
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-6);
      const res = await fetch(`${getBaseUrl()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const json = await res.json();

      if (json.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.answer,
            sources: json.sources || [],
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.error || "เกิดข้อผิดพลาด กรุณาลองใหม่",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "ไม่สามารถเชื่อมต่อ AI ได้ กรุณาลองใหม่",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button — hidden when chat is open */}
      {!isOpen && (
        <button
          className="chat-fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI chat"
        >
          AI
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <span className="chat-header-icon">AI</span>
            <span>CRYPTO NEWS AI</span>
            <button className="chat-close" onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          <div className="chat-input-area">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="ถามเกี่ยวกับข่าว crypto..."
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 500))}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="chat-send"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              ›
            </button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <p>สวัสดีครับ! ผมเป็น AI ผู้ช่วยวิเคราะห์ข่าว Crypto</p>
                <p>ถามอะไรก็ได้เกี่ยวกับข่าว crypto ล่าสุด เช่น:</p>
                <div className="chat-suggestions">
                  <button
                    onClick={() => {
                      setInput("Bitcoin ตอนนี้เป็นยังไงบ้าง?");
                    }}
                  >
                    Bitcoin ตอนนี้เป็นยังไง?
                  </button>
                  <button
                    onClick={() => {
                      setInput("สรุปข่าว Ethereum ล่าสุด");
                    }}
                  >
                    สรุปข่าว Ethereum ล่าสุด
                  </button>
                  <button
                    onClick={() => {
                      setInput("What are the trending topics today?");
                    }}
                  >
                    Trending topics today?
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-bubble">{msg.content}</div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="chat-sources">
                    {msg.sources.map((s, j) => (
                      <a
                        key={j}
                        href={`/news/${s.slug}`}
                        className="chat-source-chip"
                      >
                        {s.source}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-bubble chat-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      )}
    </>
  );
}
