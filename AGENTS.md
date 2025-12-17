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
│ │ ├ group_entities.ts                  # Pure domain entities (try to separate by groups e.g. feedback, or chat)
│ │ └ group_value-objects.ts             # Domain value objects (e.g. try to separate by groups e.g. feedback, or chat)
│ ├ infra/                         # Concrete communication interfaces (e.g. for rest clients)
├ public/                            # Public assets
├ svelte.config.js                   # experimental.remoteFunctions + compiler experimental.async
├ package.json
├ tsconfig.json
└ vite.config.ts
```

# Styling

use a lda- prefix for all styles, to prevent conflicts

### Global CSS Pattern for Injected Components

For Logseq plugins that inject components into the main document:

1. **Global CSS file**: Create in `src/styles/` with all component styles
2. **Dual imports**:
   - `import './styles/component.css'` in main.ts (for bundling)
   - `import cssContent from '../styles/component.css?raw'` in domUtils.ts (for injection)
3. **Injection pattern**:
   ```typescript
   function injectStyles(): void {
     const mainDocument = window.parent?.document || window.top?.document;
     const styleElement = mainDocument.createElement('style');
     styleElement.id = 'unique-id';
     styleElement.textContent = cssContent;
     mainDocument.head.appendChild(styleElement);
   }
   ```
4. **Components**: Remove local `<style>` blocks, use global classes only

# Building / Checking

use `ǹpm run build` for building and `npm run check` for checking