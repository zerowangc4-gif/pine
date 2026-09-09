import type { ChatImage, MessageUsage, SessionMessage, SessionToolStep } from "@shared/types";
import type { AgentSession } from "../core/pi";

interface TextBlock {
  type: "text";
  text: string;
}

interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
}

interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
}

function contentBlocks<T extends { type: string }>(content: unknown, type: T["type"]): T[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter(
    (block): block is T =>
      typeof block === "object" && block !== null && (block as { type?: unknown }).type === type,
  );
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  return contentBlocks<TextBlock>(content, "text")
    .map((block) => block.text)
    .join("");
}

function messageThinking(content: unknown): string {
  return contentBlocks<ThinkingBlock>(content, "thinking")
    .map((block) => block.thinking)
    .join("\n");
}

function messageTools(content: unknown): SessionToolStep[] {
  return contentBlocks<ToolCallBlock>(content, "toolCall").map((block) => ({
    id: block.id,
    name: block.name,
    status: "done",
  }));
}

function messageImages(content: unknown): ChatImage[] {
  return contentBlocks<ImageBlock>(content, "image").map((block) => ({
    data: block.data,
    mimeType: block.mimeType,
  }));
}

/** Convert the current session branch into renderer-friendly messages. */
export function extractSessionMessages(session: AgentSession): SessionMessage[] {
  const manager = session.sessionManager;
  const messages: SessionMessage[] = [];
  for (const entry of manager.getBranch()) {
    if (entry.type !== "message") {
      continue;
    }
    const message = entry.message;
    if (message.role === "user") {
      const images = messageImages(message.content);
      messages.push({
        id: entry.id,
        role: "user",
        text: messageText(message.content),
        images: images.length > 0 ? images : undefined,
      });
    } else if (message.role === "assistant") {
      const tools = messageTools(message.content);
      const thinking = messageThinking(message.content);
      const usage: MessageUsage | undefined = message.usage
        ? {
            inputTokens: message.usage.input,
            outputTokens: message.usage.output,
            cost: message.usage.cost?.total ?? 0,
          }
        : undefined;
      messages.push({
        id: entry.id,
        role: "assistant",
        text: messageText(message.content),
        thinking: thinking || undefined,
        tools: tools.length > 0 ? tools : undefined,
        usage,
      });
    }
  }
  return messages;
}
