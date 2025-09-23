const { contextBridge, ipcRenderer } = require('electron');

// Expõe funções seguras para o processo de renderização (suas páginas HTML)
contextBridge.exposeInMainWorld('electronAPI', {
  // Funções de atualização
  onUpdateProgress: (callback) => ipcRenderer.on('update-download-progress', (_event, value) => callback(value)),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, value) => callback(value)),
  restartApp: () => ipcRenderer.send('restart-app'),

  // Funções de manipulação de dados
  saveFile: (fileName, data) => ipcRenderer.invoke('save-file', fileName, data),
  loadFile: (fileName) => ipcRenderer.invoke('load-file', fileName),
  deleteFile: (fileName) => ipcRenderer.invoke('delete-file', fileName),
  listFiles: () => ipcRenderer.invoke('list-files'),
});