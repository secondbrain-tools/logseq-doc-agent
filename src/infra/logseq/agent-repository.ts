import type { IAgentRepository } from '../../application/ports/agent-repository';
import type { AgentDefinition } from '../../domain/agent/types';
import { DEFAULT_AGENT_NAME, ASK_AGENT_NAME } from '../../domain/agent/types';
import { builtInAgents } from '../../domain/agent/built-in-agents';
import type { LogseqApi } from '../../application/ports/logseq-ports';

/**
 * Notice block content placed at the top of the agents page.
 */
const AGENTS_NOTICE = `⚠️ **Built-in agents** (marked with \`logseq-doc-agent.agent.version\`) are managed by the plugin and will be overwritten when a newer version is available. **Do not edit them here.**\nTo customise a built-in agent, create a block with the same \`logseq-doc-agent.agent\` value on any other page — it will take priority automatically.`;
const NOTICE_MARKER_PROPERTY = 'logseq-doc-agent.notice';

/**
 * Logseq-based implementation of agent repository
 * Queries blocks with logseq-doc-agent.agent property
 */
export class LogseqAgentRepository implements IAgentRepository {
    // Base property names
    private static readonly AGENT_PROPERTY = 'logseq-doc-agent.agent';
    private static readonly TOOLS_PROPERTY = 'logseq-doc-agent.agent.tools';
    private static readonly ENABLED_PROPERTY = 'logseq-doc-agent.agent.enabled';
    private static readonly VERSION_PROPERTY = 'logseq-doc-agent.agent.version';
    private static readonly SELECTABLE_PROPERTY = 'logseq-doc-agent.agent.selectable'; // Keep for backward compatibility
    private static readonly DEFAULT_PROPERTY = 'logseq-doc-agent.agent.default';
    private static readonly DESCRIPTION_PROPERTY = 'logseq-doc-agent.agent.description';

    // Camel case versions
    private static readonly AGENT_PROPERTY_CAMEL = 'logseqDocAgent.agent';
    private static readonly TOOLS_PROPERTY_CAMEL = 'logseqDocAgent.agent.tools';
    private static readonly ENABLED_PROPERTY_CAMEL = 'logseqDocAgent.agent.enabled';
    private static readonly VERSION_PROPERTY_CAMEL = 'logseqDocAgent.agent.version';
    private static readonly SELECTABLE_PROPERTY_CAMEL = 'logseqDocAgent.agent.selectable';
    private static readonly DEFAULT_PROPERTY_CAMEL = 'logseqDocAgent.agent.default';
    private static readonly DESCRIPTION_PROPERTY_CAMEL = 'logseqDocAgent.agent.description';
    // Alternative tools property (without 'agent.' prefix)
    private static readonly TOOLS_PROPERTY_ALT = 'logseqDocAgent.tools';

    // Property Key Groups for Lookup
    private static readonly AGENT_KEYS = [
        LogseqAgentRepository.AGENT_PROPERTY,
        LogseqAgentRepository.AGENT_PROPERTY_CAMEL
    ];

    private static readonly TOOLS_KEYS = [
        LogseqAgentRepository.TOOLS_PROPERTY,
        LogseqAgentRepository.TOOLS_PROPERTY_CAMEL,
        LogseqAgentRepository.TOOLS_PROPERTY_ALT,
        'logseq-doc-agent.tools'
    ];

    private static readonly ENABLED_KEYS = [
        LogseqAgentRepository.ENABLED_PROPERTY,
        LogseqAgentRepository.ENABLED_PROPERTY_CAMEL,
        LogseqAgentRepository.SELECTABLE_PROPERTY,
        LogseqAgentRepository.SELECTABLE_PROPERTY_CAMEL
    ];

    private static readonly DEFAULT_KEYS = [
        LogseqAgentRepository.DEFAULT_PROPERTY,
        LogseqAgentRepository.DEFAULT_PROPERTY_CAMEL
    ];

    private static readonly DESCRIPTION_KEYS = [
        LogseqAgentRepository.DESCRIPTION_PROPERTY,
        LogseqAgentRepository.DESCRIPTION_PROPERTY_CAMEL
    ];

    private static readonly VERSION_KEYS = [
        LogseqAgentRepository.VERSION_PROPERTY,
        LogseqAgentRepository.VERSION_PROPERTY_CAMEL
    ];

    constructor(
        private logseqApi: LogseqApi,
        private getStorageRoot: () => string
    ) { }

    async getSelectableAgents(): Promise<AgentDefinition[]> {
        const allAgents = await this.getAllAgents();
        console.log("Agents found", allAgents)
        return allAgents.filter(agent => agent.enabled);
    }

    async getAllAgents(): Promise<AgentDefinition[]> {
        try {
            // Query all blocks with the agent property
            const blocks = await this.logseqApi.q(`(property ${LogseqAgentRepository.AGENT_PROPERTY})`);

            if (!blocks || !Array.isArray(blocks)) {
                console.log('[LogseqAgentRepository] No agent blocks found');
                return [];
            }

            console.log(`[LogseqAgentRepository] Found ${blocks.length} agent blocks`);

            const rawAgents = await Promise.all(
                blocks.map(block => this.parseAgentFromBlock(block))
            );

            // Filter out null results and resolve duplicate names
            const agents = this.resolveDuplicateNames(rawAgents.filter((a): a is AgentDefinition => a !== null));

            // Enforcement: If there is exactly one default agent, it MUST be enabled (interpreted as true)
            const defaultAgents = agents.filter(a => a.isDefault);
            if (defaultAgents.length === 1 && !defaultAgents[0].enabled) {
                // Find this agent in the main list and force enable it
                const target = agents.find(a => a.id === defaultAgents[0].id);
                if (target) {
                    target.enabled = true;
                }
            }

            return agents;
        } catch (error) {
            console.error('[LogseqAgentRepository] Error querying agents:', error);
            return [];
        }
    }

    async getDefaultAgent(): Promise<AgentDefinition | null> {
        const allAgents = await this.getAllAgents();
        const defaultAgents = allAgents.filter(a => a.isDefault);

        if (defaultAgents.length === 0) {
            return null;
        }

        if (defaultAgents.length === 1) {
            return defaultAgents[0];
        }

        // Multiple defaults: prefer one OUTSIDE logseq root
        const outsideRoot = defaultAgents.filter(a => !a.isInLogseqRoot);
        if (outsideRoot.length > 0) {
            // Take first alphabetically
            return outsideRoot.sort((a, b) => a.name.localeCompare(b.name))[0];
        }

        // All are in root, take first alphabetically
        return defaultAgents.sort((a, b) => a.name.localeCompare(b.name))[0];
    }

    async ensureBuiltInAgentsExist(): Promise<boolean> {
        const storageRoot = this.getStorageRoot();
        const agentsPageName = `${storageRoot}/agents`;

        let anyCreatedOrUpdated = false;

        // Ensure the main 'logseq-doc-agent/agents' page exists
        let agentsPage = await this.logseqApi.getPage(agentsPageName);
        if (!agentsPage) {
            console.log(`[LogseqAgentRepository] Creating agents page: ${agentsPageName}`);
            agentsPage = await this.logseqApi.createPage(agentsPageName, {}, { createFirstBlock: false, redirect: false });
        }

        // Get all blocks on the agents page to check for existing definitions
        const pageBlocks = await this.logseqApi.getPageBlocksTree(agentsPageName);

        // Ensure notice block at the top
        await this.ensureNoticeBlock(agentsPageName, pageBlocks);

        for (const agentConfig of builtInAgents) {
            try {
                // Find block for this agent by property
                let existingBlock: any = null;

                // Helper to find block in tree
                const findBlock = (blocks: any[]): any => {
                    for (const b of blocks) {
                        // Check if this block defines our agent
                        if (b.properties && b.properties[LogseqAgentRepository.AGENT_PROPERTY] === agentConfig.name) {
                            return b;
                        }
                        if (b.properties && b.properties[LogseqAgentRepository.AGENT_PROPERTY_CAMEL] === agentConfig.name) {
                            return b;
                        }
                        // Recursive
                        if (b.children && b.children.length > 0) {
                            const found = findBlock(b.children);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                existingBlock = findBlock(pageBlocks);

                if (existingBlock) {
                    // Check version
                    const existingAgent = await this.parseAgentFromBlock(existingBlock);
                    const existingVersion = existingAgent?.version || 0;

                    if (existingVersion >= agentConfig.version) {
                        continue; // Up to date
                    }

                    console.log(`[LogseqAgentRepository] Updating agent block ${agentConfig.name} from v${existingVersion} to v${agentConfig.version}`);

                    const content = `## ${agentConfig.name}
${LogseqAgentRepository.AGENT_PROPERTY}:: ${agentConfig.name}
${LogseqAgentRepository.TOOLS_PROPERTY}:: ${agentConfig.tools}
${LogseqAgentRepository.DESCRIPTION_PROPERTY}:: ${agentConfig.description}
${LogseqAgentRepository.VERSION_PROPERTY}:: ${agentConfig.version}
${agentConfig.isDefault ? `${LogseqAgentRepository.DEFAULT_PROPERTY}:: true` : ''}`;

                    await this.logseqApi.updateBlock(existingBlock.uuid, content);

                    // Update Prompt (Child Block)
                    await this.updateAgentPrompt(existingBlock.uuid, agentConfig.prompt);

                    anyCreatedOrUpdated = true;
                    continue;
                }

                // Create New Agent Block
                console.log(`[LogseqAgentRepository] Creating new agent block: ${agentConfig.name}`);

                // Content line + properties
                const content = `## ${agentConfig.name}
${LogseqAgentRepository.AGENT_PROPERTY}:: ${agentConfig.name}
${LogseqAgentRepository.TOOLS_PROPERTY}:: ${agentConfig.tools}
${LogseqAgentRepository.DESCRIPTION_PROPERTY}:: ${agentConfig.description}
${LogseqAgentRepository.VERSION_PROPERTY}:: ${agentConfig.version}
${agentConfig.isDefault ? `${LogseqAgentRepository.DEFAULT_PROPERTY}:: true` : ''}`;

                const newBlock = await this.logseqApi.appendBlockInPage(agentsPageName, content);

                // Add prompt as child block
                if (newBlock) {
                    await this.updateAgentPrompt(newBlock.uuid, agentConfig.prompt);
                    anyCreatedOrUpdated = true;
                }

            } catch (error) {
                console.error(`[LogseqAgentRepository] Error creating/updating agent block ${agentConfig.name}:`, error);
            }
        }

        return anyCreatedOrUpdated;
    }

    /**
     * Ensures the notice block exists at the top of the agents page.
     */
    private async ensureNoticeBlock(pageName: string, existingBlocks: any[]) {
        const noticeContent = `${AGENTS_NOTICE}\n${NOTICE_MARKER_PROPERTY}:: true`;

        const existingNotice = existingBlocks.find((b: any) => {
            const content = b.content || '';
            return content.includes(NOTICE_MARKER_PROPERTY);
        });

        if (existingNotice && existingNotice.uuid) {
            // Update existing notice
            await this.logseqApi.updateBlock(existingNotice.uuid, noticeContent);
        } else if (existingBlocks.length > 0 && existingBlocks[0].uuid) {
            // Insert after the first block (which should be the page description)
            await this.logseqApi.insertBlock(existingBlocks[0].uuid, noticeContent, { before: false, sibling: true });
        } else {
            // Page is empty, just append
            await this.logseqApi.appendBlockInPage(pageName, noticeContent);
        }
    }

    private async updateAgentPrompt(blockUuid: string, prompt: string): Promise<void> {
        // Clear existing children
        const block = await this.logseqApi.getBlock(blockUuid, { includeChildren: true });
        if (block && block.children && block.children.length > 0) {
            for (const child of block.children) {
                const childUuid = (child as any).uuid || (Array.isArray(child) ? child[1] : (child as any).id);
                if (childUuid) await this.logseqApi.deleteBlock(childUuid);
            }
        }
        // Insert new prompt
        await this.logseqApi.insertBlock(blockUuid, prompt, { sibling: false });
    }

    private async parseAgentFromBlock(block: any): Promise<AgentDefinition | null> {
        try {
            const uuid = block.uuid || block.id;
            if (!uuid) return null;

            // Fetch the full block with children using getBlock
            // Fallback to existing block if getBlock fails or returns null
            const fullBlock = await this.logseqApi.getBlock(uuid, { includeChildren: true });
            const blockToUse = fullBlock || block;

            // 1. Get Agent Name
            const rawName = this.getProperty(blockToUse, LogseqAgentRepository.AGENT_KEYS);

            if (!rawName) return null;

            // 2. Parse Tools
            const toolsRaw = this.getProperty(blockToUse, LogseqAgentRepository.TOOLS_KEYS) || '*';

            const tools = String(toolsRaw).split(',').map((t: string) => t.trim()).filter(Boolean);
            if (tools.length === 0) tools.push('*');

            // 3. Parse Enabled (replacing Selectable)
            const enabledRaw = this.getProperty(blockToUse, LogseqAgentRepository.ENABLED_KEYS);
            // properties can be string "false", boolean false, or undefined
            // If undefined -> true. If "false" -> false.
            const enabled = String(enabledRaw) !== 'false';

            // 4. Parse Default
            const defaultRaw = this.getProperty(blockToUse, LogseqAgentRepository.DEFAULT_KEYS);
            const isDefault = String(defaultRaw) === 'true';

            // 5. Parse Description
            const description = this.getProperty(blockToUse, LogseqAgentRepository.DESCRIPTION_KEYS);

            // 6. Parse Version
            const versionRaw = this.getProperty(blockToUse, LogseqAgentRepository.VERSION_KEYS);
            // properties can be string or no.
            const version = versionRaw ? Number(versionRaw) : 0;

            // 7. Get Prompt (content excluding properties + children)
            const prompt = await this.extractPrompt(blockToUse);

            // 7. Get Page Info
            const page = block.page || {};
            const pageName = page.name || page['original-name'] || '';
            const storageRoot = this.getStorageRoot();
            const isInLogseqRoot = pageName.toLowerCase().startsWith(storageRoot.toLowerCase());

            return {
                id: uuid,
                name: rawName,
                rawName,
                tools,
                enabled, // Was enabled
                isDefault,
                description: typeof description === 'string' ? description : undefined,
                prompt,
                pageName,
                isInLogseqRoot,
                version
            };
        } catch (error) {
            console.error('[LogseqAgentRepository] Error parsing agent block:', error);
            return null;
        }
    }

    /**
     * Helper to get property value checking multiple keys and content map
     */
    private getProperty(block: any, keys: string[]): any | undefined {
        const properties = block.properties || {};

        // 1. Check properties map
        for (const key of keys) {
            if (properties[key] !== undefined) return properties[key];
        }

        // 2. Check content for embedded properties (fallback)
        if (block.content) {
            for (const key of keys) {
                // Check extracted property from text content
                const val = this.extractPropertyFromContent(block.content, key);
                if (val !== null) return val;
            }
        }

        return undefined;
    }

    private async extractPrompt(block: any): Promise<string> {
        let prompt = this.filterPropertyLines(block.content || '');

        // Add children content if present
        if (block.children && Array.isArray(block.children)) {
            const childTexts = await this.collectChildrenText(block.children);
            if (childTexts) {
                if (prompt.trim().length > 0) {
                    prompt += '\n\n';
                }
                prompt += childTexts;
            }
        }

        return prompt;
    }

    private async collectChildrenText(children: any[]): Promise<string> {
        const texts: string[] = [];
        for (const child of children) {
            const text = this.filterPropertyLines(child.content || '');
            if (text) texts.push(text);

            // Recursively collect from nested children
            if (child.children && Array.isArray(child.children)) {
                const nestedText = await this.collectChildrenText(child.children);
                if (nestedText) texts.push(nestedText);
            }
        }
        return texts.join('\n');
    }

    /**
     * Filters out lines that look like properties (key:: value)
     */
    private filterPropertyLines(content: string): string {
        if (!content) return '';
        const lines = content.split('\n');
        return lines
            .map(l => l.trim())
            .filter(line => line && !/^[^:]+::\s*.+$/.test(line))
            .join('\n');
    }

    private extractPropertyFromContent(content: string, propertyName: string): string | null {
        if (!content) return null;
        const pattern = new RegExp(`${propertyName}::\\s*(.+)`);
        const match = content.match(pattern);
        return match ? match[1].trim() : null;
    }

    private resolveDuplicateNames(agents: AgentDefinition[]): AgentDefinition[] {
        // Group agents by raw name
        const agentsByName = new Map<string, AgentDefinition[]>();
        for (const agent of agents) {
            const list = agentsByName.get(agent.rawName) || [];
            list.push(agent);
            agentsByName.set(agent.rawName, list);
        }

        const result: AgentDefinition[] = [];

        // Process each name group
        for (const [rawName, group] of agentsByName) {
            if (group.length === 1) {
                result.push(group[0]);
                continue;
            }

            // Duplicates found, try prefixing with page name
            const withPagePrefix = group.map(agent => ({
                ...agent,
                name: `${agent.pageName}/${agent.rawName}`
            }));

            // Check if page prefix solved it
            const agentsByPrefixedName = new Map<string, AgentDefinition[]>();
            for (const agent of withPagePrefix) {
                const list = agentsByPrefixedName.get(agent.name) || [];
                list.push(agent);
                agentsByPrefixedName.set(agent.name, list);
            }

            // If still duplicates, add numeric suffix
            for (const [prefixedName, subgroup] of agentsByPrefixedName) {
                if (subgroup.length === 1) {
                    result.push(subgroup[0]);
                } else {
                    // Add numeric suffix 1..N
                    subgroup.forEach((agent, index) => {
                        result.push({
                            ...agent,
                            name: `${agent.name}-${index + 1}`
                        });
                    });
                }
            }
        }

        return result;
    }
}
