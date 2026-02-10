/**
 * Figma API client.
 * All functions accept token as a parameter for flexibility.
 */
import {
  FigmaCommentsResponse,
  FigmaComment,
  FigmaFile,
  FigmaImagesResponse,
} from '../types';

const FIGMA_API_BASE = 'https://api.figma.com/v1';

/**
 * Make an authenticated request to the Figma REST API.
 */
async function figmaFetch<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${FIGMA_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Figma-Token': token,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Figma API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Get all comments for a file.
 */
export async function getComments(token: string, fileKey: string): Promise<FigmaComment[]> {
  const data = await figmaFetch<FigmaCommentsResponse>(
    `/files/${fileKey}/comments`,
    token
  );
  return data.comments;
}

/**
 * Get a specific comment by ID.
 */
export async function getComment(
  token: string,
  fileKey: string,
  commentId: string
): Promise<FigmaComment | null> {
  const comments = await getComments(token, fileKey);
  return comments.find((c) => c.id === commentId) || null;
}

/**
 * Post a reply to a comment.
 */
export async function postComment(
  token: string,
  fileKey: string,
  message: string,
  parentId: string
): Promise<FigmaComment> {
  const data = await figmaFetch<FigmaComment>(
    `/files/${fileKey}/comments`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        comment_id: parentId,
      }),
    }
  );

  return data;
}

/**
 * Get file structure (for finding parent frames).
 */
export async function getFile(token: string, fileKey: string): Promise<FigmaFile> {
  // Get minimal file data - just structure, no geometry
  const data = await figmaFetch<FigmaFile>(
    `/files/${fileKey}?depth=10`,
    token
  );
  return data;
}

/**
 * Get specific nodes from a file.
 */
export async function getFileNodes(
  token: string,
  fileKey: string,
  nodeIds: string[]
): Promise<Record<string, { document: FigmaFile['document'] }>> {
  const ids = nodeIds.join(',');
  const data = await figmaFetch<{
    nodes: Record<string, { document: FigmaFile['document'] }>;
  }>(
    `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`,
    token
  );
  return data.nodes;
}

/**
 * Export nodes as images.
 */
export async function getImages(
  token: string,
  fileKey: string,
  nodeIds: string[],
  options: { format?: 'png' | 'svg' | 'pdf'; scale?: number } = {}
): Promise<Record<string, string | null>> {
  const { format = 'png', scale = 2 } = options;
  const ids = nodeIds.join(',');

  const data = await figmaFetch<FigmaImagesResponse>(
    `/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
    token
  );

  if (data.err) {
    throw new Error(`Figma Images API error: ${data.err}`);
  }

  return data.images;
}

/**
 * Get current user's info (to verify token).
 */
export async function getCurrentUser(token: string): Promise<{ id: string; handle: string; email: string }> {
  return figmaFetch('/me', token);
}

/**
 * Get team projects (to find files to monitor).
 */
export async function getTeamProjects(token: string, teamId: string): Promise<{
  name: string;
  projects: { id: string; name: string }[];
}> {
  return figmaFetch(`/teams/${teamId}/projects`, token);
}
