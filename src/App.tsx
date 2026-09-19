import { useEffect, useState, useRef } from 'react'

type Tab = 'chat' | 'skills' | 'personas' | 'providers' | 'settings'
type Skill = { name: string; content: string }
type Persona = { id: string; name: string; systemPrompt: string; temperature?: number; avatar?: string }
type Provider = { id: string; name: string; baseURL: string; apiKey: string; models: string[] }

const DEFAULT_PROVIDERS: Provider[] = [
  { id: 'freellmapi', name: 'FreeLLMAPI (local)', baseURL: 'http://127.0.0.1:3001/v1', apiKey: 'freellmapi-b2ccecf930182da4b610b65fe53ccc441dfd8d538c6c55e8', models: ['auto', 'gemini-2.5-flash', 'codestral-latest'] },
  { id: 'justwoker', name: 'JustWoker (Anthropic)', baseURL: 'https://api.justwoker.icu/v1', apiKey: 'sk-CW9RickZiNI3eQJTDKj1As6w0NbVxUbTU7eAVuIryaiQ3olp', models: ['claude-opus-4-8'] },
  { id: 'unorouter-live', name: 'UnoRouter', baseURL: 'https://api.unorouter.com/v1', apiKey: 'sk-38eNhsHNxivpSFeD17ch8jeDKDPFpxt4RpixA6YZIXYB3sb7', models: ['claude-opus-5', 'glm-5.3-flash:free', 'ling-3.0-flash-fin:free'] },
]

declare global { interface Window { hermes?: any } }
const isElectron = () => typeof window !== 'undefined' && !!window.hermes

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [skills, setSkills] = useState<Skill[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [providers, setProviders] = useState<Provider[]>(DEFAULT_PROVIDERS)
  const [chatInput, setChatInput] = useState('')
  const [chatProvider, setChatProvider] = useState('freellmapi')
  const [chatModel, setChatModel] = useState('auto')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Olá — sou o Noshokk. Escolha um provider e mande sua mensagem. Skills e Personas já estão carregados.' },
  ])
  const [streaming, setStreaming] = useState(false)
  const [skillDraft, setSkillDraft] = useState({ name: '', content: '---\nname: my-skill\ndescription: \n---\n\n# My Skill\n' })
  const [personaDraft, setPersonaDraft] = useState<Persona>({ id: '', name: '', systemPrompt: 'Você é um assistente útil.', temperature: 0.7 })
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streaming])

  // load persisted
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
        } catch {}
      } else {
        const lsS = localStorage.getItem('hermes_skills')
        const lsP = localStorage.getItem('hermes_personas')
        const lsProv = localStorage.getItem('hermes_providers')
        if (lsS) setSkills(JSON.parse(lsS))
        if (lsP) setPersonas(JSON.parse(lsP))
        if (lsProv) setProviders(JSON.parse(lsProv))
      }
    }
    load()
  }, [])
  useEffect(() => { if (!isElectron()) localStorage.setItem('hermes_skills', JSON.stringify(skills)) }, [skills])
  useEffect(() => { if (!isElectron()) localStorage.setItem('hermes_personas', JSON.stringify(personas)) }, [personas])
  useEffect(() => { if (!isElectron()) localStorage.setItem('hermes_providers', JSON.stringify(providers)) }, [providers])

  const saveSkill = async () => {
    if (!skillDraft.name.trim()) return alert('Nome da skill obrigatório (kebab-case)')
    const payload = { name: skillDraft.name.trim().toLowerCase().replace(/\s+/g, '-'), content: skillDraft.content }
    if (isElectron()) await window.hermes.skills.save(payload)
    setSkills(prev => {
      const idx = prev.findIndex(s => s.name === payload.name)
      if (idx >= 0) { const n = [...prev]; n[idx] = payload; return n }
      return [...prev, payload]
    })
    setSkillDraft({ name: '', content: '---\nname: my-skill\ndescription: \n---\n\n# My Skill\n' })
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
    setPersonaDraft({ id: '', name: '', systemPrompt: 'Você é um assistente útil.', temperature: 0.7 })
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
    const model = chatModel
    setMessages(m => [...m, { role: 'user', content: text }])
    setChatInput('')
    setStreaming(true)
    setMessages(m => [...m, { role: 'assistant', content: '' }])
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
        setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: out }; return n })
      } else {
        const res = await fetch(`${provider.baseURL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
          body: JSON.stringify({ model, messages: [...messages, { role: 'user', content: text }].map(m => ({ role: m.role, content: m.content })), stream: true }),
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
                setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: acc }; return n })
              }
            } catch {}
          }
        }
        if (!acc) {
          // fallback non-stream
          const txt = buffer
          if (txt) setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: txt.slice(0, 2000) }; return n })
        }
      }
    } catch (e: any) {
      setMessages(m => { const n = [...m]; n[n.length - 1] = { role: 'assistant', content: `⚠️ Erro: ${e.message?.slice(0, 500)}` }; return n })
    } finally { setStreaming(false) }
  }

  const NavButton = ({ id, label, icon }: { id: Tab; label: string; icon: string }) => (
    <button onClick={() => setTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${tab === id ? 'bg-[#aa3bff] text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}>
      <span className="text-base">{icon}</span> {label}
    </button>
  )

  return (
    <div className="flex h-screen bg-[#0f0f12] text-zinc-100 select-none">
      {/* Sidebar - estilo Hermes */}
      <aside className="w-[260px] shrink-0 bg-[#16161a] border-r border-[#2a2a30] flex flex-col">
        <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-[#2a2a30] app-drag">
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
            <p className="px-3 mt-1 text-xs text-zinc-500 leading-relaxed">Tudo local: skills em <code className="text-[11px] bg-zinc-800 px-1 rounded">%APPDATA%/Hermes</code>, personas em JSON, provedores com fallback.</p>
          </div>
        </nav>
        <div className="p-3 border-t border-[#2a2a30] text-xs text-zinc-500">
          <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {providers.length} provedores</div>
          <div className="mt-1">{skills.length} skills · {personas.length} personas</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {tab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="h-[52px] flex items-center gap-3 px-4 border-b border-[#2a2a30] bg-[#0f0f12]">
              <select value={chatProvider} onChange={e => { setChatProvider(e.target.value); const p = providers.find(x => x.id === e.target.value); if (p) setChatModel(p.models[0]) }} className="bg-[#1a1a1e] border border-[#2a2a30] rounded-lg px-2.5 py-1.5 text-sm">
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={chatModel} onChange={e => setChatModel(e.target.value)} className="bg-[#1a1a1e] border border-[#2a2a30] rounded-lg px-2.5 py-1.5 text-sm max-w-[260px]">
                {(providers.find(p => p.id === chatProvider)?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <span className="ml-auto text-xs text-zinc-500 hidden sm:block">{isElectron() ? 'Electron' : 'Web'} · streaming</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0f0f12]">
              {messages.map((m, i) => (
                <div key={i} className={`max-w-[760px] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-[#aa3bff] text-white' : 'bg-[#1a1a1e] border border-[#2a2a30]'}`}>{m.content || (streaming && i === messages.length - 1 ? '▌' : '')}</div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-[#2a2a30] bg-[#16161a]">
              <div className="max-w-[760px] mx-auto flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }} placeholder="Pergunte algo... (Enter envia, Shift+Enter quebra linha)" className="flex-1 bg-[#0f0f12] border border-[#2a2a30] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#aa3bff] placeholder:text-zinc-600" />
                <button onClick={sendChat} disabled={streaming || !chatInput.trim()} className="px-5 py-3 rounded-xl bg-[#aa3bff] hover:bg-[#c084fc] disabled:opacity-40 text-sm font-medium transition">Enviar</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'skills' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-[300px] border-r border-[#2a2a30] bg-[#16161a] flex flex-col">
              <div className="p-4 border-b border-[#2a2a30] flex items-center justify-between"><h2 className="font-semibold">Skills</h2><span className="text-xs bg-[#2a2a30] px-2 py-1 rounded-full">{skills.length}</span></div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {skills.length === 0 && <p className="p-3 text-sm text-zinc-500">Nenhuma skill. Crie ao lado →</p>}
                {skills.map(s => (
                  <div key={s.name} className="p-3 rounded-xl bg-[#0f0f12] border border-[#2a2a30] group">
                    <div className="font-mono text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-zinc-500 truncate mt-1">{s.content.slice(0, 80)}...</div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setSkillDraft({ name: s.name, content: s.content })} className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Editar</button>
                      <button onClick={() => deleteSkill(s.name)} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-300 hover:bg-red-900/50 ml-auto">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col p-4 gap-3 bg-[#0f0f12] min-w-0">
              <h3 className="font-medium">Editor de Skill <span className="text-zinc-500 font-normal">— salva em <code className="bg-zinc-800 px-1 rounded text-xs">skills/&lt;nome&gt;/SKILL.md</code></span></h3>
              <input value={skillDraft.name} onChange={e => setSkillDraft({ ...skillDraft, name: e.target.value })} placeholder="nome-da-skill (kebab-case)" className="bg-[#16161a] border border-[#2a2a30] rounded-lg px-3 py-2 text-sm font-mono" />
              <textarea value={skillDraft.content} onChange={e => setSkillDraft({ ...skillDraft, content: e.target.value })} className="flex-1 min-h-[280px] bg-[#16161a] border border-[#2a2a30] rounded-xl p-3 text-sm font-mono leading-relaxed" placeholder={'---\nname: my-skill\ndescription: quando usar\n---\n\n# Instruções\n'} />
              <div className="flex gap-2">
                <button onClick={saveSkill} className="px-4 py-2 rounded-lg bg-[#aa3bff] hover:bg-[#c084fc] text-sm font-medium">Salvar Skill</button>
                <button onClick={() => setSkillDraft({ name: '', content: '---\nname: my-skill\ndescription: \n---\n\n# My Skill\n' })} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Limpar</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'personas' && (
          <div className="flex-1 flex min-h-0">
            <div className="w-[300px] border-r border-[#2a2a30] bg-[#16161a] flex flex-col">
              <div className="p-4 border-b border-[#2a2a30] flex items-center justify-between"><h2 className="font-semibold">Personas</h2><span className="text-xs bg-[#2a2a30] px-2 py-1 rounded-full">{personas.length}</span></div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {personas.length === 0 && <p className="p-3 text-sm text-zinc-500">Nenhuma persona. Crie ao lado →</p>}
                {personas.map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-[#0f0f12] border border-[#2a2a30]">
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
                <input type="range" min={0} max={1} step={0.1} value={personaDraft.temperature ?? 0.7} onChange={e => setPersonaDraft({ ...personaDraft, temperature: parseFloat(e.target.value) })} className="flex-1" />
                <span className="text-sm font-mono w-8">{personaDraft.temperature?.toFixed(1)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={savePersona} className="px-4 py-2 rounded-lg bg-[#aa3bff] hover:bg-[#c084fc] text-sm font-medium">Salvar Persona</button>
                <button onClick={() => setPersonaDraft({ id: '', name: '', systemPrompt: 'Você é um assistente útil.', temperature: 0.7 })} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Limpar</button>
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
                <div key={p.id} className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]">
                  <div className="flex items-center gap-2"><span className="font-medium text-sm">{p.name}</span><span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{p.id}</span></div>
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
              <div className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]"><h3 className="font-medium">Dados locais</h3><p className="text-zinc-500 mt-1">Skills: <code className="bg-zinc-800 px-1 rounded">%APPDATA%/HermesApp/skills/&lt;nome&gt;/SKILL.md</code><br />Personas: <code className="bg-zinc-800 px-1 rounded">personas/*.json</code><br />Auto-start: Startup + HKCU Run (já configurado pro FreeLLMAPI; Hermes usará o mesmo).</p></div>
              <div className="p-4 rounded-xl bg-[#16161a] border border-[#2a2a30]"><h3 className="font-medium">Atalhos</h3><p className="text-zinc-500">Enter envia, Shift+Enter quebra linha. Troca de provider/modelo sem reload.</p></div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
