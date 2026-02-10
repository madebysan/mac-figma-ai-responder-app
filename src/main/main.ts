/**
 * Main Electron process.
 * Creates menu bar tray app with setup and status windows.
 */
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  NativeImage,
} from 'electron';
import path from 'path';
import { appStore } from './store';
import {
  startPolling,
  stopPolling,
  isPollingActive,
  getStatus,
  pollNow,
  onStatusChange,
} from './polling';
import { getCurrentUser } from '../services/figma-api';
import { verifyApiKey } from '../services/claude-api';

// Windows
let setupWindow: BrowserWindow | null = null;
let statusWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Get the path to renderer files
const rendererPath = path.join(__dirname, '..', 'renderer');
const preloadPath = path.join(__dirname, 'preload.js');
const assetsPath = path.join(__dirname, '..', '..', 'assets');

// Tray icons for different states
let trayIconActive: NativeImage;
let trayIconInactive: NativeImage;

/**
 * Create the setup window for first-time configuration.
 */
function createSetupWindow(): void {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  setupWindow.loadFile(path.join(rendererPath, 'setup.html'));

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

/**
 * Create the status/dashboard window.
 */
function createStatusWindow(): void {
  if (statusWindow) {
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 420,
    height: 700,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  statusWindow.loadFile(path.join(rendererPath, 'index.html'));

  statusWindow.on('closed', () => {
    statusWindow = null;
  });
}

/**
 * Load tray icons for active and inactive states.
 */
function loadTrayIcons(): void {
  // Load active icon (filled chat bubble with dot)
  const activeIconPath = path.join(assetsPath, 'tray-icon-active.png');
  trayIconActive = nativeImage.createFromPath(activeIconPath);
  trayIconActive.setTemplateImage(true);

  // Load inactive icon (outline chat bubble)
  const inactiveIconPath = path.join(assetsPath, 'tray-icon-inactive.png');
  trayIconInactive = nativeImage.createFromPath(inactiveIconPath);
  trayIconInactive.setTemplateImage(true);

  // Fallback if icons don't load
  if (trayIconActive.isEmpty()) {
    trayIconActive = nativeImage.createEmpty();
  }
  if (trayIconInactive.isEmpty()) {
    trayIconInactive = nativeImage.createEmpty();
  }
}

/**
 * Create the menu bar tray icon and menu.
 */
function createTray(): void {
  // Load both icon states
  loadTrayIcons();

  // Start with inactive icon
  tray = new Tray(trayIconInactive);
  tray.setToolTip('Figma AI Responder');

  updateTrayMenu();

  // Listen for status changes to update menu and icon
  onStatusChange(() => {
    updateTrayMenu();
    // Notify renderer windows
    statusWindow?.webContents.send('status-update', getStatus());
  });
}

/**
 * Update the tray menu and icon based on current state.
 */
function updateTrayMenu(): void {
  if (!tray) return;

  const status = getStatus();
  const isActive = isPollingActive();
  const hasCredentials = appStore.hasCredentials();
  const files = appStore.getMonitoredFiles();

  // Update tray icon based on status
  tray.setImage(isActive ? trayIconActive : trayIconInactive);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isActive ? '● Running' : '○ Stopped',
      enabled: false,
    },
    {
      label: `${files.length} file(s) monitored`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isActive ? 'Stop Monitoring' : 'Start Monitoring',
      enabled: hasCredentials && files.length > 0,
      click: () => {
        if (isActive) {
          stopPolling();
        } else {
          startPolling();
        }
      },
    },
    {
      label: 'Check Now',
      enabled: hasCredentials && files.length > 0,
      click: () => pollNow(),
    },
    { type: 'separator' },
    {
      label: 'Open',
      click: () => createStatusWindow(),
    },
    {
      label: 'API Keys...',
      click: () => createSetupWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopPolling();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Update tooltip with status
  const tooltip = isActive
    ? `Figma AI Responder - Running\n${files.length} file(s) monitored`
    : 'Figma AI Responder - Stopped';
  tray.setToolTip(tooltip);
}

/**
 * Set up IPC handlers for renderer communication.
 */
function setupIPC(): void {
  // Save settings
  ipcMain.handle('save-settings', async (_event, settings) => {
    try {
      if (settings.figmaToken) {
        appStore.setFigmaToken(settings.figmaToken);
      }
      if (settings.anthropicKey) {
        appStore.setAnthropicKey(settings.anthropicKey);
      }
      if (settings.pollingInterval) {
        appStore.setPollingInterval(settings.pollingInterval);
      }
      appStore.setSetupComplete(true);
      updateTrayMenu();

      // Open dashboard after saving if no files are monitored yet
      const files = appStore.getMonitoredFiles();
      if (files.length === 0) {
        setTimeout(() => createStatusWindow(), 300);
      }

      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  });

  // Get settings
  ipcMain.handle('get-settings', async () => {
    return {
      hasCredentials: appStore.hasCredentials(),
      pollingInterval: appStore.getPollingInterval(),
      claudeModel: appStore.getClaudeModel(),
      systemPrompt: appStore.getSystemPrompt(),
      trigger: appStore.getTrigger(),
    };
  });

  // Update Claude model
  ipcMain.handle('set-claude-model', async (_event, model: string) => {
    appStore.setClaudeModel(model);
    return true;
  });

  // Update system prompt
  ipcMain.handle('set-system-prompt', async (_event, prompt: string) => {
    appStore.setSystemPrompt(prompt);
    return true;
  });

  // Update trigger
  ipcMain.handle('set-trigger', async (_event, trigger: string) => {
    appStore.setTrigger(trigger);
    return true;
  });

  // Notifications
  ipcMain.handle('set-notifications-enabled', async (_event, enabled: boolean) => {
    appStore.setNotificationsEnabled(enabled);
    return true;
  });

  ipcMain.handle('get-notifications-enabled', async () => {
    return appStore.getNotificationsEnabled();
  });

  // File monitoring
  ipcMain.handle('add-file', async (_event, fileKey: string) => {
    appStore.addMonitoredFile(fileKey);
    updateTrayMenu();
    return true;
  });

  ipcMain.handle('remove-file', async (_event, fileKey: string) => {
    appStore.removeMonitoredFile(fileKey);
    updateTrayMenu();
    return true;
  });

  ipcMain.handle('get-monitored-files', async () => {
    return appStore.getMonitoredFiles();
  });

  // Polling control
  ipcMain.handle('start-polling', async () => {
    startPolling();
    updateTrayMenu();
  });

  ipcMain.handle('stop-polling', async () => {
    stopPolling();
    updateTrayMenu();
  });

  ipcMain.handle('poll-now', async () => {
    pollNow();
  });

  ipcMain.handle('get-status', async () => {
    return getStatus();
  });

  // Validation
  ipcMain.handle('validate-figma-token', async (_event, token: string) => {
    try {
      await getCurrentUser(token);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('validate-anthropic-key', async (_event, key: string) => {
    return verifyApiKey(key);
  });

  // Window controls
  ipcMain.handle('close-window', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });
}

/**
 * App initialization.
 */
app.whenReady().then(() => {
  // Hide dock icon (menu bar app only)
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  setupIPC();
  createTray();

  // Show setup if no credentials
  if (!appStore.hasCredentials()) {
    createSetupWindow();
  } else {
    // Auto-start polling if we have credentials and files
    const files = appStore.getMonitoredFiles();
    if (files.length > 0) {
      startPolling();
    }
  }
});

// Prevent app from quitting when all windows are closed (menu bar app)
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

// Handle activate (macOS)
app.on('activate', () => {
  if (!setupWindow && !statusWindow) {
    if (appStore.hasCredentials()) {
      createStatusWindow();
    } else {
      createSetupWindow();
    }
  }
});
