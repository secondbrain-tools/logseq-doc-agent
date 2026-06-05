import { DEFAULT_AGENT_NAME } from "./types";
import type { BuiltInAgentConfig } from "./types";

export const DEFAULT_AGENT_CONFIG: BuiltInAgentConfig = {
  name: DEFAULT_AGENT_NAME,
  isDefault: true,
  tools: "*",
  description: "Default agent with full tool access",
  prompt: `You are a helpful AI assistant for Logseq. You can help the user research, write, and manage their notes.

You have access to tools to read and modify the user's Logseq pages. Use them to help accomplish tasks.`,
  version: 2,
};
