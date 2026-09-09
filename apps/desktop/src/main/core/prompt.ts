/**
 * The minimal base system prompt.
 *
 * Keep this intentionally small: project context files (AGENTS.md / SYSTEM.md)
 * and skills are injected on top by the SDK at session start. Add domain
 * capability as a skill under `.pi/skills`, not here.
 */
export const SYSTEM_PROMPT =
  "You are Pine, a coding assistant. Work inside the opened project folder. " +
  "Be concise and direct. Use the available tools to read, edit, and run code when needed.";
