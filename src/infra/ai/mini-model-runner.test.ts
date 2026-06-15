import { beforeEach, describe, expect, it, vi } from "vitest";
import { MiniModelRunner } from "./mini-model-runner";
import { PROVIDERS } from "../../domain/settings/index";
import type { IAIService } from "../../application/ports/ai-service";
import type { ISettingsPort } from "../../application/ports/settings-port";

const openaiModel = PROVIDERS.find((provider) => provider.id === "openai")!.models[0].value;
const anthropicModel = PROVIDERS.find((provider) => provider.id === "anthropic")!.models[0].value;

function createSettings(values: Record<string, any>): ISettingsPort {
  return {
    get: vi.fn((key: string, defaultValue?: any) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue;
    }),
  };
}

function createAiService(): IAIService {
  return {
    streamAgent: vi.fn(),
    generateText: vi.fn(),
    generateObject: vi.fn(),
  } as any;
}

describe("MiniModelRunner", () => {
  let aiService: ReturnType<typeof createAiService>;
  let settings: ISettingsPort;
  let runner: MiniModelRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("generate", () => {
    it("sends system + user messages and resolves the built-in provider", async () => {
      aiService = createAiService();
      settings = createSettings({ miniModel: openaiModel });
      runner = new MiniModelRunner(aiService, settings);

      vi.mocked(aiService.generateText).mockResolvedValue("ok");

      await runner.generate("hello", "system prompt");

      expect(aiService.generateText).toHaveBeenCalledWith(
        [
          { role: "system", content: "system prompt" },
          { role: "user", content: "hello" },
        ],
        openaiModel,
        "openai",
      );
    });

    it("falls back to the default model setting when miniModel is missing", async () => {
      aiService = createAiService();
      settings = createSettings({ model: anthropicModel });
      runner = new MiniModelRunner(aiService, settings);

      vi.mocked(aiService.generateText).mockResolvedValue("ok");

      await runner.generate("hello");

      expect(aiService.generateText).toHaveBeenCalledWith(
        [{ role: "user", content: "hello" }],
        anthropicModel,
        "anthropic",
      );
    });

    it("resolves custom model providers from custom_models", async () => {
      aiService = createAiService();
      settings = createSettings({
        miniModel: "custom-model",
        custom_models: JSON.stringify({ openai_compat_demo: ["custom-model"] }),
      });
      runner = new MiniModelRunner(aiService, settings);

      vi.mocked(aiService.generateText).mockResolvedValue("ok");

      await runner.generate("hello");

      expect(aiService.generateText).toHaveBeenCalledWith(
        [{ role: "user", content: "hello" }],
        "custom-model",
        "openai_compat_demo",
      );
    });

    it("defaults to openai when the model cannot be resolved", async () => {
      aiService = createAiService();
      settings = createSettings({ miniModel: "ghost-model", custom_models: "not-json" });
      runner = new MiniModelRunner(aiService, settings);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.mocked(aiService.generateText).mockResolvedValue("ok");

      await runner.generate("hello");

      expect(warnSpy).toHaveBeenCalled();
      expect(aiService.generateText).toHaveBeenCalledWith(
        [{ role: "user", content: "hello" }],
        "ghost-model",
        "openai",
      );
    });
  });

  describe("generateTitle", () => {
    it("uses the built-in api key setting and cleans the returned title", async () => {
      aiService = createAiService();
      settings = createSettings({
        miniModel: openaiModel,
        openaiApiKey: "test-key",
      });
      runner = new MiniModelRunner(aiService, settings);

      vi.mocked(aiService.generateText).mockResolvedValue('  "A very useful title"  ');

      const title = await runner.generateTitle("What is this?");

      expect(title).toBe("A very useful title");
      expect(aiService.generateText).toHaveBeenCalledWith(
        [
          {
            role: "system",
            content:
              "You are a concise title generator. Generate a brief, descriptive title (max 30 chars) for a conversation based on the user's first message. \nOutput ONLY the title, no quotes, no explanations.",
          },
          { role: "user", content: 'Generate a title for this message: "What is this?"' },
        ],
        openaiModel,
        "openai",
      );
    });

    it("supports openai_compat provider api key naming", async () => {
      aiService = createAiService();
      settings = createSettings({
        miniModel: "custom-model",
        custom_models: JSON.stringify({ openai_compat_demo: ["custom-model"] }),
        oc_demo_apiKey: "secret",
      });
      runner = new MiniModelRunner(aiService, settings);

      vi.mocked(aiService.generateText).mockResolvedValue("Generated title");

      const title = await runner.generateTitle("Some question");

      expect(title).toBe("Generated title");
      expect(aiService.generateText).toHaveBeenCalledWith(
        expect.any(Array),
        "custom-model",
        "openai_compat_demo",
      );
    });

    it("falls back when no api key is configured", async () => {
      aiService = createAiService();
      settings = createSettings({ miniModel: openaiModel });
      runner = new MiniModelRunner(aiService, settings);

      const title = await runner.generateTitle(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      );

      expect(title).toBe("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQR...");
      expect(aiService.generateText).not.toHaveBeenCalled();
    });

    it("falls back when title generation throws", async () => {
      aiService = createAiService();
      settings = createSettings({
        miniModel: openaiModel,
        openaiApiKey: "test-key",
      });
      runner = new MiniModelRunner(aiService, settings);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(aiService.generateText).mockRejectedValue(new Error("API Error"));

      const title = await runner.generateTitle("A simple prompt");

      expect(title).toBe("A simple prompt");
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("falls back silently when no model is configured", async () => {
      aiService = createAiService();
      settings = createSettings({});
      runner = new MiniModelRunner(aiService, settings);

      const title = await runner.generateTitle(
        "A title that is definitely longer than forty-seven characters total",
      );

      expect(title).toBe("A title that is definitely longer than forty...");
      expect(aiService.generateText).not.toHaveBeenCalled();
    });
  });
});
