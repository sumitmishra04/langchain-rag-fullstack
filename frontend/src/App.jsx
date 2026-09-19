import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [products, setProducts] = useState([])
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [sessions, setSessions] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [switchingSession, setSwitchingSession] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [chatOpen, setChatOpen] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch(`${API_BASE}/products`)
      .then(r => r.json())
      .then(setProducts)
  }, [])

  // Load default session + prefetch sessions list on mount
  useEffect(() => {
    fetch(`${API_BASE}/session`)
      .then(r => r.json())
      .then(data => {
        if (data.session_id) {
          setSessionId(data.session_id)
          setMessages(data.messages.map(m => ({ role: m.role, text: m.content })))
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false))

    fetch(`${API_BASE}/sessions`)
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function refreshSessions() {
    fetch(`${API_BASE}/sessions`).then(r => r.json()).then(setSessions).catch(() => {})
  }

  // Instant — sessions already loaded on mount
  function openHistory() {
    setHistoryOpen(true)
  }

  async function deleteSession(e, id) {
    e.stopPropagation()
    await fetch(`${API_BASE}/session/${id}`, { method: 'DELETE' })
    setSessions(prev => prev.filter(s => s.id !== id))
    if (id === sessionId) {
      setSessionId(null)
      setMessages([])
      setHistoryOpen(false)
    }
  }

  async function switchSession(id) {
    setSwitchingSession(id)
    const res = await fetch(`${API_BASE}/session/${id}`)
    const data = await res.json()
    setSessionId(data.session_id)
    setMessages(data.messages.map(m => ({ role: m.role, text: m.content })))
    setSwitchingSession(false)
    setHistoryOpen(false)
  }

  function newChat() {
    // Clear UI immediately — session is created lazily on first message
    setMessages([])
    setSessionId(null)
    setHistoryOpen(false)
  }

  async function handleSend() {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      // Create session lazily on first message if none exists
      let activeSessionId = sessionId
      if (!activeSessionId) {
        const s = await fetch(`${API_BASE}/session`, { method: 'POST' })
        const sData = await s.json()
        activeSessionId = sData.session_id
        setSessionId(activeSessionId)
      }

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId, question }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.answer ?? JSON.stringify(data) }])
      refreshSessions()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="px-4 sm:px-8 py-5 bg-white border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">ShopNest</h1>
        <p className="text-sm text-gray-400 mt-0.5">Browse products and ask our AI assistant anything</p>
      </div>

      {/* Product Grid */}
      <div className="px-4 sm:px-8 py-6 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {products.map(product => (
            <div key={product.id} className="product-card shadow-sm hover:shadow-lg transition-shadow">
              <div className="product-card-inner">
                <img src={product.image} alt={product.name} className="w-full h-44 object-cover" />
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                      {product.category}
                    </span>
                    <span className="text-xs text-amber-500 font-medium">★ {product.rating}</span>
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900 mt-2 leading-snug">{product.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">{product.brand}</p>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">{product.description}</p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-base font-bold text-gray-900">${product.price}</span>
                    <span className="text-xs text-gray-400">{product.stock} in stock</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Chat Box
          Mobile:  full-width bottom sheet, slides up from bottom, rounded top corners
          Desktop: fixed bottom-right card, fully rounded
      */}
      {chatOpen && (
        <div className="
          fixed z-50 flex flex-col overflow-hidden shadow-2xl
          bottom-0 left-0 right-0 h-[85vh] rounded-t-3xl
          sm:bottom-6 sm:left-auto sm:right-6 sm:w-96 sm:h-[75vh] sm:rounded-3xl
        ">
          {/* Chat Header */}
          <div
            className="px-5 py-4 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
          >
            {historyOpen ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M7.72 12.53a.75.75 0 010-1.06l7.5-7.5a.75.75 0 111.06 1.06L9.31 12l6.97 6.97a.75.75 0 11-1.06 1.06l-7.5-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
                <p className="text-white font-semibold text-sm">Conversations</p>
                <div className="ml-auto">
                  <button
                    onClick={() => setChatOpen(false)}
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                  AI
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Product Assistant</p>
                  <p className="text-white/70 text-xs">Ask me anything about products</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={openHistory}
                    title="View history"
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    onClick={newChat}
                    title="New chat"
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* History Panel */}
          {historyOpen ? (
            <div className="flex-1 overflow-y-auto bg-white">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <p className="text-sm text-gray-400">No conversations yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sessions.map(s => (
                    <button
                      key={s.id}
                      onClick={() => switchSession(s.id)}
                      disabled={!!switchingSession}
                      className={`w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors ${
                        s.id === sessionId ? 'bg-purple-50' : ''
                      } ${switchingSession === s.id ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">{formatDate(s.created_at)}</span>
                        <div className="flex items-center gap-2">
                          {switchingSession === s.id ? (
                            <svg className="w-3.5 h-3.5 text-purple-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                          ) : s.id === sessionId ? (
                            <span className="text-xs font-medium text-purple-500">Active</span>
                          ) : null}
                          <button
                            onClick={(e) => deleteSession(e, s.id)}
                            className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
                            title="Delete conversation"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{s.preview}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white">
                {sessionLoading ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <svg className="w-6 h-6 text-purple-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <p className="text-xs text-gray-400">Loading conversation...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                    <div className="text-3xl">🛍️</div>
                    <p className="text-sm font-medium text-gray-700">Hi! I'm your shopping assistant</p>
                    <p className="text-xs text-gray-400">Ask me about products, specs, prices, or recommendations</p>
                  </div>
                ) : null}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'text-white rounded-br-none'
                          : 'bg-gray-100 text-gray-800 rounded-bl-none'
                      }`}
                      style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #7c3aed, #ec4899)' } : {}}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-400 text-sm px-4 py-2.5 rounded-2xl rounded-bl-none flex items-center gap-1">
                      <span className="animate-bounce delay-0">•</span>
                      <span className="animate-bounce delay-75">•</span>
                      <span className="animate-bounce delay-150">•</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about a product..."
                    className="flex-1 rounded-full border-2 border-gray-200 px-4 py-2 text-sm focus:outline-none focus:border-purple-400 transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Chat Toggle FAB */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white z-50 hover:scale-110 transition-transform"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
          </svg>
        </button>
      )}

    </div>
  )
}
