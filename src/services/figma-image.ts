/**
 * Screenshot capture service for Figma comments.
 */
import { FigmaNode } from '../types';
import { getFile, getImages, getComment } from './figma-api';

/**
 * Find a node by ID in the document tree.
 */
function findNodeById(root: FigmaNode, targetId: string): FigmaNode | null {
  if (root.id === targetId) {
    return root;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find the path from root to a specific node.
 * Returns array of nodes from root to target.
 */
function findPathToNode(
  root: FigmaNode,
  targetId: string,
  path: FigmaNode[] = []
): FigmaNode[] | null {
  const currentPath = [...path, root];

  if (root.id === targetId) {
    return currentPath;
  }

  if (root.children) {
    for (const child of root.children) {
      const found = findPathToNode(child, targetId, currentPath);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Find a suitable frame to screenshot for the given node.
 * Prefers the direct parent frame of the node, not the top-level page frame.
 */
function findBestFrameToScreenshot(document: FigmaNode, nodeId: string): string | null {
  const path = findPathToNode(document, nodeId);
  if (!path || path.length < 3) {
    return null;
  }

  // path structure: DOCUMENT > PAGE > ... > parent frame > element
  // We want to find the closest FRAME ancestor, not the top-level one

  // Start from the node and go up, looking for a FRAME type
  // Skip the last item (the node itself) and look for frames
  for (let i = path.length - 1; i >= 2; i--) {
    const node = path[i];
    // Check if this is a frame-like container
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'GROUP') {
      console.log(`[Image] Found frame to screenshot: ${node.name} (${node.id}) at depth ${i}`);
      return node.id;
    }
  }

  // Fallback to top-level frame if no intermediate frame found
  console.log(`[Image] No intermediate frame found, using top-level frame`);
  return path[2].id;
}

/**
 * Download an image URL and convert to base64.
 */
async function downloadAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return base64;
}

/**
 * Get a screenshot for a comment.
 * Finds the parent frame of the commented element and exports it as PNG.
 */
export async function getScreenshotForComment(
  token: string,
  fileKey: string,
  commentId: string
): Promise<{ imageBase64: string | null; nodeId: string | null; parentFrameId: string | null }> {
  // 1. Get comment details to find the node_id
  const comment = await getComment(token, fileKey, commentId);
  if (!comment) {
    console.error(`[Image] Comment ${commentId} not found`);
    return { imageBase64: null, nodeId: null, parentFrameId: null };
  }

  // Debug: log the full client_meta to see what we're getting
  console.log(`[Image] Comment client_meta:`, JSON.stringify(comment.client_meta, null, 2));

  const nodeId = comment.client_meta?.node_id || null;
  if (!nodeId) {
    // Comment isn't pinned to a specific element
    console.log(`[Image] No node_id found - comment may be on canvas, not pinned to an element`);
    console.log(`[Image] To pin a comment: click on an element first, then add comment`);
    return { imageBase64: null, nodeId: null, parentFrameId: null };
  }

  console.log(`[Image] Found node_id: ${nodeId}`);

  // 2. Get file structure to find the best frame to screenshot
  const file = await getFile(token, fileKey);
  const parentFrameId = findBestFrameToScreenshot(file.document, nodeId);

  if (!parentFrameId) {
    console.error('[Image] Could not find parent frame for node');
    return { imageBase64: null, nodeId, parentFrameId: null };
  }

  // 3. Export the frame as PNG
  try {
    const images = await getImages(token, fileKey, [parentFrameId], {
      format: 'png',
      scale: 2, // 2x for better quality
    });

    const imageUrl = images[parentFrameId];
    if (!imageUrl) {
      console.error('[Image] No image URL returned for frame');
      return { imageBase64: null, nodeId, parentFrameId };
    }

    // 4. Download and convert to base64
    const imageBase64 = await downloadAsBase64(imageUrl);

    return { imageBase64, nodeId, parentFrameId };
  } catch (error) {
    console.error('[Image] Failed to export image:', error);
    return { imageBase64: null, nodeId, parentFrameId };
  }
}
