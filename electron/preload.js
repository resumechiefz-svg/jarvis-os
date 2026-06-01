const { contextBridge, ipcRenderer } = require('electron')

// Expose safe Electron APIs to the web app
contextBridge.exposeInMainWorld('electron', {
  notify: (title, body) => ipcRenderer.send('jarvis-notify', { title, body }),
  isElectron: true,
})
