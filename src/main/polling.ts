/**
 * Polling service that checks Figma for new @AI comments.
 * Replaces the webhook-based approach for the desktop app.
 */
import { Notification } from 'electron';
import { appStore } from './store';
import { getComments, postComment, getFile } from '../services/figma-api';
import { getScreenshotForComment } from '../services/figma-image';
import { generateResponse } from '../services/claude-api';
import { FigmaComment, CommentContext, ThreadMessage } from '../types';

/**
 * Check if a comment should trigger AI based on configured trigger.
 */
function shouldTriggerAI(text: string): boolean {
  const trigger = appStore.getTrigger();
  const lowerText = text.toLowerCase();
  return lowerText.includes(trigger.toLowerCase());
}

/**
 * Build the thread history for a comment by following parent_id chain.
 * Returns messages in chronological order (oldest first).
 */
function buildThreadHistory(
  allComments: FigmaComment[],
  targetComment: FigmaComment
): ThreadMessage[] {
  const thread: ThreadMessage[] = [];
  const commentsById = new Map(allComments.map(c => [c.id, c]));

  // Find the root comment of this thread
  let rootId = targetComment.id;
  let current = targetComment;
  while (current.parent_id && current.parent_id !== '') {
    rootId = current.parent_id;
    const parent = commentsById.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }

  // Collect all comments in this thread
  const threadComments: FigmaComment[] = [];

  // Add root comment
  const root = commentsById.get(rootId);
  if (root) {
    threadComments.push(root);
  }

  // Add all replies to this thread (comments with parent_id matching root or other thread comments)
  const threadIds = new Set([rootId]);
  let foundMore = true;
  while (foundMore) {
    foundMore = false;
    for (const comment of allComments) {
      if (!threadIds.has(comment.id) && comment.parent_id && threadIds.has(comment.parent_id)) {
        threadComments.push(comment);
        threadIds.add(comment.id);
        foundMore = true;
      }
    }
  }

  // Sort by created_at
  threadComments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Convert to ThreadMessage format, excluding the target comment itself
  for (const comment of threadComments) {
    if (comment.id === targetComment.id) continue; // Skip the current comment

    thread.push({
      userName: comment.user.handle,
      message: comment.message,
      // Mark as AI if the message doesn't contain the trigger (AI responses don't have trigger)
      isAI: !shouldTriggerAI(comment.message),
    });
  }

  return thread;
}

// Polling state
let pollingInterval: NodeJS.Timeout | null = null;
let isPolling = false;

// Event callbacks
type StatusCallback = (status: PollingStatus) => void;
let statusCallback: StatusCallback | null = null;

export interface PollingStatus {
  isActive: boolean;
  lastCheck: Date | null;
  filesMonitored: number;
  commentsProcessed: number;
  lastError: string | null;
}

let status: PollingStatus = {
  isActive: false,
  lastCheck: null,
  filesMonitored: 0,
  commentsProcessed: 0,
  lastError: null,
};

/**
 * Set callback for status updates.
 */
export function onStatusChange(callback: StatusCallback): void {
  statusCallback = callback;
}

function updateStatus(updates: Partial<PollingStatus>): void {
  status = { ...status, ...updates };
  statusCallback?.(status);
}

/**
 * Process a single comment that triggered AI.
 */
async function processComment(
  token: string,
  anthropicKey: string,
  model: string,
  systemPrompt: string | null,
  fileKey: string,
  fileName: string,
  comment: FigmaComment,
  allComments: FigmaComment[]
): Promise<void> {
  console.log(`[Polling] Processing comment ${comment.id} in ${fileName}`);

  try {
    // Build thread history for context
    const threadHistory = buildThreadHistory(allComments, comment);
    if (threadHistory.length > 0) {
      console.log(`[Polling] Found ${threadHistory.length} previous messages in thread`);
    }

    // Get screenshot - for replies, try to get screenshot from root comment's node
    let screenshotCommentId = comment.id;
    if (comment.parent_id && comment.parent_id !== '') {
      // For replies, use the root comment to find the pinned node
      let rootId = comment.parent_id;
      const commentsById = new Map(allComments.map(c => [c.id, c]));
      let current = commentsById.get(rootId);
      while (current && current.parent_id && current.parent_id !== '') {
        rootId = current.parent_id;
        current = commentsById.get(rootId);
      }
      screenshotCommentId = rootId;
    }

    const { imageBase64, nodeId, parentFrameId } = await getScreenshotForComment(
      token,
      fileKey,
      screenshotCommentId
    );

    // Build context
    const context: CommentContext = {
      fileKey,
      fileName,
      commentId: comment.id,
      commentText: comment.message,
      nodeId,
      userName: comment.user.handle,
      parentFrameId,
      imageBase64,
      threadHistory,
    };

    // Generate AI response
    console.log(`[Polling] Generating AI response...`);
    const aiResponse = await generateResponse(anthropicKey, model, context, systemPrompt);

    // Find the root comment ID to reply to (Figma only allows replies to root comments)
    let replyToId = comment.id;
    if (comment.parent_id && comment.parent_id !== '') {
      // Find the root of this thread
      const commentsById = new Map(allComments.map(c => [c.id, c]));
      let current = comment;
      while (current.parent_id && current.parent_id !== '') {
        const parent = commentsById.get(current.parent_id);
        if (!parent) break;
        current = parent;
      }
      replyToId = current.id;
    }

    // Post reply
    console.log(`[Polling] Posting reply to ${replyToId}...`);
    await postComment(token, fileKey, aiResponse, replyToId);

    // Mark as processed
    appStore.addProcessedComment(comment.id);
    updateStatus({ commentsProcessed: status.commentsProcessed + 1 });

    console.log(`[Polling] Successfully replied to comment ${comment.id}`);

    // Show notification if enabled
    const notificationsEnabled = appStore.getNotificationsEnabled();
    console.log(`[Polling] Notifications enabled: ${notificationsEnabled}`);
    if (notificationsEnabled) {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'Figma AI Responder',
          body: `Replied to ${comment.user.handle} in ${fileName}`,
          silent: false,
        });
        notification.show();
        console.log(`[Polling] Notification shown`);
      } else {
        console.log(`[Polling] Notifications not supported on this system`);
      }
    }
  } catch (error) {
    console.error(`[Polling] Error processing comment ${comment.id}:`, error);
    updateStatus({ lastError: `Failed to process comment: ${error}` });
  }
}

/**
 * Check a single file for new @AI comments.
 */
async function checkFile(
  token: string,
  anthropicKey: string,
  model: string,
  systemPrompt: string | null,
  fileKey: string
): Promise<void> {
  try {
    // Get file info for the name
    const file = await getFile(token, fileKey);
    const fileName = file.name;

    // Get all comments
    const comments = await getComments(token, fileKey);

    // Filter for unprocessed comments with trigger (including replies)
    const newAIComments = comments.filter((comment) => {
      // Skip if already processed
      if (appStore.isCommentProcessed(comment.id)) {
        return false;
      }

      // Skip resolved comments
      if (comment.resolved_at) {
        return false;
      }

      // Check if it triggers AI
      return shouldTriggerAI(comment.message);
    });

    // Process each new comment
    for (const comment of newAIComments) {
      await processComment(token, anthropicKey, model, systemPrompt, fileKey, fileName, comment, comments);
    }
  } catch (error) {
    console.error(`[Polling] Error checking file ${fileKey}:`, error);
    // Don't throw - continue with other files
  }
}

/**
 * Run a single polling cycle.
 */
async function pollOnce(): Promise<void> {
  const token = appStore.getFigmaToken();
  const anthropicKey = appStore.getAnthropicKey();
  const model = appStore.getClaudeModel();
  const systemPrompt = appStore.getSystemPrompt();
  const files = appStore.getMonitoredFiles();

  if (!token || !anthropicKey) {
    updateStatus({ lastError: 'Missing API credentials' });
    return;
  }

  if (files.length === 0) {
    updateStatus({ lastError: 'No files to monitor' });
    return;
  }

  updateStatus({
    filesMonitored: files.length,
    lastError: null,
  });

  console.log(`[Polling] Checking ${files.length} file(s)...`);

  for (const fileKey of files) {
    await checkFile(token, anthropicKey, model, systemPrompt, fileKey);
  }

  updateStatus({ lastCheck: new Date() });
  console.log(`[Polling] Check complete`);
}

/**
 * Start the polling loop.
 */
export function startPolling(): void {
  if (isPolling) {
    console.log('[Polling] Already running');
    return;
  }

  if (!appStore.hasCredentials()) {
    console.log('[Polling] Cannot start - missing credentials');
    updateStatus({ lastError: 'Missing API credentials' });
    return;
  }

  const intervalSeconds = appStore.getPollingInterval();
  console.log(`[Polling] Starting with ${intervalSeconds}s interval`);

  isPolling = true;
  updateStatus({ isActive: true, lastError: null });

  // Run immediately, then on interval
  pollOnce();

  pollingInterval = setInterval(() => {
    pollOnce();
  }, intervalSeconds * 1000);
}

/**
 * Stop the polling loop.
 */
export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  isPolling = false;
  updateStatus({ isActive: false });
  console.log('[Polling] Stopped');
}

/**
 * Check if polling is active.
 */
export function isPollingActive(): boolean {
  return isPolling;
}

/**
 * Get current status.
 */
export function getStatus(): PollingStatus {
  return { ...status };
}

/**
 * Manually trigger a poll.
 */
export function pollNow(): void {
  if (appStore.hasCredentials()) {
    pollOnce();
  }
}
