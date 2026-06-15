import type { AgentDefinition } from "../../domain/agent/types";

/**
 * Port for accessing agent definitions from storage
 */
export interface IAgentRepository {
  /**
   * Get all agents that are marked as selectable (for dropdown)
   */
  getSelectableAgents(): Promise<AgentDefinition[]>;

  /**
   * Get all defined agents
   */
  getAllAgents(): Promise<AgentDefinition[]>;

  /**
   * Get the default agent (resolves conflicts for multiple defaults)
   */
  getDefaultAgent(): Promise<AgentDefinition | null>;

  /**
   * Ensure built-in agents exist (Default, Ask), creating them if needed
   * @returns true if any agent was created
   */
  ensureBuiltInAgentsExist(): Promise<boolean>;

  /**
   * Ensure the tool list block on the agents page is up-to-date.
   * Compares the source TOOL_LIST_VERSION against the version stored
   * in the Logseq block and regenerates if stale or missing.
   */
  ensureToolListBlock(): Promise<boolean>;
}
