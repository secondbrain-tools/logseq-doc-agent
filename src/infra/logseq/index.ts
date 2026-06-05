/**
 * Logseq-specific infrastructure implementations
 */

export { LogseqEvaluationCalculator } from "./evaluation-calculator";
export {
  createLogseqApi,
  detectLogseqRuntime,
  LegacyLogseqApi,
  DbLogseqApi,
} from "./logseq-runtime";
export type { LogseqRuntimeInfo, LogseqRuntimeMode } from "./logseq-runtime";
export { getCurrentLogseqApi, setCurrentLogseqApi } from "./runtime-context";

// Re-export the consolidated frontend component injector for use in Logseq
export { FrontendComponentInjector } from "../frontend/component-injector";
