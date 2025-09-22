const { app, BrowserWindow, ipcMain, autoUpdater, dialog } = require('electron');
const path = require('path');

// Configuração manual do autoUpdater para apontar para o seu repositório GitHub.
const server = 'https://update.electronjs.org';
const repo = 'Uebster/KanbanDeep'; // Substitua pelo seu usuário/repositório
const feed = `${server}/${repo}/${process.platform}-${process.arch}/${app.getVersion()}`;

autoUpdater.setFeedURL({ url: feed });
 
function createWindow () {
  // Cria a janela principal do navegador.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Cria a janela oculta para evitar um "flash" visual.
    webPreferences: {
      // O preload.js é uma ponte segura entre o backend (Node.js) e o frontend (sua página).
      preload: path.join(__dirname, 'js', 'preload.js'),
      // Habilitar a integração com Node.js é necessário para que seus scripts de página
      // possam usar 'require', se necessário.
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Carrega o arquivo HTML inicial da sua aplicação.
  mainWindow.loadFile('pages/introduction.html');

  // Quando a janela estiver pronta para ser exibida, maximize-a e mostre-a.
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Opcional: Descomente a linha abaixo para abrir as ferramentas de desenvolvedor ao iniciar.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- MANIPULAÇÃO DE ATUALIZAÇÕES ---

// O renderer process chama este evento quando o usuário clica no botão.
ipcMain.on('check-for-updates', () => {
  // O `update-electron-app` já configurou o autoUpdater.
  // Nós apenas disparamos a verificação.
  autoUpdater.checkForUpdates();
});

// Evento para reiniciar o app e instalar a atualização.
ipcMain.on('restart-app', () => {
  autoUpdater.quitAndInstall();
});

// Encaminha os eventos do autoUpdater para a janela para que o usuário veja o status.
function sendUpdateStatusToWindow(text) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', text);
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatusToWindow('checking');
});

autoUpdater.on('update-available', () => {
  sendUpdateStatusToWindow('available');
});

autoUpdater.on('update-not-available', () => {
  sendUpdateStatusToWindow('not-available');
});

autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
  sendUpdateStatusToWindow('downloaded');
});

autoUpdater.on('error', (error) => {
  sendUpdateStatusToWindow(`error: ${error.message}`);
});