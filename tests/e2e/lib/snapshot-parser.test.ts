import { describe, it, expect } from 'vitest';
import { parseSnapshot } from './snapshot-parser';
import { buildIdRemap, remapChatlog, extractChatlogContext, buildFullRemap, chainIdMaps } from './id-remapper';

describe('snapshot-parser', () => {
    it('should parse a basic page with nested blocks', () => {
        const text = `Selection Type: page\nPage: Merge Content (id:930)\n\n- id:931 # Outliner Features in PKM Tools\n  - id:933 Hierarchical organization: Outliners provide...\n    - id:934 Child of hierarchical...`;
        
        const page = parseSnapshot(text);
        
        expect(page.pageId).toBe(930);
        expect(page.pageName).toBe('Merge Content');
        expect(page.blocks.length).toBe(1);
        expect(page.blocks[0].id).toBe(931);
        expect(page.blocks[0].children.length).toBe(1);
        expect(page.blocks[0].children[0].id).toBe(933);
        expect(page.blocks[0].children[0].children.length).toBe(1);
        expect(page.blocks[0].children[0].children[0].id).toBe(934);
    });

    it('should handle lowercase page names', () => {
        const text = `Selection Type: page\nPage: merge content (id:225)\n\n- id:232 # Outliner Features`;
        const page = parseSnapshot(text);
        expect(page.pageId).toBe(225);
        expect(page.pageName).toBe('merge content');
    });
});

describe('id-remapper', () => {
    it('should match IDs exactly between snapshots and current Logseq string', () => {
        const recordedStr = `Selection Type: page\nPage: Merge Content (id:930)\n\n- id:931 # Outliner Features in PKM Tools\n  - id:933 Hierarchical organization: Outliners provide...`;
        const currentStr = `Selection Type: page\nPage: Merge Content (id:1000)\n\n- id:1001 # Outliner Features in PKM Tools\n  - id:1002 Hierarchical organization: Outliners provide...`;
        
        const recordedPage = parseSnapshot(recordedStr);
        const currentPage = parseSnapshot(currentStr);

        const remap = buildIdRemap(recordedPage, currentPage);
        expect(remap.get(930)).toBe(1000); // Page ID
        expect(remap.get(931)).toBe(1001); // Parent block
        expect(remap.get(933)).toBe(1002); // Child block
    });

    it('should skip missing content elements', () => {
         const recordedStr = `Selection Type: page\nPage: Merge Content (id:930)\n\n- id:931 A\n  - id:933 B\n  - id:934 C`;
         const currentStr = `Selection Type: page\nPage: Merge Content (id:1000)\n\n- id:1001 A\n  - id:1002 B`;
         
         const recordedPage = parseSnapshot(recordedStr);
         const currentPage = parseSnapshot(currentStr);

         const remap = buildIdRemap(recordedPage, currentPage);

         expect(remap.get(934)).toBeUndefined();
    });

    it('should rewrite chatlog tool arguments', () => {
        const idMap = new Map([[930, 1000], [931, 1001]]);
        
        const chatlog = {
            messages: [{
                parts: [{
                    type: "tool_call",
                    toolName: "updateBlock",
                    toolArgs: {
                        id: 931,
                        content: "new tool args"
                    }
                }]
            }]
        };

        const remapped = remapChatlog(chatlog, idMap);
        expect(remapped.messages[0].parts[0].toolArgs.id).toBe(1001);
    });

    it('should extract chatlog context from user message', () => {
        const chatlog = {
            messages: [{
                role: 'user',
                parts: [{
                    type: 'context',
                    contextContent: 'Selection Type: page\nPage: Test (id:100)\n\n- id:101 Hello'
                }]
            }]
        };

        const ctx = extractChatlogContext(chatlog);
        expect(ctx).toContain('id:100');
        expect(ctx).toContain('id:101');
    });

    it('should chain two remaps: chatlog→snapshot→current', () => {
        const chatlogToSnapshot = new Map([[962, 933], [970, 934]]);
        const snapshotToCurrent = new Map([[933, 234], [934, 230]]);
        
        const chained = chainIdMaps(chatlogToSnapshot, snapshotToCurrent);
        expect(chained.get(962)).toBe(234);
        expect(chained.get(970)).toBe(230);
    });

    it('should build full remap from chatlog context → snapshot → current', () => {
        const chatlogCtx = `Selection Type: page\nPage: Merge Content (id:951)\n\n- id:966 # Outliner\n  - id:962 Hierarchical organization: Outliners`;
        const snapshot = `Selection Type: page\nPage: Merge Content (id:930)\n\n- id:931 # Outliner\n  - id:933 Hierarchical organization: Outliners`;
        const current = `Selection Type: page\nPage: merge content (id:225)\n\n- id:232 # Outliner\n  - id:234 Hierarchical organization: Outliners`;

        const remap = buildFullRemap(chatlogCtx, snapshot, current);
        expect(remap.get(951)).toBe(225);  // page
        expect(remap.get(966)).toBe(232);  // root block
        expect(remap.get(962)).toBe(234);  // child block
    });
});
