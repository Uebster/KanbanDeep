const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const log = require('electron-log');
const fs = require('fs').promises; // Usaremos a versão baseada em Promises do 'fs'

// Nenhuma configuração manual é necessária. O electron-builder cuida disso.
// Opcionalmente, configure o logging para depuração.
autoUpdater.logger = log;
log.transports.file.level = "info";
 
function createWindow () {
  // Cria a janela principal do navegador.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Cria a janela oculta para evitar um "flash" visual.
    webPreferences: {
      // O preload.js é uma ponte segura entre o backend (Node.js) e o frontend (sua página).
      preload: path.join(__dirname, 'js/preload.js'),
      // As opções abaixo são as recomendadas para segurança:
      // - nodeIntegration: false -> Impede que o frontend acesse APIs do Node.js diretamente.
      // - contextIsolation: true -> Garante que o preload e o frontend rodem em contextos diferentes.
      contextIsolation: true
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
  log.info('--- Sessão Iniciada ---');
  log.info(`Versão do App: ${app.getVersion()}`);
  log.info(`Caminho dos logs: ${app.getPath('logs')}`);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- MANIPULAÇÃO DE ATUALIZAÇÕES ---

// O processo renderer chama este evento quando o usuário clica no botão.
ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

// --- MANIPULAÇÃO DE DADOS DO USUÁRIO ---

/** Retorna o caminho para a pasta 'data' dentro do diretório de dados do usuário. */
function getDataPath() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  // Garante que o diretório 'data' exista.
  fs.mkdir(dataDir, { recursive: true }).catch(console.error);
  return dataDir;
}

// O renderer envia um nome de arquivo e dados para serem salvos.
ipcMain.handle('save-file', async (event, fileName, data) => {
  const filePath = path.join(getDataPath(), `${fileName}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
});

// O renderer solicita o conteúdo de um arquivo.
ipcMain.handle('load-file', async (event, fileName) => {
  const filePath = path.join(getDataPath(), `${fileName}.json`);
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    // Se o arquivo não existir, retorna null (comportamento esperado).
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

// O renderer solicita a remoção de um arquivo.
ipcMain.handle('delete-file', async (event, fileName) => {
  const filePath = path.join(getDataPath(), `${fileName}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true; // Já não existe, considera sucesso.
    console.error(`Falha ao deletar arquivo ${fileName}:`, error);
    return false;
  }
});

// O renderer solicita a lista de todos os arquivos de dados.
ipcMain.handle('list-files', async () => {
  const files = await fs.readdir(getDataPath());
  // Retorna apenas os nomes de arquivo sem a extensão .json
  return files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
});

// Evento para reiniciar o app e instalar a atualização
ipcMain.on('restart-app', () => {
  autoUpdater.quitAndInstall();
});

// Encaminha os eventos do autoUpdater para a janela para que o usuário veja o status.
function sendUpdateStatusToWindow(statusKey) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send('update-status', statusKey);
  }
}

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatusToWindow('checking');
});
autoUpdater.on('update-available', (info) => {
  sendUpdateStatusToWindow('available');
});
autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatusToWindow('not-available');
});
autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatusToWindow('downloaded');
});
autoUpdater.on('error', (error) => {
  sendUpdateStatusToWindow(`error: ${error.message}`);
});