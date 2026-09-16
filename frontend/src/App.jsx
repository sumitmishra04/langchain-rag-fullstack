import { useState } from 'react'

const DOCS = [
  { id: 'story', label: 'Story', description: 'The Tortoise and the Rabbit' },
  { id: 'ecomm', label: 'Ecommerce', description: 'ShopNest product catalog' },
]

export default function App() {
  const [selectedDoc, setSelectedDoc] = useState('story')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleAsk() {
    if (!question.trim()) return
    setLoading(true)
    setAnswer('')
    setError('')

    try {
      const res = await fetch(`http://localhost:8000/${selectedDoc}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: question }),
      })

      const data = await res.json()
      console.log('Response:', data)

      if (!res.ok) {
        setError(`Server error ${res.status}: ${JSON.stringify(data)}`)
        return
      }

      setAnswer(data.output ?? JSON.stringify(data))
    } catch (err) {
      setError(`Request failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">RAG Demo</h1>
          <p className="mt-2 text-gray-500 text-sm">Ask questions grounded in your documents</p>
        </div>

        {/* Doc selector */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Select a document</p>
          <div className="grid grid-cols-2 gap-3">
            {DOCS.map((doc) => (
              <button
                key={doc.id}
                onClick={() => { setSelectedDoc(doc.id); setAnswer(''); setError('') }}
                className={`rounded-xl border px-5 py-4 text-left transition-all ${
                  selectedDoc === doc.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-sm">{doc.label}</p>
                <p className="text-xs mt-1 text-gray-400">{doc.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Question input */}
        <div className="mb-4">
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedDoc === 'story'
                ? 'e.g. Why did the rabbit lose the race?'
                : 'e.g. Which headphones have the best battery life?'
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
          />
        </div>

        <button
          onClick={handleAsk}
          disabled={loading || !question.trim()}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Thinking...' : 'Ask'}
        </button>

        {/* Answer */}
        {answer && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Answer</p>
            <p className="text-sm text-gray-700 leading-relaxed">{answer}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

      </div>
    </div>
  )
}
