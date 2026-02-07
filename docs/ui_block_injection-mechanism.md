# Injection Mechanism & BaseBlockInjector

## Overview
The Logseq Doc Agent uses a sophisticated injection mechanism to embed custom UI components (like Merge Controls and Feedback Ratings) directly into Logseq's DOM. 

This mechanism is centralized in the `BaseBlockInjector` abstract class, which handles the complex requirements of working within Logseq's dynamic, virtualized environment.

## The Challenge
Logseq presents several challenges for DOM manipulation:
1.  **Virtualization**: Blocks are created and destroyed as the user scrolls. A simple `onLoad` script would fail because most blocks don't exist in the DOM until they are scrolled into view.
2.  **Reactivity**: Blocks can change state (collapse/expand), requiring re-injection.
3.  **Parent/Child Nesting**: Parent blocks contain their children in the DOM tree. A naive search for "current block" might accidentally find a child block's controls, leading to false positives (skipping the parent).
4.  **Data Reliability**: The DOM attributes are not always up-to-date with the database state.

## Architecture: BaseBlockInjector

The `BaseBlockInjector` (`src/application/services/base-injector.ts`) solves these problems with a unified strategy:

### 1. Database-First Discovery
Instead of scanning the DOM for properties (which is unreliable), we query the **Datascript DB** first.
- **Why**: The DB is the source of truth. It tells us exactly which UUIDs *should* have controls on the current page.
- **How**: `getQuery(currentPage)` returns a query like `(and (property :my-prop) (page [[PageName]]))`.

### 2. Direct UUID Lookup & Caching
We cache the list of valid UUIDs from the DB. Then, we use a specialized DOM lookup (`findBlockElements`) to find the specific `div`s for those UUIDs.
- **Benefit**: We only touch elements we *know* are relevant.

### 3. MutationObserver for Virtualization
We attach a `MutationObserver` to the main app container.
- **How it works**: When you scroll, Logseq adds new rows to the DOM. The observer detects this and triggers a debounced `injectFromCache()` pass.
- **Result**: Controls "magically" appear on blocks as they scroll into view.

### 4. Scoped Duplicate Detection (The "Parent Block Fix")
To prevent double-injection, we check if controls already exist.
- **Crucial Detail**: We check strictly within the injection target (e.g., `.block-main-container`) rather than the whole block element.
- **Why**: Searching the whole block would find *children's* controls and falsely mark the parent as "done". Scoping ensures parents get their own controls.

### 5. Robust Property Retrieval (Fallback)
We attempt to read the property content via `getBlockPropertyContent`. If that returns null (due to indexing lag), we fallback to fetching the full block entity and parsing the `properties` object directly.

## Usage
To creating a new injection feature (e.g., "Inject AI Analysis"):

1.  **Extend `BaseBlockInjector<DataType>`**.
2.  **Implement Abstract Methods**:
    - `getInjectionConfig()`: Define target (`.block-main-container`) and position.
    - `getComponent()`: Return your Svelte component.
    - `getQuery()`: Define your Datalog/Simple query.
    - `parseProperty()`: How to turn the string property into data.

### Example
```typescript
class InjectAnalysisUseCase extends BaseBlockInjector<AnalysisData> {
    protected getQuery(page) { 
        return `(and (property :ai-analysis) (page [[${page.name}]]))`; 
    }
    // ... other methods
}
```

## Injection Targets
- **Merges**: Injected into `.block-main-container` (LastChild) to appear inline with content.
- **Ratings**: Injected into the block structure (LastChild) to appear below content.
