import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import log from 'electron-log';
import { getDatabase, getSetting, closeDatabase } from './modules/storage/database';
import { createProvider } from './modules/ai-providers/index';
import { SemanticSearchService } from './modules/rag/semantic-search.service';
import { WorkflowEngine } from './modules/workflow/index';
import { LocalizationService } from './modules/localization/localization.service';
import { MappingService } from './modules/localization/mapping.service';
import { registerAllIpcHandlers } from './ipc/index';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Expose renderer DevTools protocol only when debugging from VS Code.
const remoteDebugPort = process.env.ELECTRON_REMOTE_DEBUG_PORT;
if (remoteDebugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', remoteDebugPort);
}

let mainWindow: BrowserWindow | null = null;
let workflowEngine: WorkflowEngine | null = null;
let mappingService: MappingService | null = null;
let localizationService: LocalizationService | null = null;

function createWindow(): void {
  // Forge Vite outputs preload bundle next to main bundle as "preload.js".
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'Smart Tech Writer',
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initializeServices(): void {
  // Initialize database (runs migrations)
  getDatabase();

  // Build AI provider from settings
  const apiKey = getSetting('openai.apiKey') ?? '';
  const baseURL = getSetting('openai.baseURL') ?? undefined;
  const provider = createProvider({
    type: 'openai',
    apiKey,
    baseURL: baseURL ?? undefined,
    defaultModel: getSetting('openai.model') ?? 'gpt-4o',
  });

  // Build RAG service (semantic index with keyword fallback)
  const ragDir = getSetting('rag.searchDirectory') ?? '';
  const ragService = new SemanticSearchService(provider, ragDir);

  // Build workflow engine (window-agnostic — events broadcast to all windows)
  workflowEngine = new WorkflowEngine(provider, ragService);

  // Build standalone DITA localization service (shares the same provider)
  mappingService = new MappingService();
  localizationService = new LocalizationService(provider, mappingService);

  // Register all IPC handlers
  registerAllIpcHandlers(workflowEngine, ragService, localizationService, mappingService);

  log.info('Smart Tech Writer services initialized');
}

app.on('ready', () => {
  // Remove the default application menu (File/Edit/View/Window).
  Menu.setApplicationMenu(null);
  createWindow();
  initializeServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
