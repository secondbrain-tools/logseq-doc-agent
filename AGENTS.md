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
├ localtests/                      # Simulation environment for UI testing
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

The `localtests` directory facilitates rapid UI development and testing outside of the full Logseq environment.

### Logseq Simulation (`logseq-sim`)

The user should have `npm run dev` running on port 9000. If not ask the user to start the server. reach it under http://localhost:9000/localtests/logseq-sim.html

`localtests/logseq-sim.html` is a standalone simulation page that:

1.  **Mimics Logseq UI**: Replicates the DOM structure and CSS variables (including themes) of Logseq, allowing you to style and test components as if they were injected into the real app.
2.  **Mocks the API**: Uses `logseq-mock-api.js` to implement the `LogseqApi` interface. This allows testing plugin features that rely on `window.logseq` (like `Editor.getBlock` or `UI.showMsg`) in isolation, with controllable state.
3.  **Isolates State**: Provides a clean environment to verify parser logic (`logseq-sim-lib.js`) and interaction flows without the overhead of reloading Logseq.

Use this environment to iterate on component designs and verify interactions before integrating them into the main plugin.


