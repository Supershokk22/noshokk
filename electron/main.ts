import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win: BrowserWindow | null = null
const isDev = !app.isPackaged

function getUserData() {
  return app.getPath('userData')
}

function ensureDirs() {
  const base = getUserData()
  for (const sub of ['skills', 'personas', 'chats']) {
    fs.mkdirSync(path.join(base, sub), { recursive: true })
  }
  // seed skills from bundled app (para distribuir com skills já dentro do installer)
  try {
    const userSkills = path.join(base, 'skills')
    const isEmpty = fs.existsSync(userSkills) ? fs.readdirSync(userSkills).length === 0 : true
    if (isEmpty) {
      const candidates = [
        path.join(app.getAppPath(), 'skills'),
        path.join(__dirname, '../skills'),
        path.join(__dirname, '../../skills'),
        path.join(process.resourcesPath, 'skills'),
        path.join(process.resourcesPath, 'app.asar/skills'),
      ]
      for (const cand of candidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
          const entries = fs.readdirSync(cand)
          if (entries.length > 0) {
            for (const e of entries) {
              const src = path.join(cand, e)
              const dst = path.join(userSkills, e)
              if (!fs.existsSync(dst)) {
                fs.cpSync(src, dst, { recursive: true })
              }
            }
            console.log(`[seed] ${entries.length} skills copiadas de ${cand} -> ${userSkills}`)
            break
          }
        }
      }
    }
  } catch (e) { console.error('[seed] erro', e) }
}

function resolveIcon() {
  const candidates = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.resourcesPath, 'app.asar/dist/icon.png'),
    path.join(app.getAppPath(), 'public/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
  ]
  for (const p of candidates) if (fs.existsSync(p)) return p
  return undefined
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0f0f12',
    title: 'Noshokk',
    icon: resolveIcon(),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })
  win.once('ready-to-show', () => win?.show())
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ensureDirs()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC: Skills (file-based, SKILL.md per folder) ---
ipcMain.handle('skills:list', async () => {
  const dir = path.join(getUserData(), 'skills')
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  return entries.filter(f => fs.statSync(path.join(dir, f)).isDirectory()).map(name => {
    const p = path.join(dir, name, 'SKILL.md')
    const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
    return { name, content }
  })
})
ipcMain.handle('skills:save', async (_e, { name, content }: { name: string; content: string }) => {
  const dir = path.join(getUserData(), 'skills', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8')
  return { ok: true }
})
ipcMain.handle('skills:delete', async (_e, name: string) => {
  const dir = path.join(getUserData(), 'skills', name)
  fs.rmSync(dir, { recursive: true, force: true })
  return { ok: true }
})

// --- Personas (JSON files) ---
ipcMain.handle('personas:list', async () => {
  const dir = path.join(getUserData(), 'personas')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : []
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return null }
  }).filter(Boolean)
})
ipcMain.handle('personas:save', async (_e, persona: any) => {
  const dir = path.join(getUserData(), 'personas')
  fs.mkdirSync(dir, { recursive: true })
  const id = persona.id || persona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const data = { ...persona, id }
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8')
  return data
})
ipcMain.handle('personas:delete', async (_e, id: string) => {
  fs.rmSync(path.join(getUserData(), 'personas', `${id}.json`), { force: true })
  return { ok: true }
})

// --- Providers (JSON) ---
ipcMain.handle('providers:get', async () => {
  const p = path.join(getUserData(), 'providers.json')
  if (!fs.existsSync(p)) return { providers: [] }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return { providers: [] } }
})
ipcMain.handle('providers:save', async (_e, data: any) => {
  const p = path.join(getUserData(), 'providers.json')
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  return { ok: true }
})

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'] })
  return r.filePaths[0] || null
})

// --- Chats (histórico) ---
ipcMain.handle('chats:list', async () => {
  const dir = path.join(getUserData(), 'chats')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  const chats = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      return { id: data.id, title: data.title || 'Sem título', createdAt: data.createdAt, updatedAt: data.updatedAt, preview: data.messages?.[1]?.content?.slice(0, 80) || data.messages?.[0]?.content?.slice(0, 80) || '' }
    } catch { return null }
  }).filter(Boolean) as any[]
  return chats.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
})
ipcMain.handle('chats:save', async (_e, chat: any) => {
  const dir = path.join(getUserData(), 'chats')
  fs.mkdirSync(dir, { recursive: true })
  const id = chat.id || Date.now().toString(36)
  const now = Date.now()
  const data = { id, title: chat.title || chat.messages?.[0]?.content?.slice(0, 40) || 'Nova conversa', createdAt: chat.createdAt || now, updatedAt: now, messages: chat.messages }
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf8')
  return data
})
ipcMain.handle('chats:load', async (_e, id: string) => {
  const p = path.join(getUserData(), 'chats', `${id}.json`)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
})
ipcMain.handle('chats:delete', async (_e, id: string) => {
  const p = path.join(getUserData(), 'chats', `${id}.json`)
  fs.rmSync(p, { force: true })
  return { ok: true }
})
