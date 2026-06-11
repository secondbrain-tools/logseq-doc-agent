import { beforeEach, describe, expect, it, vi } from "vitest";

const setCurrentLogseqApi = vi.fn();
const createLogseqApi = vi.fn(async () => ({
  api: { mode: "legacy" },
  runtime: { mode: "legacy", reasons: [] },
}));

const sidebarDispose = vi.fn();
const toolbarDispose = vi.fn();
const aiAdapterDispose = vi.fn();
const injectEvaluationsDispose = vi.fn();
const injectMergesDispose = vi.fn();
const chatUseCaseDispose = vi.fn();
const ensureBuiltInAgentsExist = vi.fn(async () => false);
const ensureToolListBlock = vi.fn(async () => false);

vi.mock("./infra/logseq", () => ({
  createLogseqApi,
  setCurrentLogseqApi,
  LegacyLogseqApi: class {},
}));

vi.mock("./infra/frontend", () => ({
  FrontendComponentInjector: class {},
  FrontendStyleInjector: class {},
}));

vi.mock("./infra/frontend/sidebar-injector", () => ({
  FrontendSidebarInjector: class {
    dispose() {
      sidebarDispose();
    }
  },
}));

vi.mock("./infra/frontend/toolbar-injector", () => ({
  FrontendToolbarInjector: class {
    dispose() {
      toolbarDispose();
    }
  },
}));

vi.mock("./infra/logseq/prompt-repo", () => ({
  LogseqPromptRepository: class {},
}));

vi.mock("./infra/ai/vercel-ai-adapter", () => ({
  VercelAIAdapter: class {
    dispose() {
      aiAdapterDispose();
    }
  },
}));

vi.mock("./infra/ai/mini-model-runner", () => ({
  MiniModelRunner: class {},
}));

vi.mock("./application/services/chatlog.service", () => ({
  ChatlogService: class {},
}));

vi.mock("./infra/logseq/chatlog-repository", () => ({
  LogseqChatlogRepository: class {},
}));

vi.mock("./infra/logseq/settings-adapter", () => ({
  LogseqSettingsAdapter: class {},
}));

vi.mock("./infra/logseq/agent-repository", () => ({
  LogseqAgentRepository: class {
    ensureBuiltInAgentsExist = ensureBuiltInAgentsExist;
    ensureToolListBlock = ensureToolListBlock;
  },
}));

vi.mock("./application/services/evaluation-review.service", () => ({
  EvaluationReviewService: class {},
}));

vi.mock("./application/services/issue-reply.service", () => ({
  IssueReplyService: class {},
}));

vi.mock("./application/services/prompt-template.service", () => ({
  PromptTemplateService: class {},
}));

vi.mock("./application/services/evidence-highlight.service", () => ({
  EvidenceHighlightService: class {},
}));

vi.mock("./infra/frontend/text-highlighter", () => ({
  textHighlighter: {},
}));

vi.mock("./application/usecases/inject-evaluations.usecase", () => ({
  InjectEvaluationsUseCase: class {
    dispose() {
      injectEvaluationsDispose();
    }
  },
}));

vi.mock("./application/usecases/inject-merges.usecase", () => ({
  InjectMergesUseCase: class {
    dispose() {
      injectMergesDispose();
    }
  },
}));

vi.mock("./application/usecases/chat-sidebar.usecase", () => ({
  ChatSidebarUseCase: class {
    dispose() {
      chatUseCaseDispose();
    }
  },
}));

describe("Services", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createLogseqApi.mockResolvedValue({
      api: { mode: "legacy" },
      runtime: { mode: "legacy", reasons: [] },
    });
    ensureBuiltInAgentsExist.mockResolvedValue(false);
    ensureToolListBlock.mockResolvedValue(false);
    (window as any).logseq = { settings: { storageRoot: "test-root" } };
    (globalThis as any).parent = { document: window.document };
    delete (window as any).__LDA_TEST_LOGSEQ_API__;
  });

  it("throws from instance before initialization", async () => {
    const { Services } = await import("./services");
    Services.resetForTests();
    expect(() => Services.instance).toThrow(/not initialized/i);
  });

  it("initialize creates the singleton once and reuses it", async () => {
    const { Services } = await import("./services");

    const first = await Services.initialize();
    const second = await Services.initialize();

    expect(first).toBe(second);
    expect(Services.instance).toBe(first);
    expect(createLogseqApi).toHaveBeenCalledTimes(1);
    expect(setCurrentLogseqApi).toHaveBeenCalledTimes(1);
    expect((window as any).__LDA_TEST_LOGSEQ_API__).toBe(first.logseqApi);
  });

  it("initializeWithApi exposes the test logseq api and resetForTests clears it", async () => {
    const { Services } = await import("./services");
    const fakeApi = { mode: "db" } as any;

    const instance = Services.initializeWithApi(fakeApi);

    expect(instance.logseqApi).toBe(fakeApi);
    expect(setCurrentLogseqApi).toHaveBeenCalledWith(fakeApi);
    expect((window as any).__LDA_TEST_LOGSEQ_API__).toBe(fakeApi);

    Services.resetForTests();

    expect((window as any).__LDA_TEST_LOGSEQ_API__).toBeUndefined();
    expect(() => Services.instance).toThrow(/not initialized/i);
  });

  it("initializeWithApi returns the existing singleton when already initialized", async () => {
    const { Services } = await import("./services");
    const firstApi = { mode: "legacy" } as any;
    const secondApi = { mode: "db" } as any;

    const first = Services.initializeWithApi(firstApi);
    const second = Services.initializeWithApi(secondApi);

    expect(second).toBe(first);
    expect(second.logseqApi).toBe(firstApi);
    expect(setCurrentLogseqApi).toHaveBeenCalledTimes(1);
  });

  it("prefers parent.document in getHostDocument", async () => {
    const { getHostDocument } = await import("./services");
    expect(getHostDocument()).toBe(window.document);
  });

  it("falls back to global document when parent.document is missing", async () => {
    const { getHostDocument } = await import("./services");
    (globalThis as any).parent = undefined;
    expect(getHostDocument()).toBe(document);
  });

  it("returns root and body from the host document helpers", async () => {
    const { getHostRoot, getHostBody } = await import("./services");
    expect(getHostRoot()).toBe(window.document.documentElement);
    expect(getHostBody()).toBe(window.document.body);
  });

  it("initializeAgents logs creation/update messages when work was performed", async () => {
    const { Services } = await import("./services");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    ensureBuiltInAgentsExist.mockResolvedValue(true);
    ensureToolListBlock.mockResolvedValue(true);

    const services = Services.initializeWithApi({ mode: "legacy" } as any);
    await services.initializeAgents();

    expect(ensureBuiltInAgentsExist).toHaveBeenCalledTimes(1);
    expect(ensureToolListBlock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[Services] Default agent was created");
    expect(logSpy).toHaveBeenCalledWith("[Services] Tool list was created or updated");
  });

  it("initializeAgents catches and logs errors", async () => {
    const { Services } = await import("./services");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("boom");
    ensureBuiltInAgentsExist.mockRejectedValue(failure);

    const services = Services.initializeWithApi({ mode: "legacy" } as any);
    await services.initializeAgents();

    expect(errorSpy).toHaveBeenCalledWith("[Services] Error initializing agents:", failure);
  });

  it("setPluginId updates the plugin id", async () => {
    const { Services } = await import("./services");
    const services = Services.initializeWithApi({ mode: "legacy" } as any);

    services.setPluginId("custom-plugin-id");

    expect(services.pluginID).toBe("custom-plugin-id");
  });

  it("dispose tears down child services and clears the exposed test api", async () => {
    const { Services } = await import("./services");
    const services = Services.initializeWithApi({ mode: "legacy" } as any);
    expect((window as any).__LDA_TEST_LOGSEQ_API__).toBeTruthy();

    services.dispose();

    expect(sidebarDispose).toHaveBeenCalledTimes(1);
    expect(injectEvaluationsDispose).toHaveBeenCalledTimes(1);
    expect(injectMergesDispose).toHaveBeenCalledTimes(1);
    expect(chatUseCaseDispose).toHaveBeenCalledTimes(1);
    expect(aiAdapterDispose).toHaveBeenCalledTimes(1);
    expect((window as any).__LDA_TEST_LOGSEQ_API__).toBeUndefined();
  });
});
