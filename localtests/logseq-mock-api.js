import { getBlocks } from './logseq-sim-lib.js';

// Recursive helper to find a block by ID
function findBlockById(roots, id) {
    for (const node of roots) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findBlockById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

// Mock implementation of the Logseq API
export const logseq = {
    App: {
        getCurrentGraph: async () => ({
            name: 'localtests',
            url: 'local'
        }),
        registerUIItem: (location, config) => {
            console.log(`[MockLogseq] registerUIItem: ${location}`, config);
        }
    },
    Editor: {
        getCurrentPage: async () => ({
            name: 'Logseq Simulation',
            uuid: 'page-uuid-123'
        }),
        appendBlockInPage: async (pageId, content) => {
            console.log(`[MockLogseq] appendBlockInPage: ${pageId}`, content);
            // In a real mock, we would append to sourceText signal here
            return { uuid: 'new-block-uuid' };
        },
        registerSlashCommand: (name, callback) => {
            console.log(`[MockLogseq] registerSlashCommand: /${name}`);
        },
        registerBlockContextMenuItem: (name, callback) => {
            console.log(`[MockLogseq] registerBlockContextMenuItem: ${name}`);
        },
        getBlock: async (uuid, opts) => {
            console.log(`[MockLogseq] getBlock: ${uuid}`);
            const roots = getBlocks();
            const block = findBlockById(roots, uuid);
            if (block) {
                // Return a simplified BlockEntity structure
                return {
                    uuid: block.id,
                    content: block.content,
                    properties: block.properties,
                    // mock other fields if needed
                };
            }
            return null;
        },
    },
    UI: {
        showMsg: async (message, type) => {
            console.log(`[MockLogseq] showMsg: [${type}] ${message}`);
            alert(`[${type || 'info'}] ${message}`);
        }
    },
    provideModel: (model) => {
        console.log(`[MockLogseq] provideModel`, model);
    }
};

// Make it available globally as expected by plugins
window.logseq = logseq;
