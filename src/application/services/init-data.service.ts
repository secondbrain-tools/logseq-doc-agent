import type { LogseqApi } from '../ports/logseq-ports';
import type { ISettingsPort } from '../ports/settings-port';
import { LDA_PROMPT_NAME_PROPERTY } from '../../domain/logseq/properties';
import { builtInPrompts } from '../../domain/prompt/built-in-prompts';
import { parseSubtree, type ParsedBlock } from '../../infra/ai/tools/subtree-parser';
import { ROOT_PAGE_CONFIG } from '../../domain/logseq/root-page.content';

/**
 * Marker added to built-in prompt blocks so we can identify them on subsequent runs.
 */
const BUILTIN_MARKER_PROPERTY = 'logseq-doc-agent.builtin';

/**
 * Notice block content placed at the top of the prompts page.
 */
const PROMPTS_NOTICE = `⚠️ **Built-in prompts** (marked with \`logseq-doc-agent.builtin:: <version>\`) are managed by the plugin and will be overwritten on every update. **Do not edit them here.**\nTo customise a built-in prompt, create a block with the same \`logseq-doc-agent.prompt\` value on any other page — it will take priority automatically.`;

const NOTICE_MARKER_PROPERTY = 'logseq-doc-agent.notice';

/**
 * Registry of built-in prompts. Each entry will be upserted on every plugin init.
 * Children are rendered as Logseq sub-blocks and collected by the PromptRepository.
 */
interface BuiltinPrompt {
    name: string;
    content: string;
    version: number;
    children?: ParsedBlock[];
}

/**
 * Helper to build the parent block content string for a built-in prompt.
 */
function builtinBlock(name: string, body: string, version: number): string {
    return `## ${name}\n${LDA_PROMPT_NAME_PROPERTY}:: ${name}\n${BUILTIN_MARKER_PROPERTY}:: ${version}\n${body}`;
}

// Parse the texts dynamically
const BUILTIN_PROMPTS: BuiltinPrompt[] = builtInPrompts.map(config => {
    const parsed = parseSubtree(config.text);
    return {
        name: config.name,
        version: config.version,
        content: builtinBlock(config.name, parsed.content, config.version),
        children: parsed.children.length > 0 ? parsed.children : undefined
    };
});

export class InitDataService {
    constructor(
        private logseqApi: LogseqApi,
        private settings: ISettingsPort
    ) { }

    async initialize() {
        console.log('[InitDataService] Waiting 20s for Logseq to settle before initializing data...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('[InitDataService] Initializing plugin data...');

        // 1. Get Storage Root from settings
        const storageRoot = this.settings.get('storageRoot', 'logseq-doc-agent');

        // 2. Ensure Root Page (Content managed by syncRootPage)
        const { page, isNew } = await this.ensurePage(storageRoot);

        if (isNew) {
            await this.logseqApi.UI.showMsg(`Storage root page '${storageRoot}' created.`, 'info');
        }

        await this.syncRootPage(storageRoot);

        // 3. Ensure Subpages
        const chatlogsResult = await this.ensurePage(`${storageRoot}/chatlogs`);
        if (chatlogsResult.isNew) {
            await this.logseqApi.appendBlockInPage(`${storageRoot}/chatlogs`, 'Storage for chat logs.');
        }

        const promptsResult = await this.ensurePage(`${storageRoot}/prompts`);
        if (promptsResult.isNew) {
            await this.logseqApi.appendBlockInPage(`${storageRoot}/prompts`, 'Storage for user-defined and built-in prompts.');
        }

        const agentsResult = await this.ensurePage(`${storageRoot}/agents`);
        if (agentsResult.isNew) {
            await this.logseqApi.appendBlockInPage(`${storageRoot}/agents`, 'Storage for built-in and user-defined agent definitions.');
        }

        const skillsResult = await this.ensurePage(`${storageRoot}/skills`);
        if (skillsResult.isNew) {
            await this.logseqApi.appendBlockInPage(`${storageRoot}/skills`, 'Storage for skill definitions.');
        }

        // 4. Always sync built-in prompts (upsert on every init)
        if (promptsResult.page) {
            await this.syncBuiltinPrompts(promptsResult.page.name);
        }

        // 5. Populate other defaults only if page is new
        if (skillsResult.isNew && skillsResult.page) {
            await this.populateDefaultSkills(skillsResult.page.name);
        }

        // temporary disabled - need a better source definition concept
        // if (agentsResult.isNew && agentsResult.page) {
        //     await this.populateDefaultAgents(agentsResult.page.name);
        // }
    }

    private async ensurePage(name: string): Promise<{ page: any, isNew: boolean }> {
        let page = await this.logseqApi.getPage(name);
        if (!page) {
            console.log(`[InitDataService] Page '${name}' not found. Creating...`);
            page = await this.logseqApi.createPage(name, {}, { createFirstBlock: false, redirect: false });
            return { page, isNew: true };
        } else {
            console.log(`[InitDataService] Page '${name}' found.`);
            return { page, isNew: false };
        }
    }

    private async syncRootPage(pageName: string) {
        if (!pageName) return;

        console.log('[InitDataService] Syncing root page content...');

        const existingBlocks = await this.logseqApi.getPageBlocksTree(pageName);
        let currentVersion = 0;

        // Try to find existing version from the first block
        if (existingBlocks.length > 0) {
            const firstBlock = existingBlocks[0];
            const parsedProps = firstBlock.properties || {};
            const versionProp = parsedProps['logseq-doc-agent.root-version'] || parsedProps['logseqDocAgent.rootVersion'];

            if (versionProp !== undefined) {
                const parsed = parseInt(String(versionProp), 10);
                if (!isNaN(parsed)) currentVersion = parsed;
            } else if (firstBlock.content) {
                const match = firstBlock.content.match(/logseq-doc-agent\.root-version::\s*(\d+)/);
                if (match && match[1]) {
                    currentVersion = parseInt(match[1], 10);
                }
            }
        }

        if (ROOT_PAGE_CONFIG.version > currentVersion) {
            console.log(`[InitDataService] Updating root page content to version ${ROOT_PAGE_CONFIG.version} (was ${currentVersion})`);

            // Delete existing blocks to cleanly insert the new subtree
            for (const block of existingBlocks) {
                if (block.uuid) {
                    try {
                        await this.logseqApi.deleteBlock(block.uuid);
                    } catch (e) {
                        console.warn(`[InitDataService] Failed to delete root page block ${block.uuid}:`, e);
                    }
                }
            }

            const parsed = parseSubtree(ROOT_PAGE_CONFIG.text);

            // Insert parent block with version tag
            const parentContent = `${parsed.content}\nlogseq-doc-agent.root-version:: ${ROOT_PAGE_CONFIG.version}`;
            const newBlock = await this.logseqApi.appendBlockInPage(pageName, parentContent);

            // Insert children blocks
            if (newBlock?.uuid && parsed.children && parsed.children.length > 0) {
                await this.createChildren(newBlock.uuid, parsed.children);
            }
        } else {
            console.log(`[InitDataService] Root page content is up to date (version ${currentVersion})`);
        }
    }

    /**
     * Upserts all built-in prompts on the prompts page.
     * - Existing blocks (identified by matching prompt name) are updated in place.
     * - Missing prompts are appended.
     * - Children are deleted and re-created to ensure they match the current version.
     * - A notice block is placed/updated at the top.
     */
    private async syncBuiltinPrompts(pageName: string) {
        if (!pageName) return;

        console.log('[InitDataService] Syncing built-in prompts...');

        const existingBlocks = await this.logseqApi.getPageBlocksTree(pageName);

        // 1. Ensure notice block
        await this.ensureNoticeBlock(pageName, existingBlocks);

        // 2. Upsert each built-in prompt
        for (const prompt of BUILTIN_PROMPTS) {
            const existingBlock = this.findBlockByPromptName(existingBlocks, prompt.name);

            if (existingBlock && existingBlock.uuid) {
                // Determine existing version
                let existingVersion = 0;

                // Logseq maps simple property keys to lower-kebab-case in the parsed properties object
                const parsedProps = existingBlock.properties || {};
                const propVal = parsedProps[BUILTIN_MARKER_PROPERTY] || parsedProps[BUILTIN_MARKER_PROPERTY.toLowerCase()];

                if (propVal !== undefined) {
                    if (propVal === true || propVal === 'true') {
                        existingVersion = 0; // Legacy boolean marker
                    } else {
                        const parsed = parseInt(String(propVal), 10);
                        if (!isNaN(parsed)) existingVersion = parsed;
                    }
                } else if (existingBlock.content) {
                    const match = existingBlock.content.match(new RegExp(`${BUILTIN_MARKER_PROPERTY}::\\s*(\\d+)`));
                    if (match && match[1]) {
                        existingVersion = parseInt(match[1], 10);
                    } else if (existingBlock.content.includes(`${BUILTIN_MARKER_PROPERTY}:: true`)) {
                        existingVersion = 0;
                    }
                }

                if (prompt.version > existingVersion) {
                    // Update parent in place
                    console.log(`[InitDataService] Updating built-in prompt '${prompt.name}' to version ${prompt.version} (was ${existingVersion})`);
                    await this.logseqApi.updateBlock(existingBlock.uuid, prompt.content);

                    // Sync children
                    await this.syncChildren(existingBlock.uuid, prompt.children || []);
                } else {
                    console.log(`[InitDataService] Built-in prompt '${prompt.name}' is up to date (version ${existingVersion})`);
                }
            } else {
                // Create parent block
                console.log(`[InitDataService] Creating built-in prompt '${prompt.name}'`);
                const newBlock = await this.logseqApi.appendBlockInPage(pageName, prompt.content);

                // Create children
                if (newBlock?.uuid && prompt.children) {
                    await this.createChildren(newBlock.uuid, prompt.children);
                }
            }
        }
    }

    /**
     * Syncs children of an existing block: deletes old children and re-creates them.
     * This ensures the children always match the current built-in prompt version.
     */
    private async syncChildren(parentUuid: string, children: ParsedBlock[]) {
        // Get the full block with children to find existing child UUIDs
        const parentBlock = await this.logseqApi.getBlock(parentUuid, { includeChildren: true });
        const existingChildren: any[] = (parentBlock as any)?.children || [];

        // Delete all existing children (built-in prompts shouldn't have user edits)
        for (const child of existingChildren) {
            const childUuid = child.uuid || child[1];
            if (childUuid) {
                try {
                    await this.logseqApi.deleteBlock(childUuid);
                } catch (e) {
                    console.warn(`[InitDataService] Failed to delete child block ${childUuid}:`, e);
                }
            }
        }

        // Re-create children in order
        await this.createChildren(parentUuid, children);
    }

    /**
     * Creates child blocks under a parent block, in order. Supports nested children.
     */
    private async createChildren(parentUuid: string, children: ParsedBlock[]) {
        let lastBlockUuid = parentUuid;
        let isFirst = true;

        for (const child of children) {
            try {
                const childBlock = await this.logseqApi.insertBlock(
                    lastBlockUuid,
                    child.content,
                    isFirst
                        ? { sibling: false }
                        : { sibling: true, before: false }
                );

                if (childBlock?.uuid) {
                    lastBlockUuid = childBlock.uuid;
                    isFirst = false;

                    if (child.children && child.children.length > 0) {
                        await this.createChildren(childBlock.uuid, child.children);
                    }
                }
            } catch (e) {
                console.error(`[InitDataService] Failed to insert child block:`, e);
            }
        }
    }

    /**
     * Ensures the notice block exists at the top of the prompts page.
     */
    private async ensureNoticeBlock(pageName: string, existingBlocks: any[]) {
        const noticeContent = `${PROMPTS_NOTICE}\n${NOTICE_MARKER_PROPERTY}:: true`;

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

    /**
     * Finds a block on the page that matches a given prompt name property.
     */
    private findBlockByPromptName(blocks: any[], promptName: string): any | null {
        for (const block of blocks) {
            const content = block.content || '';
            // Check if block has the prompt name property with the matching value
            if (content.includes(`${LDA_PROMPT_NAME_PROPERTY}:: ${promptName}`)) {
                return block;
            }
            // Also check in properties object (Logseq may parse it)
            if (block.properties) {
                const nameProp = block.properties[LDA_PROMPT_NAME_PROPERTY]
                    || block.properties['logseqDocAgent.prompt.name'];
                if (nameProp === promptName) {
                    return block;
                }
            }
        }
        return null;
    }

    private async populateDefaultSkills(pageName: string) {
        if (!pageName) return;

        console.log('[InitDataService] Populating default skills...');
        await this.logseqApi.appendBlockInPage(pageName,
            `Base Skill\nlogseq-doc-agent.skill:: base\nlogseq-doc-agent.skill.description:: Foundation skill with basic capabilities.`
        );
    }

    async migrateStorageRoot(oldRoot: string, newRoot: string) {
        if (!oldRoot || !newRoot || oldRoot === newRoot) return;

        console.log(`[InitDataService] Migrating storage from '${oldRoot}' to '${newRoot}'`);

        const oldPage = await this.logseqApi.getPage(oldRoot);
        if (oldPage) {
            await this.logseqApi.UI.showMsg(`Renaming storage page from '${oldRoot}' to '${newRoot}'`, 'info');
            await this.logseqApi.renamePage(oldRoot, newRoot);
        } else {
            console.log(`[InitDataService] Old storage page '${oldRoot}' not found. Initializing new structure.`);
            await this.initialize();
        }
    }

}

