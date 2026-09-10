import type { AgentSessionEvent } from "../core";
import type { ChatEvent, SessionStatsDTO } from "@shared/types";
import { describeToolCall } from "./tool-call-description";

/**
 * Reduce one SDK `AgentSessionEvent` into the immediate `ChatEvent`s it
 * produces. Pure and side-effect free: stats are read through the injected
 * `currentStats` callback, and the one *deferred* side effect (a stats push
 * after `message_end` / `entry_appended`) is left to the caller, because it
 * must re-read live session state after a microtask.
 *
 * Adding an SDK event to the chat = add one case here + the corresponding
 * reducer in the chat slice.
 */
export function toChatEvents(
  event: AgentSessionEvent,
  currentStats: () => SessionStatsDTO,
): ChatEvent[] {
  switch (event.type) {
    case "agent_start":
      return [{ type: "agent_start" }];

    case "message_start":
      return event.message.role === "assistant" ? [{ type: "assistant_start" }] : [];

    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        return [{ type: "text_delta", delta: event.assistantMessageEvent.delta }];
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        return [{ type: "thinking_delta", delta: event.assistantMessageEvent.delta }];
      }
      return [];

    case "message_end": {
      const events: ChatEvent[] = [];
      if (event.message.role === "assistant") {
        events.push({ type: "assistant_end" });
        if (event.message.usage) {
          events.push({
            type: "message_usage",
            usage: {
              inputTokens: event.message.usage.input,
              outputTokens: event.message.usage.output,
              cost: event.message.usage.cost?.total ?? 0,
            },
          });
        }
      }
      return events;
    }

    case "tool_execution_start": {
      const { summary, diff } = describeToolCall(event.toolName, event.args);
      return [
        { type: "tool_start", toolId: event.toolCallId, toolName: event.toolName, summary, diff },
      ];
    }

    case "tool_execution_end":
      return [
        { type: "tool_end", toolId: event.toolCallId, toolName: event.toolName, isError: event.isError },
      ];

    case "agent_settled":
      return [
        { type: "settled" },
        { type: "session_stats", stats: currentStats() },
      ];

    default:
      return [];
  }
}
