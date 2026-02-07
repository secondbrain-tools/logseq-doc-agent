# Structure

```
Project Structure
├ src/
│ ├ app.html                      # App template
│ ├ ui/                           # Presentation layer
│ │ ├ components/                 # Reusable, dumb components
│ │ ├ state/                      # Optional shared client state (runes/stores)
│ │ ├ styles/                     # Design tokens and all styles (see Styling)
│ │ └ util/                       # UI-only mappers/formatters
│ ├ application/                   # Use cases + ports (no I/O)
│ │ ├ usecases/
│ │ │ └ types.ts                   # Internal usecase types (e.g. RatingResponse, ReasoningResponse)
│ │ └ ports/                       # Boundary contracts (try to separte into different files according to library / or even use case)
│ ├ domain/                        # DDD core (framework-agnostic)
│ │ ├ settings.ts                    # Settings domain and provider definitions
│ │ ├ group_entities.ts              # Pure domain entities (try to separate by groups e.g. feedback, or chat)
│ │ └ group_value-objects.ts         # Domain value objects (e.g. try to separate by groups e.g. feedback, or chat)
│ ├ infra/                         # Concrete communication interfaces (e.g. for rest clients)
│ │ ├ ai/                          # AI service adapters and tools
│ │ │ ├ tools/                     # AI tools definitions (impl. of ai-sdk tools)
│ │ │ └ vercel-ai-adapter.ts       # Adapter for Vercel AI SDK
│ ├ plugin/                        # Logseq integration layer
│ │ ├ index.ts                       # Plugin entry point & registration
│ │ └ settings-manager.ts            # Logseq settings handling logic
│ ├ services.ts                    # DI Container & Global Services Registry
├ services.ts                    # DI Container & Global Services Registry
├ tests/                           # Integration tests & Simulation environment
│ ├ logseq-sim*                   # Logseq UI simulator with a mock Logseq API implementation
├ public/                            # Public assets
├ svelte.config.js                   # experimental.remoteFunctions + compiler experimental.async
├ package.json
├ tsconfig.json
└ vite.config.ts
```


# Styling
    
### 1. Naming Convention
*   **Prefix**: All CSS classes MUST use the `.lda-` prefix (e.g., `.lda-popover`, `.lda-btn`).
*   **Scope**: This ensures styles do not conflict with Logseq's native UI or other plugins.

### 2. File Organization
*   Place CSS files in `src/ui/styles/` (e.g., `chat.css`, `feedback-components.css`).
*   **Do not** use `<style>` blocks inside Svelte components for styles that need to be injected into Logseq (popovers, sidebars).

### 3. Logseq Integration (Injection)
Styles must be manually injected into the main Logseq document to work in the Sidebar or Main UI.

1.  **Import as Inline**: In `src/plugin/index.ts`:
    ```typescript
    import chatCSS from '../ui/styles/chat.css?inline';
    ```
2.  **Inject**:
    ```typescript
    const cssContent = `${logseqCSS}\n${chatCSS}`;
    // Inject logic typically in setupPlugin() or style-injector utility
    doc.head.insertAdjacentHTML('beforeend', `<style id="logseq-doc-agent-css">${cssContent}</style>`);
    ```

### 4. Theming
*   Use Logseq's native CSS variables to support Light/Dark modes automatically.
*   Examples:
    *   `var(--ls-primary-background-color)`
    *   `var(--ls-primary-text-color)`
    *   `var(--ls-border-color)`
    *   `var(--ls-link-text-color)`

# Building / Checking

use `ǹpm run build` for building and `npm run check` for checking


# Plugin UI-Testing

The `tests` directory facilitates rapid UI development and testing outside of the full Logseq environment.

### Logseq Simulation (`logseq-sim`)

The user should have `npm run dev` running on port 9000. If not ask the user to start the server. reach it under http://localhost:9000/tests/logseq-sim.html

`tests/logseq-sim.html` is a standalone simulation page that:

1.  **Mimics Logseq UI**: Replicates the DOM structure and CSS variables (including themes) of Logseq, allowing you to style and test components as if they were injected into the real app.
2.  **Mocks the API**: Uses `logseq-mock-api.js` to implement the `LogseqApi` interface. This allows testing plugin features that rely on `window.logseq` (like `Editor.getBlock` or `UI.showMsg`) in isolation, with controllable state.
3.  **Isolates State**: Provides a clean environment to verify parser logic (`logseq-sim-lib.js`) and interaction flows without the overhead of reloading Logseq.

Use this environment to iterate on component designs and verify interactions before integrating them into the main plugin.



# Automated Testing

We use **Vitest** for automated testing, configured with `jsdom` for browser simulation.

### 1. Unit Strategy (Colocation)
*   **Unit tests** should be colocated with the file they check, using the `*.test.ts` naming convention.
*   **Domain & Infra**: Test pure logic (parsers, calculators, entities) in isolation.
*   **Components**: Test Svelte components using `@testing-library/svelte` to verify rendering and behavior.

### 2. Integration Tests (`tests/`)
*   The `tests/` directory at the root is reserved for higher-level integration tests, simulation scripts (moved from `localtests`), and manual verification pages.
*   These tests may verify end-to-end flows or complex interactions that span multiple layers.

### 3. Running Tests
*   `npm test`: Runs all tests in watch mode.
*   `npm run test:run`: Runs all tests once (CI mode).
*   `npm run test:ui`: Opens Vitest UI.

# AI Agent Tools & Conventions

### Short ID Addressing
We use **Session-based Short IDs** (e.g., `#a1b2`) for stable, concise block references without graph pollution.

*   Implemented by `ShortIdService` (`src/infra/ai/short-id.service.ts`).
*   IDs are ephemeral (session-only), 4-char alphanumeric, and lazily mapped 1:1 to UUIDs.
*   Tools like `get_logseq_document` append these IDs (e.g., `[1.2 #a1b2]`) for the Agent to use in subsequent operations.

# Known Nuances

### Svelte 5 Event Binding in Logseq
*   **Issue**: Svelte 5's inline event handlers (`onclick={...}`) may fail silently in both the Logseq plugin environment and `logseq-sim`. This typically occurs with:
    -   Elements rendered dynamically in `{#each}` loops
    -   Components inside portals or modals
    -   Deeply nested interactive elements
*   **Symptoms**: Clicks reach the DOM element but no handler executes; no console errors.
*   **Solution**: Use Svelte Actions to attach event listeners directly:
    ```svelte
    <script>
      function clickAction(node: HTMLElement, fn: () => void) {
        const handler = (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          fn();
        };
        node.addEventListener('click', handler);
        return { destroy: () => node.removeEventListener('click', handler) };
      }
    </script>
    
    <!-- Instead of onclick={...}, use: -->
    <button use:clickAction={() => doSomething()}>Click</button>
    ```
*   **When to use**: Prefer actions for interactive elements in dynamic lists, modals, or any component where standard `onclick` fails silently.

# UI Block Injection

The Blockinjector offers UI injection methods (MutationObservers, Virtualization support, Parent-block scoping) for Logseq blocks.

> [!IMPORTANT]
> **You should read [Injection Mechanism](docs/injection-mechanism.md) if:**
> - You need to implement a new feature that embeds UI into blocks.
> - You are debugging issues with controls not appearing, disappearing on scroll, or appearing on the wrong blocks.
> - You want to understand how we minimize DOM thrashing and ensure performance.
