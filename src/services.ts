
import { InjectEvaluationsUseCase } from './application/usecases/inject-evaluations.usecase';
import { InjectMergesUseCase } from './application/usecases/inject-merges.usecase';
import { FrontendComponentInjector, FrontendStyleInjector } from './infra/frontend';
import { LogseqApiImpl } from './infra/logseq';
import { ChatSidebarUseCase } from './application/usecases/chat-sidebar.usecase';
import { FrontendSidebarInjector } from './infra/frontend/sidebar-injector';
import { FrontendToolbarInjector } from './infra/frontend/toolbar-injector';
import { LogseqPromptRepository } from './infra/logseq/prompt-repo';
import { VercelAIAdapter } from './infra/ai/vercel-ai-adapter';
import { MiniModelRunner } from './infra/ai/mini-model-runner';
import { ChatlogService } from './application/services/chatlog.service';
import { LogseqChatlogRepository } from './infra/logseq/chatlog-repository';
import { LogseqSettingsAdapter } from './infra/logseq/settings-adapter';
import { LogseqAgentRepository } from './infra/logseq/agent-repository';
import { EvaluationReviewService } from './application/services/evaluation-review.service';
import { IssueReplyService } from './application/services/issue-reply.service';
import { PromptTemplateService } from './application/services/prompt-template.service';
import { EvidenceHighlightService } from './application/services/evidence-highlight.service';
import { textHighlighter } from './infra/frontend/text-highlighter';
// Globals from previous implementation
// We use 'parent.document' because the plugin runs in an iframe
export const doc = parent.document;
export const root = doc.documentElement;
export const body = doc.body;

export class Services {
    private static _instance: Services;

    // Services
    public logseqApi: LogseqApiImpl;
    public sidebarInjector: FrontendSidebarInjector;
    public toolbarInjector: FrontendToolbarInjector;
    public promptRepo: LogseqPromptRepository;
    public chatlogService: ChatlogService;
    public agentRepository: LogseqAgentRepository;
    public promptTemplateService: PromptTemplateService;

    // Use Cases
    public injectEvaluationsUseCase: InjectEvaluationsUseCase;
    public injectMergesUseCase: InjectMergesUseCase;
    public chatUseCase: ChatSidebarUseCase;
    public evaluationReviewService: EvaluationReviewService;
    public issueReplyService: IssueReplyService;
    public evidenceHighlightService: EvidenceHighlightService;

    // Globals
    public pluginID: string;
    private miniModelRunner: MiniModelRunner;

    private constructor() {
        // Initialize Core Services
        this.logseqApi = new LogseqApiImpl();
        this.sidebarInjector = new FrontendSidebarInjector();
        this.toolbarInjector = new FrontendToolbarInjector();
        const settingsAdapter = new LogseqSettingsAdapter();
        const aiAdapter = new VercelAIAdapter(settingsAdapter);
        this.promptRepo = new LogseqPromptRepository(this.logseqApi);
        this.miniModelRunner = new MiniModelRunner(aiAdapter, settingsAdapter);

        // Storage root getter used by repositories
        const getStorageRoot = () => ((window as any).logseq?.settings?.storageRoot as string) || 'logseq-doc-agent';

        const chatlogRepo = new LogseqChatlogRepository(
            this.logseqApi,
            getStorageRoot
        );

        this.chatlogService = new ChatlogService(
            chatlogRepo,
            this.miniModelRunner
        );

        this.agentRepository = new LogseqAgentRepository(
            this.logseqApi,
            getStorageRoot
        );

        this.promptTemplateService = new PromptTemplateService(
            this.promptRepo,
            this.logseqApi
        );

        // Initialize Use Cases
        this.injectEvaluationsUseCase = new InjectEvaluationsUseCase(
            new FrontendComponentInjector(),
            new FrontendStyleInjector(),
            this.logseqApi
        );

        this.injectMergesUseCase = new InjectMergesUseCase(
            new FrontendComponentInjector(),
            this.logseqApi
        );

        this.chatUseCase = new ChatSidebarUseCase(
            this.sidebarInjector,
            aiAdapter,
            this.chatlogService,
            this.agentRepository,
            this.promptTemplateService
        );

        this.evaluationReviewService = new EvaluationReviewService(this.logseqApi);
        this.issueReplyService = new IssueReplyService(aiAdapter, this.logseqApi, this.evaluationReviewService, settingsAdapter);
        this.evidenceHighlightService = new EvidenceHighlightService(textHighlighter);

        // Initialize Globals
        // Note: package.json import handling might need adjustment based on build system
        // For now, we set a default or expect it to be set during init if needed.
        // We'll trust the caller to pass it or read it if we can import package.json safely.
        // Replicating previous globals.ts logic:
        this.pluginID = 'logseq-doc-agent'; // Fallback or imported
    }

    public static get instance(): Services {
        if (!Services._instance) {
            Services._instance = new Services();
        }
        return Services._instance;
    }

    /**
     * Initialize agent repository, ensuring default agent exists
     */
    public async initializeAgents(): Promise<void> {
        try {
            const created = await this.agentRepository.ensureBuiltInAgentsExist();
            if (created) {
                console.log('[Services] Default agent was created');
            }
        } catch (error) {
            console.error('[Services] Error initializing agents:', error);
        }
    }

    // Allow setting ID from outside if needed (e.g. from main)
    public setPluginId(id: string) {
        this.pluginID = id;
    }
}

