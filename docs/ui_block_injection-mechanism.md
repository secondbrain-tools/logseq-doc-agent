# Injection Mechanism & BaseBlockInjector

## Overview
The Logseq Doc Agent uses a robust injection mechanism to embed custom UI components into Logseq's virtualized DOM. 

## The Challenge
1. **Virtualization**: Blocks are created/destroyed on scroll.
2. **Reactivity**: Blocks change state (expand/collapse).
3. **Scoping**: Must distinguish between parent and child blocks to avoid double-injection.

## Solution: `BaseBlockInjector`
Located in `src/application/services/base-injector.ts`, this abstract class provides a unified strategy:

1. **DB-First Discovery**: Queries Datascript for relevant blocks using `getQuery()`.
2. **MutationObserver**: Detects scroll/DOM changes to trigger injection.
3. **Caching**: Caches valid UUIDs to minimize DOM operations.
4. **Scoped Injection**: target specific containers (e.g., `.block-main-container`) to avoid false positives in nested blocks.

## Implementation Guide

To create a new injection feature (e.g., Ratings), extend `BaseBlockInjector<TData>` and implement these abstract methods:

```typescript
class MyInjector extends BaseBlockInjector<MyData> {
    // 1. Define where to inject (e.g. LastChild of block)
    protected getInjectionConfig(): InjectionConfig {
        return { 
            position: InjectionPosition.LastChild,
            containerClass: 'my-container-class'
        }; 
    }

    // 2. Return your Svelte component class
    protected getComponent(): any { return MyComponent; }

    // 3. Define the DB query to find blocks
    protected getQuery(page: any): string {
        return `(and (property :my-prop) (page [[${page.name}]]))`;
    }

    // 4. Name of the property to read
    protected getPropertyName(): string { return "my-prop"; }

    // 5. CSS selector for your injected component (for cleanup/deduplication)
    protected getComponentSelector(): string { return ".my-container-class"; }

    // 6. Parse the property string into your data type
    protected parseProperty(content: string, blockId: string): MyData | null { ... }

    // 7. Map data to Svelte component props
    protected getComponentProps(blockId: string, data: MyData): any { ... }
}
```

## Current Usage
- **Ratings**: Uses `BaseBlockInjector` (`InjectRatingsUseCase`).
- **Merges**: Uses a **custom implementation** (`InjectMergesUseCase`) due to complex requirements (Page Toolbar, Selection Listeners), though it shares the same core principles.
