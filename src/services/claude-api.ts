/**
 * Claude API client for generating design feedback.
 */
import Anthropic from '@anthropic-ai/sdk';
import { CommentContext } from '../types';
import { getSystemPrompt } from '../prompts/system-prompt';

/**
 * Generate an AI response to a Figma comment.
 * Uses Claude's vision to analyze the design screenshot.
 */
export async function generateResponse(
  apiKey: string,
  model: string,
  context: CommentContext,
  customSystemPrompt?: string | null
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey,
  });

  const { commentText, imageBase64, fileName, userName } = context;

  // Build the user message content
  const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  // Add image if we have one
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: imageBase64,
      },
    });
  }

  // Add the comment text
  const textPrompt = buildUserPrompt(context);
  userContent.push({
    type: 'text',
    text: textPrompt,
  });

  try {
    const systemPrompt = customSystemPrompt || getSystemPrompt();
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    // Extract text from response
    const textBlock = message.content.find((block) => block.type === 'text');
    const response = textBlock?.type === 'text' ? textBlock.text : 'I couldn\'t generate a response.';

    return response;
  } catch (error) {
    console.error('[Claude] API error:', error);
    throw error;
  }
}

/**
 * Build the user prompt with context about the comment.
 */
function buildUserPrompt(context: CommentContext): string {
  const { commentText, fileName, userName, nodeId, imageBase64, threadHistory } = context;

  let prompt = `**Figma Comment from ${userName}**\n`;
  prompt += `File: ${fileName}\n`;

  if (nodeId) {
    prompt += `(Comment is pinned to element ID: ${nodeId})\n`;
  }

  if (imageBase64) {
    prompt += `\nThe image above shows the screen/frame where this comment was made.\n`;
  } else {
    prompt += `\n(No screenshot available - comment may not be pinned to a specific element)\n`;
  }

  // Include thread history if this is a reply
  if (threadHistory && threadHistory.length > 0) {
    prompt += `\n---\n\n**Previous conversation in this thread:**\n`;
    for (const msg of threadHistory) {
      const role = msg.isAI ? '🤖 AI' : `👤 ${msg.userName}`;
      prompt += `${role}: ${msg.message}\n\n`;
    }
  }

  prompt += `\n---\n\n`;
  prompt += `**${threadHistory && threadHistory.length > 0 ? 'New message' : 'Comment'} from ${userName}:**\n${commentText}\n\n`;
  prompt += `Please provide helpful design feedback or answer the question.`;

  return prompt;
}

/**
 * Verify that an API key is valid.
 */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    const anthropic = new Anthropic({ apiKey });
    // Make a minimal API call to verify the key
    await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    return true;
  } catch {
    return false;
  }
}
