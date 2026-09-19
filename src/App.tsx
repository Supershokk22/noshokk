import { useEffect, useState, useRef } from 'react'

type Tab = 'chat' | 'skills' | 'personas' | 'providers' | 'settings'
type Skill = { name: string; content: string }
type Persona = { id: string; name: string; systemPrompt: string; temperature?: number }
type Provider = { id: string; name: string; baseURL: string; apiKey: string; models: string[] }
type ChatItem = { id: string; title: string; preview: string; createdAt: number; updatedAt: number }
type Msg = { role: 'user' | 'assistant'; content: string; ts: number }

const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'freellmapi', name: 'FreeLLMAPI (local)', baseURL: 'http://127.0.0.1:3001/v1', apiKey: 'freellmapi-YOUR_KEY', models: ['auto', 'gemini-2.5-flash', 'codestral-latest'] },
  { id: 'justwoker', name: 'JustWoker (Anthropic)', baseURL: 'https://api.justwoker.icu/v1', apiKey: 'YOUR_JUSTWOKER_KEY', models: ['claude-opus-4-8'] },
  { id: 'unorouter-live', name: 'UnoRouter', baseURL: 'https://api.unorouter.com/v1', apiKey: 'YOUR_UNOROUTER_KEY', models: ['claude-opus-5', 'glm-5.3-flash:free', 'ling-3.0-flash-fin:free'] },
]

declare global { interface Window { hermes?: any } }
const isElectron = () => typeof window !== 'undefined' && !!window.hermes
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [skills, setSkills] = useState<Skill[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS)
  const [chatInput, setChatInput] = useState('')
  const [chatProvider, setChatProvider] = useState('unorouter-live')
  const [chatModel, setChatModel] = useState('glm-5.3-flash:free')
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Olá — sou o Noshokk. Escolha um provider e mande sua mensagem. Skills e Personas já estão carregados.', ts: Date.now() },
  ])
  const [streaming, setStreaming] = useState(false)
  const [skillDraft, setSkillDraft] = useState({ name: '', content: '---\nname: my-skill\ndescription: quando usar esta skill\n---\n\n# My Skill\n\nDescreva aqui o que a skill faz.\n' })
  const [personaDraft, setPersonaDraft] = useState<Persona>({ id: '', name: '', systemPrompt: 'Você é um assistente útil, direto e técnico.', temperature: 0.7 })
  const [chats, setChats] = useState<ChatItem[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [searchChats, setSearchChats] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200) }
  const [showCmd, setShowCmd] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])
  useEffect(() => { inputRef.current?.focus() }, [tab])
  useEffect(() => {
    const el = inputRef.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
  }, [chatInput])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCmd(v => !v) }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newChat(); showToast('Nova conversa') }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); exportChat(); showToast('Exportado .md') }
      if (e.key === 'Escape' && tab === 'chat' && !showCmd) newChat()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [tab, messages, activeChatId, showCmd])
  const renderMarkdown = (text: string) => {
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```\w*\n?/, '').replace(/```$/, '')
        return (
          <div key={i} className="relative group/code my-2">
            <pre className="bg-[#0f0f12] border border-[#2a2a30] rounded-lg p-3 overflow-x-auto text-xs font-mono whitespace-pre-wrap">{code}</pre>
            <button onClick={() => { navigator.clipboard.writeText(code); showToast('Código copiado') }} className="absolute top-2 right-2 text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 opacity-0 group-hover/code:opacity-100 transition">Copiar</button>
          </div>
        )
      }
      const html = part.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 px-1 py-0.5 rounded text-xs font-mono">$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      return <span key={i} dangerouslySetInnerHTML={{ __html: html.replace(/\n/g, '<br/>') }} />
    })
  }

  // Load persisted
  const reloadChats = async () => {
    if (isElectron()) {
      try { const list = await window.hermes.chats.list(); if (list) setChats(list) } catch {}
    } else {
      const raw = localStorage.getItem('noshokk_chats')
      if (raw) try { setChats(JSON.parse(raw)) } catch {}
    }
  }
  useEffect(() => {
    const load = async () => {
      if (isElectron()) {
        try {
          const s = await window.hermes.skills.list()
          if (s?.length) setSkills(s)
          const p = await window.hermes.personas.list()
          if (p?.length) setPersonas(p)
          const prov = await window.hermes.providers.get()
          if (prov?.providers?.length) setProviders(prov.providers)
          const list = await window.hermes.chats.list()
          if (list?.length) setChats(list)
        } catch {}
      } else {
        const lsS = localStorage.getItem('hermes_skills')
        const lsP = localStorage.getItem('hermes_personas')
        if (lsS) try { setSkills(JSON.parse(lsS)) } catch {}
        if (lsP) try { setPersonas(JSON.parse(lsP)) } catch {}
        const lsC = localStorage.getItem('noshokk_chats')
        if (lsC) try { setChats(JSON.parse(lsC)) } catch {}
      }
    }
    load()
  }, [])
  useEffect(() => { if (!isElectron()) localStorage.setItem('hermes_skills', JSON.stringify(skills)) }, [skills])
  useEffect(() => { if (!isElectron()) localStorage.setItem('hermes_personas', JSON.stringify(personas)) }, [personas])

  const persistChat = async (msgs: Msg[], forcedId?: string) => {
    const title = msgs.find(m => m.role === 'user')?.content.slice(0, 48) || 'Nova conversa'
    const id = forcedId || activeChatId || Date.now().toString(36)
    const payload = { id, title, messages: msgs }
    if (isElectron()) {
      try { const saved = await window.hermes.chats.save(payload); setActiveChatId(saved.id); reloadChats() } catch {}
    } else {
      const list: ChatItem[] = JSON.parse(localStorage.getItem('noshokk_chats') || '[]')
      const now = Date.now()
      const item: ChatItem = { id, title, preview: msgs[msgs.length - 1]?.content.slice(0, 80) || '', createdAt: list.find(c => c.id === id)?.createdAt || now, updatedAt: now }
      const next = [item, ...list.filter(c => c.id !== id)].slice(0, 100)
      localStorage.setItem('noshokk_chats', JSON.stringify(next))
      setChats(next); setActiveChatId(id)
    }
  }

  const newChat = () => {
    setMessages([{ role: 'assistant', content: 'Nova conversa iniciada. Como posso ajudar?', ts: Date.now() }])
    setActiveChatId(null)
  }
  const openChat = async (id: string) => {
    if (isElectron()) {
      const data = await window.hermes.chats.load(id)
      if (data?.messages) { setMessages(data.messages); setActiveChatId(id) }
    } else {
      showToast('Histórico completo só no app Electron')
    }
  }
  const deleteChat = async (id: string) => {
    if (!confirm('Excluir conversa?')) return
    if (isElectron()) { await window.hermes.chats.delete(id); reloadChats() }
    else {
      const next = chats.filter(c => c.id !== id)
      localStorage.setItem('noshokk_chats', JSON.stringify(next)); setChats(next)
      if (activeChatId === id) newChat()
    }
  }
  const copyMsg = async (text: string) => { try { await navigator.clipboard.writeText(text); showToast('Copiado!') } catch {} }
  const exportChat = () => {
    const md = messages.map(m => `**${m.role === 'user' ? 'Você' : 'Noshokk'}** (${fmtTime(m.ts)}):\n${m.content}\n`).join('\n---\n')
    const blob = new Blob([`# ${chats.find(c => c.id === activeChatId)?.title || 'Conversa Noshokk'}\n\n${md}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `noshokk-${activeChatId || Date.now()}.md`; a.click(); URL.revokeObjectURL(url)
  }

  const saveSkill = async () => {
    if (!skillDraft.name.trim()) return alert('Nome da skill obrigatório (kebab-case)')
    const payload = { name: skillDraft.name.trim().toLowerCase().replace(/\s+/g, '-'), content: skillDraft.content }
    if (isElectron()) await window.hermes.skills.save(payload)
    setSkills(prev => {
      const idx = prev.findIndex(s => s.name === payload.name)
      if (idx >= 0) { const n = [...prev]; n[idx] = payload; return n }
      return [...prev, payload]
    })
    setSkillDraft({ name: '', content: '---\nname: my-skill\ndescription: quando usar esta skill\n---\n\n# My Skill\n' })
  }
  const deleteSkill = async (name: string) => {
    if (!confirm(`Excluir skill "${name}"?`)) return
    if (isElectron()) await window.hermes.skills.delete(name)
    setSkills(prev => prev.filter(s => s.name !== name))
  }
  const savePersona = async () => {
    if (!personaDraft.name.trim()) return alert('Nome da persona obrigatório')
    const id = personaDraft.id || personaDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const data = { ...personaDraft, id }
    if (isElectron()) await window.hermes.personas.save(data)
    setPersonas(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx >= 0) { const n = [...prev]; n[idx] = data; return n }
      return [...prev, data]
    })
    setPersonaDraft({ id: '', name: '', systemPrompt: 'Você é um assistente útil, direto e técnico.', temperature: 0.7 })
  }
  const deletePersona = async (id: string) => {
    if (!confirm('Excluir persona?')) return
    if (isElectron()) await window.hermes.personas.delete(id)
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || streaming) return
    const provider = providers.find(p => p.id === chatProvider) || providers[0]
    if (provider.apiKey.includes('YOUR_')) {
      setMessages(m => [...m, { role: 'user', content: text, ts: Date.now() }, { role: 'assistant', content: `🔑 API key não configurada para ${provider.name} (${provider.id}).\n\nVá em **Provedores → ${provider.id}** e cole sua key.\n\nPara FreeLLMAPI: http://127.0.0.1:3001 → Keys → copie freellmapi-...\nPara UnoRouter: https://unorouter.com/tokens\nPara JustWoker: https://api.justwoker.icu/dashboard/overview`, ts: Date.now() }])
      setChatInput('')
      return
    }
    const model = chatModel
    const now = Date.now()
    const nextMsgs: Msg[] = [...messages, { role: 'user' as const, content: text, ts: now }]
    setMessages(nextMsgs)
    setChatInput('')
    setStreaming(true)
    setMessages(m => [...m, { role: 'assistant', content: '', ts: Date.now() }])
    try {
      const isAnthropic = provider.id === 'justwoker'
      if (isAnthropic) {
        const res = await fetch(`${provider.baseURL}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: text }] }),
        })
        const data = await res.json()
        const out = data?.content?.[0]?.text || JSON.stringify(data).slice(0, 2000)
        setMessages(m => {
          const n = [...m]; n[n.length - 1] = { role: 'assistant', content: out, ts: Date.now() }; persistChat(n); return n
        })
      } else {
        const res = await fetch(`${provider.baseURL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
          body: JSON.stringify({ model, messages: nextMsgs.map(m => ({ role: m.role, content: m.content })), stream: true }),
        })
        if (!res.ok || !res.body) {
          const t = await res.text()
          throw new Error(t.slice(0, 600))
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let acc = ''
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') break
            try {
              const json = JSON.parse(data)
              const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || ''
              if (delta) {
                acc += delta
                setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: acc, ts: Date.now() }; return n })
              }
            } catch {}
          }
        }
        setMessages(m => { const n = [...m]; persistChat(n); return n })
      }
    } catch (e: any) {
      let msg = e.message || 'Erro desconhecido'
      const raw = String(e.message || '')
      if (raw.includes('401') || raw.includes('403') || raw.includes('YOUR_') || raw.includes('API key')) {
        msg = `🔑 API key inválida/não configurada para ${provider.name}. Vá em Provedores → ${provider.id} e cole sua key.`
      } else if (raw.includes('429') || raw.toLowerCase().includes('too many requests') || raw.includes('rate_limit')) {
        msg = `⏳ Limite free 1/min no ${provider.name}. Aguarde 60s ou troque para freellmapi/auto (tem fallback).`
      } else if (raw.toLowerCase().includes('timeout') || raw.includes('tempo limite')) {
        msg = `⏱️ ${provider.name} demorou. Tente novamente ou troque de provider.`
      } else if (raw.includes('Failed to fetch') || raw.includes('NetworkError') || raw.includes('ECONNREFUSED')) {
        msg = `📡 Sem conexão com ${provider.name} (${provider.baseURL}). Verifique internet ou se o FreeLLMAPI está em http://127.0.0.1:3001`
      }
      const detail = raw.slice(0, 300)
      setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: `⚠️ ${msg}\n\nDetalhe: ${detail}`, ts: Date.now() }; showToast(msg.slice(0, 50)); return n })
    } finally { setStreaming(false) }
  }

  const filteredSkills = skills.filter(s => !skillSearch || s.name.includes(skillSearch.toLowerCase()) || s.content.toLowerCase().includes(skillSearch.toLowerCase()))
  const filteredChats = chats.filter(c => !searchChats || c.title.toLowerCase().includes(searchChats.toLowerCase()) || c.preview.toLowerCase().includes(searchChats.toLowerCase()))

  const NavButton = ({ id, label, icon }: { id: Tab; label: string; icon: string }) => (
    <button onClick={() => setTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${tab === id ? 'bg-[#aa3bff] text-white shadow' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}>
      <span className="text-base">{icon}</span> {label}
    </button>
  )

  return (
    <div
      className="flex h-screen bg-[#0f0f12] text-zinc-100 select-none"
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) {
          if (f.type.startsWith('text/') || /\.(txt|md|json|lua|cs|cpp|gd)$/i.test(f.name)) {
            const r = new FileReader()
            r.onload = () => setChatInput(prev => (prev ? prev + '\n' : '') + String(r.result).slice(0, 8000))
            r.readAsText(f); showToast(`Carregado ${f.name}`)
          } else showToast(`Arraste .txt/.md/.json/.lua`)
        }
      }}
    >
      <aside className="w-[260px] shrink-0 bg-[#16161a] border-r border-[#2a2a30] flex flex-col">
        <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-[#2a2a30]">
          <div className="w-7 h-7 rounded-md bg-[#aa3bff] flex items-center justify-center text-[11px] font-bold tracking-widest">NS</div>
          <span className="font-semibold tracking-tight">Noshokk</span>
          <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded bg-[#2a2a30] text-zinc-400">local</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavButton id="chat" label="Chat" icon="💬" />
          <NavButton id="skills" label="Skills Editor" icon="🧩" />
          <NavButton id="personas" label="Personas" icon="🎭" />
          <NavButton id="providers" label="Provedores" icon="🔌" />
          <NavButton id="settings" label="Configurações" icon="⚙️" />
          <div className="pt-4 mt-4 border-t border-[#2a2a30]">
            <p className="px-3 text-[11px] tracking-widest text-zinc-500 font-semibold">CONTROLE TOTAL</p>
            <p className="px-3 mt-1 text-xs text-zinc-500 leading-relaxed">Tudo local: skills em <code className="text-[11px] bg-zinc-800 px-1 rounded">%APPDATA%/Hermes</code>, personas em JSON, histórico em <code className="text-[11px] bg-zinc-800 px-1 rounded">chats/*.json</code>.</p>
          </div>
        </nav>
        <div className="p-3 border-t border-[#2a2a30] text-xs text-zinc-500">
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {providers.length} provedores</div>
          <div className="mt-1">{skills.length} skills · {personas.length} personas · {chats.length} conversas</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        {tab === 'chat' && (
          <div className="flex-1 flex min-h-0">
            {/* Histórico */}
            <div className="w-[280px] border-r border-[#2a2a30] bg-[#16161a] flex flex-col">
              <div className="p-3 border-b border-[#2a2a30] space-y-2">
                <button onClick={newChat} className="w-full py-2 rounded-lg bg-[#aa3bff] hover:bg-[#c084fc] text-sm font-medium flex items-center justify-center gap-2">+ Nova conversa</button>
                <div className="relative">
                  <input value={searchChats} onChange={e => setSearchChats(e.target.value)} placeholder="Buscar histórico..." className="w-full bg-[#0f0f12] border border-[#2a2a30] rounded-lg pl-8 pr-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#aa3bff]" />
                  <span className="absolute left-2.5 top-2.5 text-zinc-500 text-xs">🔍</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredChats.length === 0 && <p className="p-3 text-sm text-zinc-500 text-center mt-8">Nenhuma conversa ainda.<br />Comece uma nova.</p>}
                {filteredChats.map(c => (
                  <div key={c.id} onClick={() => openChat(c.id)} className={`p-3 rounded-xl border cursor-pointer group ${activeChatId === c.id ? 'bg-[#aa3bff]/20 border-[#aa3bff]/40' : 'bg-[#0f0f12] border-[#2a2a30] hover:border-[#3a3a45]'}`}>
                    <div className="text-sm font-medium truncate pr-6">{c.title}</div>
                    <div className="text-xs text-zinc-500 truncate mt-1">{c.preview}</div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-zinc-600">{fmtDate(c.updatedAt)} · {fmtTime(c.updatedAt)}</span>
                      <button onClick={e => { e.stopPropagation(); deleteChat(c.id) }} className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50">✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-2 border-t border-[#2a2a30] flex gap-2">
                <button onClick={exportChat} className="flex-1 text-xs py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">Exportar .md</button>
                <button onClick={newChat} className="flex-1 text-xs py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700">Limpar</button>
              </div>
            </div>
            {/* Chat principal */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f12]">
              <div className="h-[52px] flex items-center gap-2 px-3 border-b border-[#2a2a30] bg-[#0f0f12] flex-wrap">
                <select value={chatProvider} onChange={e => { setChatProvider(e.target.value); const p = providers.find(x => x.id === e.target.value); if (p) setChatModel(p.models[0]) }} className="bg-[#1a1a1e] border border-[#2a2a30] rounded-lg px-2.5 py-1.5 text-sm">
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={chatModel} onChange={e => setChatModel(e.target.value)} className="bg-[#1a1a1e] border border-[#2a2a30] rounded-lg px-2.5 py-1.5 text-sm max-w-[200px]">
                  {(providers.find(p => p.id === chatProvider)?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="hidden lg:flex items-center gap-1 ml-2">
                  <button onClick={() => setFontSize(s => Math.max(12, s - 1))} className="w-7 h-7 rounded bg-[#1a1a1e] border border-[#2a2a30] hover:bg-zinc-800 text-xs">A-</button>
                  <span className="text-xs w-6 text-center text-zinc-500">{fontSize}</span>
                  <button onClick={() => setFontSize(s => Math.min(18, s + 1))} className="w-7 h-7 rounded bg-[#1a1a1e] border border-[#2a2a30] hover:bg-zinc-800 text-xs">A+</button>
                </div>
                <span className="ml-auto hidden lg:flex items-center gap-2 text-xs">
                  <span className="px-2 py-1 rounded-full bg-[#1a1a1e] border border-[#2a2a30] text-zinc-400">{isElectron() ? 'Electron' : 'Web'} · streaming</span>
                  <span className="px-2 py-1 rounded-full bg-[#1a1a1e] border border-[#2a2a30] text-zinc-500">{messages.length} msgs</span>
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 1 && (
                  <div className="max-w-[760px] mx-auto w-full grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {['Explique um padrão State para meu inimigo', 'Crie um mod BepInEx de godmode', 'Otimize meu Update() no Unity', 'Gere uma skill de FPS'].map(s => (
                      <button key={s} onClick={() => setChatInput(s)} className="text-left p-3 rounded-xl bg-[#1a1a1e] border border-[#2a2a30] hover:border-[#aa3bff]/40 text-sm text-zinc-400 hover:text-zinc-100">{s}</button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`group relative max-w-[760px] rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-[#aa3bff] text-white' : 'bg-[#1a1a1e] border border-[#2a2a30]'}`} style={{ fontSize }}>
                    {m.role === 'assistant' ? (m.content ? renderMarkdown(m.content) : (streaming && i === messages.length - 1 ? <span className="animate-pulse">▌</span> : '')) : m.content}
                    <div className="flex items-center gap-2 mt-2 text-[11px] opacity-60">
                      <span>{fmtTime(m.ts)}</span>
                      {m.content && <button onClick={() => copyMsg(m.content)} className="ml-auto px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">Copiar</button>}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="p-3 border-t border-[#2a2a30] bg-[#16161a]">
                <div className="max-w-[760px] mx-auto flex gap-2 items-end">
                  <textarea
                    ref={inputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                    placeholder="Pergunte algo... (Enter envia, Shift+Enter quebra linha) — arraste .txt/.md aqui"
                    rows={1}
                    className="flex-1 bg-[#0f0f12] border border-[#2a2a30] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#aa3bff] placeholder:text-zinc-600 resize-none overflow-hidden"
                    style={{ fontSize }}
                  />
                  <button onClick={sendChat} disabled={streaming || !chatInput.trim()} className="px-5 py-3 rounded-xl bg-[#aa3bff] hover:bg-[#c084fc] disabled:opacity-40 text-sm font-medium transition shrink-0">Enviar</button>
                </div>
                <p className="max-w-[760px] mx-auto text-[11px] text-zinc-600 mt-2 text-center">Histórico salvo automaticamente em <code className="bg-zinc-800 px-1 rounded">chats/*.json</code> · Enter envia · Esc nova conversa</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-[320px] border-r border-[#2a2a30] bg-[#16161a] flex flex-col">
              <div className="p-3 border-b border-[#2a2a30] space-y-2">
                <div className="flex items-center justify-between"><h2 className="font-semibold">Skills</h2><span className="text-xs bg-[#2a2a30] px-2 py-1 rounded-full">{filteredSkills.length}/{skills.length}</span></div>
                <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)} placeholder="Buscar skill..." className="w-full bg-[#0f0f12] border border-[#2a2a30] rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredSkills.length === 0 && <p className="p-3 text-sm text-zinc-500">Nenhuma skill encontrada.</p>}
                {filteredSkills.map(s => (
                  <div key={s.name} className="p-3 rounded-xl bg-[#0f0f12] border border-[#2a2a30] group hover:border-[#3a3a45]">
                    <div className="font-mono text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-zinc-500 line-clamp-2 mt-1">{s.content.slice(0, 120)}...</div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setSkillDraft({ name: s.name, content: s.content })} className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Editar</button>
                      <button onClick={() => { navigator.clipboard.writeText(s.content) }} className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Copiar</button>
                      <button onClick={() => deleteSkill(s.name)} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50 ml-auto">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col p-4 gap-3 bg-[#0f0f12] min-w-0">
              <h3 className="font-medium">Editor de Skill <span className="text-zinc-500 font-normal">— salva em <code className="bg-zinc-800 px-1 rounded text-xs">skills/&lt;nome&gt;/SKILL.md</code></span></h3>
              <input value={skillDraft.name} onChange={e => setSkillDraft({ ...skillDraft, name: e.target.value })} placeholder="nome-da-skill (kebab-case)" className="bg-[#16161a] border border-[#2a2a30] rounded-lg px-3 py-2 text-sm font-mono" />
              <textarea value={skillDraft.content} onChange={e => setSkillDraft({ ...skillDraft, content: e.target.value })} className="flex-1 min-h-[280px] bg-[#16161a] border border-[#2a2a30] rounded-xl p-3 text-sm font-mono leading-relaxed" placeholder={'---\nname: my-skill\ndescription: quando usar esta skill\n---\n\n# Instruções\n'} />
              <div className="flex gap-2">
                <button onClick={saveSkill} className="px-4 py-2 rounded-lg bg-[#aa3bff] hover:bg-[#c084fc] text-sm font-medium">Salvar Skill</button>
                <button onClick={() => setSkillDraft({ name: '', content: '---\nname: my-skill\ndescription: \n---\n\n# My Skill\n' })} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Limpar</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'personas' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-[320px] border-r border-[#2a2a30] bg-[#16161a] flex flex-col">
              <div className="p-4 border-b border-[#2a2a30] flex items-center justify-between"><h2 className="font-semibold">Personas</h2><span className="text-xs bg-[#2a2a30] px-2 py-1 rounded-full">{personas.length}</span></div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {personas.length === 0 && <p className="p-3 text-sm text-zinc-500">Nenhuma persona. Crie ao lado →</p>}
                {personas.map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-[#0f0f12] border border-[#2a2a30] hover:border-[#3a3a45]">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-zinc-500 line-clamp-2 mt-1">{p.systemPrompt}</div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setPersonaDraft(p)} className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Editar</button>
                      <button onClick={() => deletePersona(p.id)} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50 ml-auto">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col p-4 gap-3 bg-[#0f0f12] min-w-0">
              <h3 className="font-medium">Editor de Persona</h3>
              <input value={personaDraft.name} onChange={e => setPersonaDraft({ ...personaDraft, name: e.target.value })} placeholder="Nome da persona" className="bg-[#16161a] border border-[#2a2a30] rounded-lg px-3 py-2 text-sm" />
              <textarea value={personaDraft.systemPrompt} onChange={e => setPersonaDraft({ ...personaDraft, systemPrompt: e.target.value })} className="flex-1 min-h-[180px] bg-[#16161a] border border-[#2a2a30] rounded-xl p-3 text-sm leading-relaxed" placeholder="System prompt da persona..." />
              <div className="flex items-center gap-3">
                <label className="text-sm text-zinc-400">Temperature</label>
                <input type="range" min={0} max={1} step={0.1} value={personaDraft.temperature ?? 0.7} onChange={e => setPersonaDraft({ ...personaDraft, temperature: parseFloat(e.target.value) })} className="flex-1 accent-[#aa3bff]" />
                <span className="text-sm font-mono w-8">{personaDraft.temperature?.toFixed(1)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={savePersona} className="px-4 py-2 rounded-lg bg-[#aa3bff] hover:bg-[#c084fc] text-sm font-medium">Salvar Persona</button>
                <button onClick={() => setPersonaDraft({ id: '', name: '', systemPrompt: 'Você é um assistente útil, direto e técnico.', temperature: 0.7 })} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Limpar</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'providers' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0f0f12]">
            <h2 className="text-lg font-semibold">Provedores</h2>
            <p className="text-sm text-zinc-500 mt-1">Controle total — chaves ficam em <code className="bg-zinc-800 px-1 rounded">%APPDATA%/HermesApp/providers.json</code> e no freellmapi. Fallback automático.</p>
            <div className="grid gap-3 mt-4 max-w-[760px]">
              {providers.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30] hover:border-[#3a3a45] transition">
                  <div className="flex items-center gap-2"><span className="font-medium text-sm">{p.name}</span><span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{p.id}</span><span className="ml-auto text-xs text-emerald-400">● ativo</span></div>
                  <div className="font-mono text-xs text-zinc-500 mt-1 truncate">{p.baseURL}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">{p.models.map(m => <span key={m} className="text-xs px-2 py-1 rounded-full bg-[#0f0f12] border border-[#2a2a30]">{m}</span>)}</div>
                </div>
              ))}
              <div className="p-4 rounded-xl border border-dashed border-[#2a2a30] text-sm text-zinc-500">Para adicionar outro, edite <code className="bg-zinc-800 px-1 rounded">providers.json</code> no userData ou use o dashboard do FreeLLMAPI em <span className="text-zinc-300">http://127.0.0.1:3001</span> (já com sua key OpenRouter).</div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6 bg-[#0f0f12] max-w-[760px]">
            <h2 className="text-lg font-semibold">Configurações</h2>
            <div className="mt-4 space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]"><h3 className="font-medium">Dados locais</h3><p className="text-zinc-500 mt-1">Skills: <code className="bg-zinc-800 px-1 rounded">%APPDATA%/HermesApp/skills/&lt;nome&gt;/SKILL.md</code><br />Personas: <code className="bg-zinc-800 px-1 rounded">personas/*.json</code><br />Chats: <code className="bg-zinc-800 px-1 rounded">chats/*.json</code><br />Auto-start: Startup + HKCU Run.</p></div>
              <div className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]"><h3 className="font-medium">Atalhos profissionais</h3><p className="text-zinc-500">Enter envia · Shift+Enter quebra linha · Esc nova conversa · Ctrl+K busca · Ctrl+E exporta</p></div>
              <div className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]"><h3 className="font-medium">Dicas</h3><p className="text-zinc-500">Use <code>programacao-jogos</code> e <code>criar-mods</code> no chat para gerar código com padrões. Ex: "usando programacao-jogos, crie um inimigo com State em Unity".</p></div>
            </div>
          </div>
        )}
      </main>
      {dragOver && (
        <div className="absolute inset-0 bg-[#aa3bff]/10 backdrop-blur-sm border-2 border-dashed border-[#aa3bff] flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-[#16161a] border border-[#aa3bff] rounded-2xl px-8 py-6 text-center">
            <p className="text-lg font-medium">Solte o arquivo aqui</p>
            <p className="text-xs text-zinc-500 mt-1">.txt .md .json .lua .cs .cpp .gd</p>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1a1a1e] border border-[#2a2a30] text-sm px-4 py-2 rounded-full shadow-xl z-50 animate-pulse">
          {toast}
        </div>
      )}
      {showCmd && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[20vh] z-50" onClick={() => setShowCmd(false)}>
          <div className="w-[560px] bg-[#16161a] border border-[#2a2a30] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-[#2a2a30] flex items-center gap-2">
              <span className="text-zinc-500">⌘</span>
              <input autoFocus placeholder="Buscar chats, skills, personas... (Enter abre)" className="flex-1 bg-transparent outline-none text-sm placeholder:text-zinc-600" />
              <span className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">ESC</span>
            </div>
            <div className="p-2 max-h-[320px] overflow-y-auto text-sm">
              <p className="px-3 py-1 text-xs text-zinc-500">Atalhos</p>
              <button onClick={() => { setShowCmd(false); newChat(); showToast('Nova conversa') }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800">+ Nova conversa — Ctrl+N</button>
              <button onClick={() => { setShowCmd(false); exportChat(); showToast('Exportado') }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800">Exportar .md — Ctrl+E</button>
              <button onClick={() => { setShowCmd(false); setTab('skills') }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800">Ir para Skills — 🧩</button>
              <button onClick={() => { setShowCmd(false); setTab('providers') }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800">Provedores — 🔌</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
