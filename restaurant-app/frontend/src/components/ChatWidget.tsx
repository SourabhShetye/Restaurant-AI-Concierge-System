// frontend/src/components/ChatWidget.tsx
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Mic } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// Chat modes matching the backend state machine
type ChatMode = 'general' | 'ordering' | 'booking'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I can help you order food, book a table, or answer questions. What would you like?', timestamp: new Date() }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [mode, setMode] = useState<ChatMode>('general')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    audioChunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      // Stop all tracks to release mic
      stream.getTracks().forEach(t => t.stop())

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const formData = new FormData()
      formData.append('audio', audioBlob, 'voice.webm')

      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/transcribe`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }
        )
        const data = await res.json()
        if (data.text) setInput(data.text)  // paste transcription into input box
      } catch {
        // silently fail — user can just type instead
      } finally {
        setLoading(false)
      }
    }

    mediaRecorder.start()
    setRecording(true)
  } catch {
    alert('Microphone permission denied. Please allow mic access in your browser.')
  }
}

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/api/chat', {
        message: input,
        mode,
        restaurant_id: import.meta.env.VITE_RESTAURANT_ID,
        table_number: localStorage.getItem(`table_${user?.user_id}`) || null,
      })
      const { reply, new_mode } = res.data
      if (new_mode) setMode(new_mode)
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end sm:p-6">
          {/* Backdrop (mobile) */}
          <div className="absolute inset-0 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />

          <div className="relative bg-white w-full sm:w-96 h-[85vh] sm:h-[600px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white px-5 py-4 rounded-t-3xl sm:rounded-t-2xl flex justify-between items-center">
              <div>
                <p className="font-bold">AI Concierge</p>
                <p className="text-xs text-white/70 capitalize">Mode: {mode}</p>
              </div>
              <button onClick={() => setOpen(false)} className="hover:opacity-70 transition-opacity">
                <X size={20} />
              </button>
            </div>

            {/* Mode pills */}
            <div className="flex gap-2 px-4 py-2 border-b border-gray-100">
              {(['general', 'ordering', 'booking'] as ChatMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    mode === m ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-500 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`px-3 py-2 rounded-xl border-2 transition-all ${
                  recording
                    ? 'border-red-400 bg-red-50 text-red-500 animate-pulse'
                    : 'border-gray-200 text-gray-400 hover:border-primary-300'
                }`}
                title="Hold to record"
              >
                <Mic size={16} />
              </button>
              <input
                className="input flex-1 text-sm"
                placeholder={
                  recording ? '🎙️ Recording...' :
                  mode === 'ordering' ? '"2 burgers and a coffee"' :
                  mode === 'booking'  ? '"Book for 4, tomorrow 7pm"' :
                  'Ask me anything...'
                }
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage} disabled={loading} className="btn-primary px-3 py-2">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}