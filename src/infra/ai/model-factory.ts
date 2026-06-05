import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel, extractReasoningMiddleware, type LanguageModel } from "ai";
import { OPENAI_COMPAT_ID_PREFIX, OPENAI_COMPAT_KEY_PREFIX } from "../../domain/settings/index";

export interface ModelConfig {
  model: LanguageModel;
  options: any;
}

export class ModelFactory {
  public getModel(modelId: string, providerId: string): LanguageModel {
    return this.createModel(modelId, providerId);
  }

  private createModel(modelId: string, providerId: string): LanguageModel {
    // Access logseq settings from window object safely
    const logseq = (window as any).logseq;
    const settings = logseq?.settings || {};

    // For dynamic OpenAI-compatible providers the key is oc_<userID>_apiKey;
    // for all others it follows the <providerId>ApiKey convention.
    const apiKeySettingsKey = providerId.startsWith(OPENAI_COMPAT_ID_PREFIX)
      ? `${OPENAI_COMPAT_KEY_PREFIX}${providerId.slice(OPENAI_COMPAT_ID_PREFIX.length)}_apiKey`
      : `${providerId}ApiKey`;
    const apiKey = settings[apiKeySettingsKey] as string;

    if (!apiKey) {
      throw new Error(`API key for provider ${providerId} not found in settings.`);
    }

    let model: LanguageModel;
    if (providerId === "openai") {
      const openai = createOpenAI({
        apiKey: apiKey,
      });
      model = openai(modelId);
    } else if (providerId === "anthropic") {
      const anthropic = createAnthropic({
        apiKey: apiKey,
      });
      model = anthropic(modelId);
    } else if (providerId === "google") {
      const google = createGoogleGenerativeAI({
        apiKey: apiKey,
      });
      model = google(modelId);
    } else if (providerId === "mistral") {
      const mistral = createMistral({
        apiKey: apiKey,
      });
      // Raw model, middleware applied in configureModel if needed
      model = mistral(modelId);
    } else if (providerId.startsWith(OPENAI_COMPAT_ID_PREFIX)) {
      // Dynamic OpenAI-compatible provider: providerId = "openai_compat_<userID>"
      const userProviderId = providerId.slice(OPENAI_COMPAT_ID_PREFIX.length);
      const keyPrefix = `${OPENAI_COMPAT_KEY_PREFIX}${userProviderId}_`;

      const name = (settings[`${keyPrefix}name`] as string) || userProviderId;
      const baseURL = settings[`${keyPrefix}baseURL`] as string;
      const includeUsage = settings[`${keyPrefix}includeUsage`] === true;

      if (!baseURL) {
        throw new Error(
          `Base URL for OpenAI-compatible provider "${userProviderId}" is not configured in settings.`,
        );
      }

      const compatibleProvider = createOpenAICompatible({
        name,
        apiKey,
        baseURL,
        includeUsage,
      });
      model = compatibleProvider(modelId);
    } else {
      throw new Error(`Provider ${providerId} not supported yet.`);
    }

    return model;
  }

  public isStreamingDisabled(modelId: string, providerId: string): boolean {
    const logseq = (window as any).logseq;
    const settings = logseq?.settings || {};
    const disableStreamingKey = `disable_streaming_${providerId}_${modelId}`;
    return settings[disableStreamingKey] === true;
  }

  public configureModel(
    modelId: string,
    providerId: string,
    reasoningEffort: "none" | "low" | "medium" | "high" | undefined,
  ): ModelConfig {
    let model = this.getModel(modelId, providerId);
    const options: any = {
      providerOptions: {},
    };

    if (!reasoningEffort || reasoningEffort === "none") {
      return { model, options: {} };
    }

    if (providerId === "openai") {
      options.providerOptions.openai = {
        reasoningEffort: reasoningEffort,
        reasoningSummary: "auto",
      };
    } else if (providerId === "anthropic") {
      options.providerOptions.anthropic = {
        effort: reasoningEffort,
      };
    } else if (providerId === "google") {
      options.providerOptions.google = {
        thinkingConfig: {
          thinkingLevel: reasoningEffort,
          includeThoughts: true,
        },
      };
    } else if (providerId === "mistral") {
      // Mistral requires middleware for reasoning extraction
      model = wrapLanguageModel({
        model: model as any, // Cast to any to bypass strict type check for now, assuming compatible underlying model
        middleware: extractReasoningMiddleware({
          tagName: "think",
        }),
      });
    }

    return { model, options };
  }
}
