import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] hermes bridge loading')
contextBridge.exposeInMainWorld('hermes', {
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    save: (p: any) => ipcRenderer.invoke('skills:save', p),
    delete: (name: string) => ipcRenderer.invoke('skills:delete', name),
  },
  personas: {
    list: () => ipcRenderer.invoke('personas:list'),
    save: (p: any) => ipcRenderer.invoke('personas:save', p),
    delete: (id: string) => ipcRenderer.invoke('personas:delete', id),
  },
  providers: {
    get: () => ipcRenderer.invoke('providers:get'),
    save: (d: any) => ipcRenderer.invoke('providers:save', d),
  },
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    save: (c: any) => ipcRenderer.invoke('chats:save', c),
    load: (id: string) => ipcRenderer.invoke('chats:load', id),
    delete: (id: string) => ipcRenderer.invoke('chats:delete', id),
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
  },
})

declare global {
  interface Window { hermes: any }
}
