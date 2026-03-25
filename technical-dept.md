# Technical Debt

## 1. Large / God Files

| File | Lines | Issue |
|------|------:|-------|
| `src/ui/components/evaluation/EvaluationIssueBlock.svelte` | 1064 | Largest Svelte component. Likely mixing UI, logic, and state. |
| `src/ui/components/chat/ChatInputArea.svelte` | 950 | Very large input area with embedded model selection, context, prompt picking, etc. |
| `src/ui/components/chat/ChatInterface.svelte` | 910 | Mixes clipboard logic, model config parsing, message grouping, auto-scroll, and rendering. |
| `src/plugin/settings-manager.ts` | 692 | Purely imperative schema builder — one giant function with duplicated setting blocks for built-in, custom, and compat providers. |
| `src/ui/components/merge/MergeControls.svelte` | 618 | Large merge UI component. |
| `src/infra/frontend/text-highlighter.ts` | 604 | Complex DOM manipulation logic. |
| `src/infra/logseq/agent-repository.ts` | 561 | Repository contains notice-block management, property deduplication boilerplate, and subtree management alongside core CRUD. |
| `src/application/usecases/chat-sidebar.usecase.ts` | 529 | Mixes stream parsing, message state management, chatlog save orchestration, and agent context building. |

**Recommendation**: Extract concerns into smaller, focused modules. For example, `ChatInterface.svelte` could delegate model configuration to a service, clipboard handling to a utility, and message grouping to a derived store.


## 2. Excessive `as any` Casts (~50+ instances)

### Hot spots:
- **`chat-sidebar.usecase.ts`** (10 casts) — Stream chunk parsing uses `(chunk as any).type`, `.text`, `.textDelta`, `.toolCallId`, etc. Missing typed discriminated union for stream events.
- **`inject-merges.usecase.ts`** (6 casts) — `(window as any).parent`, `(this.componentInjector as any).dispose()`, `this.logseqApi.Editor as any`.
- **`agent-repository.ts`** (4 casts) — `(child as any).uuid` for child block access.
- **`model-factory.ts`** — `model as any` to bypass strict type check.
- **`logseq-api.ts`** — `callback as any`, `location as any`, `type as any` in Logseq SDK wrapper calls.
- **`chatlog-repository.test.ts`** (11 casts) — Test mocks are largely untyped, using `as any` extensively.

### Root causes:
1. **Missing type definitions for Vercel AI SDK stream chunks** — No discriminated union type for the `partType` variants.
2. **Missing typed interface for Logseq child blocks** — Logseq API returns `children` as heterogeneous arrays (sometimes `[type, uuid]` tuples, sometimes objects).
3. **`window.logseq` global** — Accessed via `(window as any).logseq` in 6+ files. Should use a typed global declaration or central accessor.
4. **Test mocks** — No shared mock factories; each test creates `as any` partial mocks inline.

**Recommendation**: 
- Create a `StreamChunkEvent` discriminated union type.
- Create a `LogseqChildBlock` type alias handling the heterogeneous format.
- Add a `global.d.ts` declaring `window.logseq`.
- Create reusable mock factories for tests.


## 3. `@ts-ignore` Suppressions

| File | Count | Reason |
|------|------:|--------|
| `ChatHistoryModal.svelte` | 4 | `Intl.Locale.weekInfo` (Stage 3 proposal, not in TS lib types yet). |
| `message-mapper.test.ts` | 2 | Import type issues. |
| `sidebar-injector.test.ts` | 1 | Unknown. |
| `logseq-api.ts` | 1 | Global `logseq` object access. |

**Recommendation**: Replace with `@ts-expect-error` (fails if the error disappears) or add proper type declarations.


## 4. `InjectMergesUseCase` Does Not Extend `BaseBlockInjector`

`InjectEvaluationsUseCase` properly extends `BaseBlockInjector<T>`, but `InjectMergesUseCase` duplicates all of its core patterns:
- `validMergeUuidsCache` / `validUuidsCache`
- `setupObserver()` with identical debounce logic
- `injectFromCache()` with identical UUID→DOM element resolution + missing-UUID debug logging
- `cleanupStaleMergeControls()` / `cleanupStaleControls()`
- `dispose()` with identical observer cleanup

This is ~200 lines of near-identical code between the two files.

**Recommendation**: Refactor `InjectMergesUseCase` to extend `BaseBlockInjector<MergeEntity>` like evaluations do.


## 5. Duplicated Clipboard Logic

`ChatInterface.svelte` contains **three** clipboard copy paths:
1. `handleCopyKey()` (Ctrl+C capture phase intercept)
2. `copySelectionToClipboard()` (context menu "Copy Selection")
3. `copyMessageToClipboard()` (context menu "Copy Message")

All three share the same pattern: `window.focus()` → `navigator.clipboard.writeText()` → `catch → copyToClipboardFallback()`.

**Recommendation**: Extract a single `copyToClipboard(text: string)` utility in `src/ui/util/` that handles focus, clipboard API, and fallback.


## 6. Duplicated `ensureNoticeBlock()` Logic

Both `InitDataService` and `LogseqAgentRepository` contain virtually identical `ensureNoticeBlock()` methods that:
1. Find existing notice by `NOTICE_MARKER_PROPERTY`
2. Update it if found
3. Insert after first block or append to empty page

**Recommendation**: Extract into a shared utility, e.g., `src/application/util/notice-block.ts`.


## 7. Duplicated Model Configuration Parsing

Model/provider configuration parsing is duplicated between:
- `settings-manager.ts` → `configureSettings()` (builds the settings schema)
- `ChatInterface.svelte` → `loadConfiguredModels()` (reads settings to build UI model groups)

Both iterate over `PROVIDERS`, check `enable_provider_*`, `enable_model_*`, parse `custom_models` JSON, and iterate over `parseOpenAICompatProviders()`.

**Recommendation**: Extract a shared `getEnabledModels(settings)` function in the domain/settings layer.


## 8. Excessive Console Logging

**140+ `console.log` and 50+ `console.warn` statements** in production source code (excluding tests). Many are debug-level logs left from development:

- `"goto chat"`, `"toggle chat expand"` — trivial action logging
- `"Agents found"`, `"Current page:"` — verbose operational state
- `"Copied to clipboard"`, `"Selection copied to clipboard"` — success confirmations
- Many `[Plugin]`, `[InjectMerges]`, `[InitDataService]` prefixed debug statements

**Recommendation**: Implement a lightweight logger with configurable log levels (debug/info/warn/error), and replace raw `console.*` calls. Set production default to `warn`.


## 9. Disabled Feature Code Left In

`src/application/services/init-data.service.ts` (line 104):
```typescript
// temporary disabled - need a better source definition concept
// if (agentsResult.isNew && agentsResult.page) {
//     await this.populateDefaultAgents(agentsResult.page.name);
// }
```

The `populateDefaultAgents` method itself appears to have been removed, leaving a stale comment and dead intent.

**Recommendation**: Remove the commented-out code or create a tracking issue.


## 10. Deprecated Schema Fields Without Migration

`src/domain/evaluation/entity.ts` (line 65):
```typescript
user_feedback: z.array(UserFeedbackSchema).optional()
  .describe("DEPRECATED: criterion-level feedback. Use issue-level user_feedback instead.")
```

The deprecated field is still in the Zod schema with no sunset timeline or active migration.

**Recommendation**: Add a migration or remove the deprecated field on next major version.


## 11. Settings Manager: `as any` for Logseq SDK Limitations

The settings manager uses `inputAs: 'password' as any` and `logseq.useSettingsSchema(settings as any)` because `@logseq/libs` types don't include `inputAs` or the full settings schema type.

**Recommendation**: Contribute the missing types upstream to `@logseq/libs`, or create local type augmentations.


## 12. Missing Test Coverage

### Untested or under-tested areas:
| Area | Status |
|------|--------|
| `ChatSidebarUseCase` (529 lines) | No unit tests |
| `InjectMergesUseCase` (365 lines) | No unit tests |
| `InjectEvaluationsUseCase` (161 lines) | No unit tests |
| `InitDataService` (370 lines) | No unit tests |
| `agent-repository.ts` (561 lines) | No unit tests |
| `IssueReplyService` (250 lines) | No unit tests |
| `EvidenceHighlightService` (130 lines) | No unit tests |
| All Svelte components | No component tests (only `message-bubble.utils` and `diff-utils` are tested) |
| `settings-manager.ts` | Only `generateUniqueCompatProviderId` likely tested |
| `model-factory.ts` | No unit tests |
| `context-utils.ts` | No unit tests |

Test coverage exists mainly for:
- AI tools (subtree-parser, block tools, document tool, evaluation tool)
- Utility functions (properties, diff-utils, text-highlighter, chatlog service, merge-action)
- Infra adapters (message-mapper, agent-runner, chatlog-repository, sidebar-injector)

**Recommendation**: Prioritize tests for use cases and services, especially `ChatSidebarUseCase` and `InitDataService` which orchestrate critical flows.


## 13. `window.logseq` Access Pattern Inconsistency

The `window.logseq` global is accessed in 6+ different ways across the codebase:
1. `(window as any).logseq` — most common
2. Bare `logseq` (via `@logseq/libs` import) — in `settings-manager.ts`, `inject-evaluations.usecase.ts`
3. Via `LogseqApiImpl` (the proper abstraction) — used by services and use cases
4. `const logseq = (window as any).logseq` — in `main.ts`

Some files bypass the `LogseqApiImpl` abstraction entirely (e.g., `inject-merges.usecase.ts` directly calls `logseq.App.registerUIItem`).

**Recommendation**: Ensure all Logseq API access goes through `LogseqApiImpl`. The bare `logseq` global should only be used in `plugin/index.ts` for direct SDK registration calls.


## 14. `debounce` Re-implementation

`plugin/index.ts` (line 186) contains a hand-rolled `debounce` function. There's also debounce logic in `BaseBlockInjector` and `InjectMergesUseCase` using manual `setTimeout`/`clearTimeout`.

**Recommendation**: Create a shared `debounce` utility in `src/application/util/` or `src/ui/util/`.


## 15. Property Key Boilerplate in `agent-repository.ts`

The repository maintains **14 static property constants** (kebab-case + camelCase pairs) and **6 key group arrays** to handle Logseq's dual property naming. This is ~80 lines of pure boilerplate.

**Recommendation**: Create a `LogseqPropertyResolver` utility that takes a kebab-case key and automatically checks both kebab and camelCase variants, reducing the boilerplate to a single declaration per property.


## 16. Svelte Stores Mixed with Runes

`ChatSidebarUseCase` uses **Svelte stores** (`writable`, `get`, `.update`, `.set`) while components use **Svelte 5 runes** (`$state`, `$derived`, `$effect`). The use case passes stores as props, resulting in components needing `$storeVar` syntax to unwrap.

This is a transitional pattern from Svelte 4 → 5 migration.

**Recommendation**: Once fully committed to Svelte 5, consider migrating use case state to rune-based reactive classes (like `MergeState` and `EvaluationState` already do).