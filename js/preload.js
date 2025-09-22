const { ipcRenderer } = require('electron');

// Expõe de forma segura o ipcRenderer para o processo de renderização (sua página)
// para que eles possam se comunicar.
window.ipcRenderer = ipcRenderer;