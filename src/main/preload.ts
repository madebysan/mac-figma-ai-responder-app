/**
 * Preload script - bridges main process and renderer.
 * Exposes safe APIs to the renderer process.
 */
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  saveSettings: (settings: {
    figmaToken: string;
    anthropicKey: string;
    pollingInterval?: number;
  }) => ipcRenderer.invoke('save-settings', settings),

  getSettings: () => ipcRenderer.invoke('get-settings'),

  // Settings updates
  setClaudeModel: (model: string) => ipcRenderer.invoke('set-claude-model', model),
  setSystemPrompt: (prompt: string) => ipcRenderer.invoke('set-system-prompt', prompt),
  setTrigger: (trigger: string) => ipcRenderer.invoke('set-trigger', trigger),
  setNotificationsEnabled: (enabled: boolean) => ipcRenderer.invoke('set-notifications-enabled', enabled),
  getNotificationsEnabled: () => ipcRenderer.invoke('get-notifications-enabled'),

  // File monitoring
  addFile: (fileKey: string) => ipcRenderer.invoke('add-file', fileKey),
  removeFile: (fileKey: string) => ipcRenderer.invoke('remove-file', fileKey),
  getMonitoredFiles: () => ipcRenderer.invoke('get-monitored-files'),

  // Polling control
  startPolling: () => ipcRenderer.invoke('start-polling'),
  stopPolling: () => ipcRenderer.invoke('stop-polling'),
  pollNow: () => ipcRenderer.invoke('poll-now'),
  getStatus: () => ipcRenderer.invoke('get-status'),

  // Validation
  validateFigmaToken: (token: string) => ipcRenderer.invoke('validate-figma-token', token),
  validateAnthropicKey: (key: string) => ipcRenderer.invoke('validate-anthropic-key', key),

  // Events
  onStatusUpdate: (callback: (status: unknown) => void) => {
    ipcRenderer.on('status-update', (_event, status) => callback(status));
  },

  // Window controls
  closeWindow: () => ipcRenderer.invoke('close-window'),
});

// Type declaration for the renderer
declare global {
  interface Window {
    electronAPI: {
      saveSettings: (settings: {
        figmaToken: string;
        anthropicKey: string;
        pollingInterval?: number;
      }) => Promise<boolean>;
      getSettings: () => Promise<{
        hasCredentials: boolean;
        pollingInterval: number;
        claudeModel: string;
        systemPrompt: string | null;
        trigger: string;
      }>;
      setClaudeModel: (model: string) => Promise<boolean>;
      setSystemPrompt: (prompt: string) => Promise<boolean>;
      setTrigger: (trigger: string) => Promise<boolean>;
      setNotificationsEnabled: (enabled: boolean) => Promise<boolean>;
      getNotificationsEnabled: () => Promise<boolean>;
      addFile: (fileKey: string) => Promise<boolean>;
      removeFile: (fileKey: string) => Promise<boolean>;
      getMonitoredFiles: () => Promise<string[]>;
      startPolling: () => Promise<void>;
      stopPolling: () => Promise<void>;
      pollNow: () => Promise<void>;
      getStatus: () => Promise<{
        isActive: boolean;
        lastCheck: Date | null;
        filesMonitored: number;
        commentsProcessed: number;
        lastError: string | null;
      }>;
      validateFigmaToken: (token: string) => Promise<boolean>;
      validateAnthropicKey: (key: string) => Promise<boolean>;
      onStatusUpdate: (callback: (status: unknown) => void) => void;
      closeWindow: () => Promise<void>;
    };
  }
}
