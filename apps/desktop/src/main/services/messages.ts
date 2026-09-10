import type { ChatImage, MessageUsage, SessionMessage, SessionToolStep } from "@shared/types";
import type { AgentSession } from "../core";
import { describeToolCall } from "./tool-call-description";

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
  arguments?: Record<string, unknown>;
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

function messageTools(
  content: unknown,
  toolErrors: ReadonlyMap<string, boolean>,
): SessionToolStep[] {
  return contentBlocks<ToolCallBlock>(content, "toolCall").map((block) => {
    const { summary, diff } = describeToolCall(block.name, block.arguments);
    return {
      id: block.id,
      name: block.name,
      status: toolErrors.get(block.id) ? "error" : "done",
      summary,
      diff,
    };
  });
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
  const branch = manager.getBranch();

  // Tool results are persisted as separate `toolResult` messages, not as part
  // of the assistant message that requested them. Collect the error flag by
  // tool-call id first so reloading a session keeps failed tools marked as
  // failed instead of flattening every step to "done".
  const toolErrors = new Map<string, boolean>();
  for (const entry of branch) {
    if (entry.type !== "message") {
      continue;
    }
    const message = entry.message;
    if (message.role === "toolResult") {
      toolErrors.set(message.toolCallId, message.isError);
    }
  }

  const messages: SessionMessage[] = [];
  for (const entry of branch) {
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
      const tools = messageTools(message.content, toolErrors);
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
