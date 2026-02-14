import type { LogseqApi } from '../ports/logseq-ports';
import type { ISettingsPort } from '../ports/settings-port';

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

        console.log(`[InitDataService] Storage Root: ${storageRoot}`);

        // 2. Ensure Root Page
        await this.ensurePage(storageRoot, {
            description: 'Root page for Logseq Doc Agent plugin data'
        });

        // 3. Ensure Subpages
        await this.ensurePage(`${storageRoot}/chatlogs`, {
            description: 'Storage for chat logs'
        });

        const promptsResult = await this.ensurePage(`${storageRoot}/prompts`, {
            description: 'Storage for user defined prompts'
        });

        const agentsResult = await this.ensurePage(`${storageRoot}/agents`, {
            description: 'Storage for agent definitions'
        });

        const skillsResult = await this.ensurePage(`${storageRoot}/skills`, {
            description: 'Storage for skill definitions'
        });

        // 4. Populate Defaults (Only if page is new)
        if (promptsResult.isNew && promptsResult.page) {
            await this.populateDefaultPrompts(promptsResult.page.name);
        }

        if (skillsResult.isNew && skillsResult.page) {
            await this.populateDefaultSkills(skillsResult.page.name);
        }

        // if (agentsResult.isNew && agentsResult.page) {
        //     await this.populateDefaultAgents(agentsResult.page.name);
        // }
    }

    private async ensurePage(name: string, properties: any = {}): Promise<{ page: any, isNew: boolean }> {
        let page = await this.logseqApi.getPage(name);
        if (!page) {
            console.log(`[InitDataService] Page '${name}' not found. Creating...`);
            //await this.logseqApi.UI.showMsg(`Creating storage page: ${name}`, 'info');
            page = await this.logseqApi.createPage(name, properties, { createFirstBlock: false });
            return { page, isNew: true };
        } else {
            console.log(`[InitDataService] Page '${name}' found.`);
            return { page, isNew: false };
        }
    }

    private async populateDefaultPrompts(pageName: string) {
        if (!pageName) return;

        console.log('[InitDataService] Populating default prompts...');
        await this.logseqApi.appendBlockInPage(pageName,
            `Basic Summary\nlogseq-doc-agent.prompt.name:: Basic Summary\nlogseq-doc-agent.prompt.content:: Summarize the following text:\n{{text}}`
        );
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

    // private async populateDefaultAgents(pageName: string) {
    //     if (!pageName) return;

    //     console.log('[InitDataService] Populating default agents...');
    //     await this.logseqApi.appendBlockInPage(pageName,
    //         `Default Agent\nlogseq-doc-agent.agent:: default\nlogseq-doc-agent.tools:: *\nlogseq-doc-agent.agent.description:: Default agent with access to all tools.`
    //     );
    // }
}
