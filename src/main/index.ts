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
import { GlossaryService } from './modules/glossary/glossary.service';
import { registerAllIpcHandlers } from './ipc/index';
import { en as ui } from '../shared/i18n';

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
let glossaryService: GlossaryService | null = null;

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
    title: ui.common.productName,
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
    reasoningEffort: (getSetting('openai.reasoningEffort') as 'none' | 'low' | 'medium' | 'high' | null) ?? 'medium',
  });

  // Build RAG service (semantic index with keyword fallback)
  const ragDir = getSetting('rag.searchDirectory') ?? '';
  const ragService = new SemanticSearchService(provider, ragDir);

  // Build workflow engine (window-agnostic — events broadcast to all windows)
  workflowEngine = new WorkflowEngine(provider, ragService);

  // Build standalone DITA localization service (shares the same provider)
  mappingService = new MappingService();
  glossaryService = new GlossaryService();
  // P4-7: persist the vector index snapshot under userData/cache.
  glossaryService.setSnapshotDir(path.join(app.getPath('userData'), 'cache'));
  workflowEngine.setGlossaryService(glossaryService);
  mappingService.setGlossaryService(glossaryService);
  localizationService = new LocalizationService(provider, mappingService);
  localizationService.setGlossaryService(glossaryService);

  // Backfill aliases for rows created before P2a, then warm the index in the
  // background so the first translation does not pay the build cost. The async
  // warm-up also kicks off background vector indexing when the semantic model
  // is installed (P2b), which never blocks the UI.
  mappingService.backfillAliases();
  setTimeout(() => {
    void glossaryService
      ?.warmUpAsync()
      .catch((err) => log.warn('Glossary warm-up failed:', err));
  }, 10_000);

  // Register all IPC handlers
  registerAllIpcHandlers(workflowEngine, ragService, localizationService, mappingService, glossaryService);

  log.info(`${ui.common.productName} services initialized`);
}

app.on('ready', () => {
  // Remove the default application menu (File/Edit/View/Window).
  Menu.setApplicationMenu(null);
  createWindow();
  initializeServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    glossaryService?.dispose();
    closeDatabase();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
