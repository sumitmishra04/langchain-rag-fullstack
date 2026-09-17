import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App() {
  const [products, setProducts] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    fetch(`${API_BASE}/products`)
      .then((r) => r.json())
      .then((data) => {
        const allProducts = []
        for (const category of data.categories) {
          for (const product of category.products) {
            allProducts.push({ ...product, category: category.name })
          }
        }
        setProducts(allProducts)
      })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/ecomm/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: question }),
      })
      const data = await res.json()
      setMessages((prev) => [...prev, { role: 'assistant', text: data.output ?? JSON.stringify(data) }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Something went wrong. Please try again.' }])
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

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">ShopNest</h1>
        <p className="text-sm text-gray-400 mt-0.5">Browse products and ask our AI assistant anything</p>
      </div>

      {/* Product Grid */}
      <div className="px-8 py-6 pb-32">
        <div className="grid grid-cols-3 gap-5 max-w-5xl mx-auto">
          {products.map((product) => (
            <div key={product.id} className="product-card shadow-sm hover:shadow-lg transition-shadow">
              <div className="product-card-inner">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-44 object-cover"
                />
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

      {/* Floating Chat Box */}
      {chatOpen && (
      <div
        style={{ height: '75vh' }}
        className="fixed bottom-6 right-6 w-96 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-50"
      >
        {/* Chat Header */}
        <div className="px-5 py-4 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
              AI
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Product Assistant</p>
              <p className="text-white/70 text-xs">Ask me anything about products</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-white">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
              <div className="text-3xl">🛍️</div>
              <p className="text-sm font-medium text-gray-700">Hi! I'm your shopping assistant</p>
              <p className="text-xs text-gray-400">Ask me about products, specs, prices, or recommendations</p>
            </div>
          )}
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
              onChange={(e) => setInput(e.target.value)}
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
