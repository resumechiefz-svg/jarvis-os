const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification } = require('electron')
const path = require('path')

let mainWindow = null
let tray = null
const JARVIS_URL = 'http://localhost:3001'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#020810',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../public/icons/icon-512.png'),
    title: 'Jarvis OS',
  })

  mainWindow.loadURL(JARVIS_URL)

  // Open external links in browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', e => {
    // Hide instead of quit — keeps Jarvis running in background
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  // Simple tray icon
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../public/icons/icon-192.png')
  ).resize({ width: 16, height: 16 })

  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Jarvis',
      click: () => { mainWindow?.show(); mainWindow?.focus() },
    },
    { type: 'separator' },
    {
      label: 'Morning Brief',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.executeJavaScript(`
          window.__jarvisCommand?.('Morning brief')
        `)
      },
    },
    {
      label: 'Portfolio Status',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.executeJavaScript(`
          window.__jarvisCommand?.('Portfolio summary')
        `)
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Jarvis',
      click: () => { app.isQuitting = true; app.quit() },
    },
  ])

  tray.setContextMenu(menu)
  tray.setToolTip('Jarvis OS — AB Command Center')
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else { mainWindow?.show(); mainWindow?.focus() }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()

  // Global notification handler from web
  const { ipcMain } = require('electron')
  ipcMain.on('jarvis-notify', (_, { title, body }) => {
    new Notification({ title: title ?? 'Jarvis', body }).show()
  })
})

app.on('window-all-closed', () => {
  // Keep app running in background (tray)
})

app.on('activate', () => {
  mainWindow?.show()
})

app.on('before-quit', () => {
  app.isQuitting = true
})
