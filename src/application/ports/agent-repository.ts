import type { AgentDefinition } from '../../domain/agent/types';

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
}
