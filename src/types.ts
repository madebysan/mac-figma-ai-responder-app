// Figma Webhook Payload for FILE_COMMENT events
export interface FigmaWebhookPayload {
  event_type: 'FILE_COMMENT' | 'PING';
  passcode: string;
  timestamp: string;
  webhook_id: string;
  // FILE_COMMENT specific fields
  file_key?: string;
  file_name?: string;
  comment_id?: string;
  comment?: FigmaCommentPayload[];
  triggered_by?: {
    id: string;
    handle: string;
  };
}

// Comment in webhook payload (minimal)
export interface FigmaCommentPayload {
  text: string;
}

// Full comment from REST API
export interface FigmaComment {
  id: string;
  uuid: string;
  file_key: string;
  parent_id: string;
  user: FigmaUser;
  created_at: string;
  resolved_at: string | null;
  message: string;
  order_id: string | number;
  client_meta: FigmaClientMeta | null;
  reactions: FigmaReaction[];
}

export interface FigmaUser {
  id: string;
  handle: string;
  img_url: string;
  email?: string;
}

export interface FigmaClientMeta {
  node_id?: string;
  node_offset?: {
    x: number;
    y: number;
  };
}

export interface FigmaReaction {
  user: FigmaUser;
  emoji: string;
  created_at: string;
}

// Figma File Structure
export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  schemaVersion: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

// Figma Images API response
export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>;
}

// Figma Comments API response
export interface FigmaCommentsResponse {
  comments: FigmaComment[];
}

// A single message in a comment thread
export interface ThreadMessage {
  userName: string;
  message: string;
  isAI: boolean;
}

// Comment context for AI
export interface CommentContext {
  fileKey: string;
  fileName: string;
  commentId: string;
  commentText: string;
  nodeId: string | null;
  userName: string;
  parentFrameId: string | null;
  imageBase64: string | null;
  threadHistory: ThreadMessage[];
}
