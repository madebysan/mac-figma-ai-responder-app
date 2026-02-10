/**
 * Secure storage for API keys using Electron's safeStorage.
 * Keys are encrypted using the macOS Keychain.
 */
import { safeStorage } from 'electron';
import Store from 'electron-store';
import path from 'path';

// Type for our stored config
interface AppConfig {
  figmaAccessToken?: string;
  anthropicApiKey?: string;
  pollingInterval?: number;  // in seconds
  claudeModel?: string;
  isSetupComplete?: boolean;
  // Track which comments we've already responded to
  processedComments?: string[];
  // Files to monitor (team files only)
  monitoredFiles?: string[];
}

// Store for app data (sensitive data uses safeStorage, not electron-store encryption)
const store = new Store<{
  encrypted: Record<string, string>;
  plain: Record<string, unknown>;
}>({
  name: 'figma-ai-responder-config',
  // No fallback encryption key - we rely solely on safeStorage for sensitive data
});

/**
 * Encrypt and store a value securely.
 * Requires macOS Keychain (safeStorage) - no fallback to insecure storage.
 */
function setSecure(key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage not available. Cannot store credentials safely.');
  }
  const encrypted = safeStorage.encryptString(value);
  store.set(`encrypted.${key}`, encrypted.toString('base64'));
}

/**
 * Retrieve and decrypt a secure value.
 * Returns null if decryption fails or safeStorage unavailable.
 */
function getSecure(key: string): string | null {
  const value = store.get(`encrypted.${key}`);
  if (!value) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    console.error('[Store] Secure storage not available for decryption');
    return null;
  }

  try {
    const buffer = Buffer.from(value as string, 'base64');
    return safeStorage.decryptString(buffer);
  } catch {
    return null;
  }
}

/**
 * Store configuration values.
 */
export const appStore = {
  // API Keys (encrypted)
  setFigmaToken(token: string): void {
    setSecure('figmaAccessToken', token);
  },

  getFigmaToken(): string | null {
    return getSecure('figmaAccessToken');
  },

  setAnthropicKey(key: string): void {
    setSecure('anthropicApiKey', key);
  },

  getAnthropicKey(): string | null {
    return getSecure('anthropicApiKey');
  },

  // Plain settings
  setPollingInterval(seconds: number): void {
    store.set('plain.pollingInterval', seconds);
  },

  getPollingInterval(): number {
    return (store.get('plain.pollingInterval') as number) || 30;
  },

  setClaudeModel(model: string): void {
    store.set('plain.claudeModel', model);
  },

  getClaudeModel(): string {
    return (store.get('plain.claudeModel') as string) || 'claude-sonnet-4-20250514';
  },

  // Custom system prompt
  setSystemPrompt(prompt: string): void {
    store.set('plain.systemPrompt', prompt);
  },

  getSystemPrompt(): string | null {
    return (store.get('plain.systemPrompt') as string) || null;
  },

  // Custom trigger (e.g., "@ai", "#help", "!feedback")
  setTrigger(trigger: string): void {
    store.set('plain.trigger', trigger.toLowerCase());
  },

  getTrigger(): string {
    return (store.get('plain.trigger') as string) || '@ai';
  },

  // Notifications
  setNotificationsEnabled(enabled: boolean): void {
    store.set('plain.notificationsEnabled', enabled);
  },

  getNotificationsEnabled(): boolean {
    // Default to true
    const value = store.get('plain.notificationsEnabled');
    return value === undefined ? true : (value as boolean);
  },

  setSetupComplete(complete: boolean): void {
    store.set('plain.isSetupComplete', complete);
  },

  isSetupComplete(): boolean {
    return (store.get('plain.isSetupComplete') as boolean) || false;
  },

  // Processed comments tracking
  addProcessedComment(commentId: string): void {
    const processed = this.getProcessedComments();
    if (!processed.includes(commentId)) {
      // Keep last 1000 comments to avoid memory bloat
      const updated = [...processed.slice(-999), commentId];
      store.set('plain.processedComments', updated);
    }
  },

  getProcessedComments(): string[] {
    return (store.get('plain.processedComments') as string[]) || [];
  },

  isCommentProcessed(commentId: string): boolean {
    return this.getProcessedComments().includes(commentId);
  },

  // Monitored files
  setMonitoredFiles(fileKeys: string[]): void {
    store.set('plain.monitoredFiles', fileKeys);
  },

  getMonitoredFiles(): string[] {
    return (store.get('plain.monitoredFiles') as string[]) || [];
  },

  addMonitoredFile(fileKey: string): void {
    const files = this.getMonitoredFiles();
    if (!files.includes(fileKey)) {
      store.set('plain.monitoredFiles', [...files, fileKey]);
    }
  },

  removeMonitoredFile(fileKey: string): void {
    const files = this.getMonitoredFiles();
    store.set('plain.monitoredFiles', files.filter(f => f !== fileKey));
  },

  // Clear all data
  clearAll(): void {
    store.clear();
  },

  // Check if we have valid credentials
  hasCredentials(): boolean {
    return !!(this.getFigmaToken() && this.getAnthropicKey());
  },
};
