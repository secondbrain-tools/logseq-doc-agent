import { effect } from 'https://esm.sh/@preact/signals@1.2.2';
import { getBlocks, blockState, registerContextMenuItem, selectedBlockUuid } from './logseq-sim-lib.js';

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

            // Map Logseq locations to Simulator DOM IDs
            let targetId = null;
            if (location === 'pagebar') targetId = 'sim-pagebar';
            else if (location === 'toolbar') targetId = 'sim-toolbar';

            if (targetId) {
                // Defer slightly to ensure DOM is ready? 
                // Usually registerUIItem is called early. 
                // Sim app might be mounted. Try immediate, if fails rely on retry or document check.
                const tryInject = () => {
                    const target = document.getElementById(targetId);
                    if (target) {
                        const temp = document.createElement('div');
                        temp.innerHTML = config.template;
                        const el = temp.firstElementChild;
                        if (el) {
                            // Remove existing by ID to avoid dupes
                            const existing = document.getElementById(el.id);
                            if (existing) existing.remove();

                            target.appendChild(el);
                            console.log(`[MockLogseq] Injected ${el.id} into ${targetId}`);
                        }
                    }
                };

                // If document is ready, try. If not, wait.
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', tryInject);
                } else {
                    tryInject();
                    // Also retry a bit later for React/Preact mount
                    setTimeout(tryInject, 500);
                }
            }
        },
        openRightSidebar: () => {
            console.log('[MockLogseq] openRightSidebar');
            window.dispatchEvent(new CustomEvent('logseq:open-sidebar'));
        },
        onRouteChanged: (callback) => {
            console.log('[MockLogseq] onRouteChanged registered');
            logseq.App._routeChangedCallback = callback;
            return () => {
                console.log('[MockLogseq] onRouteChanged unsubscribed');
                logseq.App._routeChangedCallback = null;
            };
        },
        // Helper to trigger route changes from simulator console/UI
        _triggerRouteChanged: (path, template) => {
            if (logseq.App._routeChangedCallback) {
                logseq.App._routeChangedCallback({ path, template: template || 'page' });
            }
        },
        registerCommandPalette: (config, callback) => {
            console.log('[MockLogseq] registerCommandPalette registered:', config);
            logseq.App._commands = logseq.App._commands || {};
            logseq.App._commands[config.key] = { config, callback };

            // Bind key listener in Sim?
            // For now, simpler to expose a trigger helper
        },
        // Helper to trigger commands in simulation
        _triggerCommand: (key) => {
            console.log(`[MockLogseq] Triggering command: ${key}`);
            if (logseq.App._commands && logseq.App._commands[key]) {
                logseq.App._commands[key].callback();
            } else {
                console.warn(`[MockLogseq] Command not found: ${key}`);
            }
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
            return { uuid: 'new-block-uuid-' + Date.now() };
        },
        insertBlock: async (srcBlock, content, options) => {
            console.log(`[MockLogseq] insertBlock: ${srcBlock}`, content, options);
            // Generate a unique ID for the new block
            const blockId = Math.floor(Math.random() * 100000);
            const blockUuid = 'mock-block-' + Math.random().toString(36).substr(2, 5);

            // Find the page containing srcBlock
            let targetPage = null;
            for (const p of logseq._pages) {
                if (p.blocks && p.blocks.find(b => b.uuid === srcBlock)) {
                    targetPage = p;
                    break;
                }
            }

            // If not found, try to use the last active page or just fail gracefully
            if (!targetPage) {
                if (logseq._pages.length > 0) {
                    targetPage = logseq._pages[logseq._pages.length - 1];
                }
            }

            const newBlock = {
                id: blockId,
                uuid: blockUuid,
                content: content,
                properties: options?.properties || {}
            };

            if (targetPage) {
                if (!targetPage.blocks) targetPage.blocks = [];
                targetPage.blocks.push(newBlock);
            }

            // Also add to blockState for getBlock lookups
            const state = blockState.value;
            state[blockUuid] = newBlock;

            return newBlock;
        },
        registerSlashCommand: (name, callback) => {
            console.log(`[MockLogseq] registerSlashCommand: /${name}`);
        },
        registerBlockContextMenuItem: (name, callback) => {
            console.log(`[MockLogseq] registerBlockContextMenuItem: ${name}`);
            registerContextMenuItem({ label: name, callback });
        },
        getBlock: async (uuid, opts) => {
            // console.log(`[MockLogseq] getBlock: ${uuid}`, opts);

            // First check agent blocks (if loaded)
            if (logseq._agentBlocks && logseq._agentBlocks[uuid]) {
                const block = logseq._agentBlocks[uuid];
                const result = {
                    id: block.id || 0, // Agent blocks might not have IDs yet, default to 0
                    uuid: block.uuid,
                    content: block.content,
                    properties: block.properties,
                    children: opts?.includeChildren ? block.children : []
                };
                return result;
            }

            // Then check parsed block state
            const state = blockState.value;
            let block = state[uuid];

            // If not found by UUID, try lookup by integer ID
            if (!block && (typeof uuid === 'number' || (typeof uuid === 'string' && /^\d+$/.test(uuid)))) {
                const searchId = parseInt(uuid);
                block = Object.values(state).find(b => b.id === searchId);
            }

            if (block) {
                // Return a simplified BlockEntity structure
                const result = {
                    id: block.id,
                    uuid: block.uuid,
                    content: block.content,
                    properties: block.properties,
                    children: [] // Default empty
                };

                // Simple child fetching if requested
                if (opts && opts.includeChildren && block.children && block.children.length > 0) {
                    // Helper to map children recursively
                    const mapChildren = (nodes) => {
                        return nodes.map(n => ({
                            uuid: n.uuid,
                            content: n.content,
                            properties: n.properties,
                            children: mapChildren(n.children || [])
                        }));
                    };
                    result.children = mapChildren(block.children);
                }

                return result;
            } else {
                console.warn(`[MockLogseq] getBlock: Block not found for uuid: ${uuid}`);
            }
            return null;
        },
        updateBlock: async (uuid, newContent) => {
            console.log(`[MockLogseq] updateBlock: ${uuid}`);
            const state = blockState.value;
            const block = state[uuid];
            if (block) {
                // Update in memory
                // Note: Sim uses Preact signals. 
                // Updating the object property directly might not trigger deep reactive update in UI 
                // unless we trigger the signal.
                // The `blockState` is a signal of the map.
                // But the values inside are objects.
                // `logseq-sim-lib.js` re-parses everything from `sourceText`.
                // So the strictly correct way to update Sim is to update `sourceText`.
                // BUT that is hard because we need to find WHERE in text to replace.
                // Shortcuts:
                // 1. Update the `block.content` directly. The UI might reflect if components read `block.content`.
                //    Components read `node.content`.
                //    Wait, `logseq-sim-lib.js` generates blocks FROM sourceText.
                //    If we update `block.content`, it updates the VIEW temporarily.
                //    But `sourceText` remains stale.
                //    That's fine for "Accept" feedback in simpler Sim.
                //    Or we can try to find and replace in `sourceText`.

                block.content = newContent;
                // Force signal update?
                // blockState.value = { ...state }; 

                // Better: Try to update Source Text to make it permanent in Sim?
                // Let's assume updating the in-memory block object is enough for now to avoid complexity of regenerating Org files.
                // We'll update the block object so UI components (which hold reference to node) update.
                // And we trigger a signal update if possible.
                // Actually `blockState.value = { ...state }` might trigger generic re-render.

                return;
            } else {
                console.warn(`[MockLogseq] updateBlock: Block not found ${uuid}`);
            }
        },
        removeBlock: async (uuid) => {
            console.log(`[MockLogseq] removeBlock: ${uuid}`);
            const state = blockState.value;
            const block = state[uuid];
            if (block) {
                // Remove from state
                delete state[uuid];

                // Also need to remove from parent's children array if possible
                // This is hard without back-references in this simple mock
                // But for `updateBlock` testing we might just check if children are gone from the parent object we hold
                // Ideally we find the parent page or block

                // Iterate pages to find parent
                for (const p of logseq._pages) {
                    if (p.blocks) {
                        const idx = p.blocks.findIndex(b => b.uuid === uuid);
                        if (idx !== -1) {
                            p.blocks.splice(idx, 1);
                            return;
                        }
                        // Recursive search for block parent
                        const removeFromChildren = (nodes) => {
                            const idx = nodes.findIndex(n => n.uuid === uuid);
                            if (idx !== -1) {
                                nodes.splice(idx, 1);
                                return true;
                            }
                            for (const n of nodes) {
                                if (n.children && removeFromChildren(n.children)) return true;
                            }
                            return false;
                        };
                        if (removeFromChildren(p.blocks)) return;
                    }
                }
            } else {
                console.warn(`[MockLogseq] removeBlock: Block not found ${uuid}`);
            }
        },
        removeBlockProperty: async (uuid, propName) => {
            console.log(`[MockLogseq] removeBlockProperty: ${uuid}, ${propName}`);
            const state = blockState.value;
            const block = state[uuid];
            if (block && block.content) {
                // Naive strip
                const lines = block.content.split('\n');
                const newLines = lines.filter(l => !l.includes(propName));
                block.content = newLines.join('\n');
            }
            if (block && block.properties) {
                delete block.properties[propName];
            }
        },
        upsertBlockProperty: async (uuid, propName, propValue) => {
            console.log(`[MockLogseq] upsertBlockProperty: ${uuid}, ${propName} = ${propValue}`);
            const state = blockState.value;
            const block = state[uuid];
            if (block) {
                if (!block.properties) block.properties = {};
                // Normalize key to camelCase unless it's a logseq-doc-agent key
                let normKey = propName;
                if (!propName.startsWith('logseq-doc-agent')) {
                    const normalize = (k) => k.split('.').map(part => part.replace(/-./g, x => x[1].toUpperCase())).join('.');
                    normKey = normalize(propName);
                }
                block.properties[normKey] = propValue;
                // Also update content to include property line so it persists in text if possible?
                // Sim usually parses from text, so updating property object is temporary unless text changes.
                // But for pure mock API testing, object update is enough.
            } else {
                console.warn(`[MockLogseq] upsertBlockProperty: Block not found ${uuid}`);
            }
        },
        /**
         * Custom Listener for Simulation
         */
        onBlockSelected: (callback) => {
            console.log('[MockLogseq] onBlockSelected registered');
            logseq.Editor._onBlockSelectedCallbacks = logseq.Editor._onBlockSelectedCallbacks || [];
            logseq.Editor._onBlockSelectedCallbacks.push(callback);
            return () => {
                const idx = logseq.Editor._onBlockSelectedCallbacks.indexOf(callback);
                if (idx > -1) logseq.Editor._onBlockSelectedCallbacks.splice(idx, 1);
            };
        }
    },
    DB: {
        q: async (query) => {
            console.log(`[MockLogseq] DB.q query: ${query}`);
            // Simple mock: if query is (property :propname), filter blocks having that property
            const propMatch = query.match(/\(property :([\w-.]+)\)/);
            if (propMatch) {
                const propName = propMatch[1];
                const results = [];
                // access internal block state from logseq-sim-lib
                const state = blockState.value;
                for (const uuid in state) {
                    const block = state[uuid];
                    // logseq properties are usually camelCased or kept as is? 
                    // In simulation they are stored as parsing result.
                    // The simulation parser stores properties in `properties` object.
                    // keys might be lowercase.
                    if (block.properties && block.properties[propName]) {
                        results.push({
                            uuid: block.uuid,
                            content: block.content,
                            properties: block.properties,
                            // Add other fields as expected by BlockEntity
                        });
                    }
                }
                return results;
            }

            return [];
        },
        onChanged: (callback) => {
            console.log('[MockLogseq] DB.onChanged registered');
            // We could potentially store the callback to trigger DB changes manually
            // logseq.DB._onChangedCallback = callback;
            return () => {
                console.log('[MockLogseq] DB.onChanged unsubscribed');
            };
        },
    },
    UI: {
        showMsg: async (message, type) => {
            console.log(`[MockLogseq] showMsg: [${type}] ${message}`);

            let container = document.getElementById('logseq-mock-toasts');
            if (!container) {
                container = document.createElement('div');
                container.id = 'logseq-mock-toasts';
                container.style.position = 'fixed';
                container.style.top = '20px';
                container.style.left = '20px';
                container.style.display = 'flex';
                container.style.flexDirection = 'column';
                container.style.gap = '10px';
                container.style.zIndex = '10000';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `logseq-toast type-${type || 'info'}`;
            toast.innerText = message;

            // Base styles for toast
            toast.style.padding = '12px 16px';
            toast.style.borderRadius = '4px';
            toast.style.background = 'var(--ls-bg-color, #fff)';
            toast.style.color = 'var(--ls-primary-text-color, #333)';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            toast.style.borderLeft = `4px solid ${type === 'error' ? 'red' : type === 'warning' ? 'orange' : 'green'}`;
            toast.style.minWidth = '200px';
            toast.style.maxWidth = '400px';
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s ease';

            container.appendChild(toast);

            // Animate in
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            // Disappear after 10 seconds
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                setTimeout(() => {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 300);
            }, 10000);
        }
    },
    beforeunload: (callback) => {
        console.log(`[MockLogseq] beforeunload registered`);
        // We could store it to call on window unload if we wanted to be fancy
        logseq._beforeunloadCallback = callback;
    },
    provideModel: (model) => {
        console.log(`[MockLogseq] provideModel`, model);
        logseq._model = model;
    },
    ready: (callback) => {
        console.log(`[MockLogseq] ready() called`);
        if (callback) {
            // Execute callback immediately for simulation
            setTimeout(() => {
                console.log(`[MockLogseq] Executing plugin main...`);
                callback({});
            }, 100);
        }
        return Promise.resolve();
    },
    useSettingsSchema: (schema) => {
        console.log(`[MockLogseq] useSettingsSchema:`, schema);
        logseq._settingsSchema = schema;
    },
    onSettingsChanged: (callback) => {
        console.log(`[MockLogseq] onSettingsChanged registered`);
        logseq._onSettingsChangedCallback = callback;
    },
    updateSettings: (newSettingsParts) => {
        const oldSettings = { ...logseq.settings };
        const newSettings = { ...logseq.settings, ...newSettingsParts };
        logseq.settings = newSettings;
        console.log(`[MockLogseq] updateSettings:`, newSettings);
        if (logseq._onSettingsChangedCallback) {
            logseq._onSettingsChangedCallback(newSettings, oldSettings);
        }
    },
    settings: {}, // Mock settings object
    baseInfo: {
        id: 'logseq-doc-agent',
        name: 'Logseq Doc Agent',
        description: 'Mocked description',
        version: '0.0.1'
    },
    // Simulation state for pages (chatlogs, storage, etc.)
    _pages: [
        {
            name: 'logseq-doc-agent/chatlogs/Mock Chat 1',
            originalName: 'logseq-doc-agent/chatlogs/Mock Chat 1',
            createdAt: new Date(Date.now() - 86400000).getTime(), // 1 day ago
            updatedAt: new Date(Date.now() - 3600000).getTime(), // 1 hour ago
            properties: {
                'lda.chatlog.id': 'mock-chat-1',
                'lda.chatlog.model': 'gpt-4',
                'lda.chatlog.provider': 'openai',
            },
            blocks: [
                { uuid: 'b1', content: 'lda.chatlog.role:: user\nlda.chatlog.timestamp:: ...\nHello' },
                { uuid: 'b2', content: 'lda.chatlog.role:: assistant\nlda.chatlog.timestamp:: ...\nHi there!' },
                {
                    uuid: 'b_tool',
                    content: `lda.chatlog.role:: assistant\nlda.chatlog.timestamp:: ...\nlda.chatlog.parts:: [{"type":"tool_call","toolName":"simulatedTool","toolArgs":{"query":"test"},"toolCallId":"call_1","isCollapsed":true},{"type":"tool_result","toolCallId":"call_1","toolResult":"Tool output here"}]\nThinking...`
                }
            ]
        },
        {
            name: 'logseq-doc-agent/chatlogs/Mock Chat 2',
            originalName: 'logseq-doc-agent/chatlogs/Mock Chat 2',
            createdAt: new Date(Date.now() - 172800000).getTime(), // 2 days ago
            updatedAt: new Date(Date.now() - 86400000).getTime(), // 1 day ago
            properties: {
                'lda.chatlog.id': 'mock-chat-2',
                'lda.chatlog.model': 'claude-3-sonnet',
                'lda.chatlog.provider': 'anthropic',
            },
            blocks: [
                { uuid: 'b3', content: 'role:: user\ntimestamp:: ...\nTest' },
                { uuid: 'b4', content: 'role:: assistant\ntimestamp:: ...\nWorking.' }
            ]
        }
    ]
};

// extend Editor
logseq.Editor.createPage = async (name, properties, options) => {
    console.log(`[MockLogseq] createPage: ${name}`, properties);
    const existing = logseq._pages.find(p => p.name === name || p.originalName === name);
    if (existing) {
        return existing;
    }

    const newPage = {
        name: name,
        originalName: name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        properties: properties || {},
        blocks: []
    };
    logseq._pages.push(newPage);

    return newPage;
};

logseq.Editor.renamePage = async (oldName, newName) => {
    console.log(`[MockLogseq] renamePage: ${oldName} -> ${newName}`);
    const page = logseq._pages.find(p => p.name === oldName || p.originalName === oldName);
    if (page) {
        page.name = newName;
        page.originalName = newName;
        page.updatedAt = Date.now();
        return page;
    } else {
        console.warn(`[MockLogseq] renamePage: Page not found ${oldName}`);
    }
};

logseq.Editor.deletePage = async (name) => {
    console.log(`[MockLogseq] deletePage: ${name}`);
    const index = logseq._pages.findIndex(p => p.name === name || p.originalName === name);
    if (index !== -1) {
        logseq._pages.splice(index, 1);
        console.log(`[MockLogseq] Deleted page: ${name}`);
    } else {
        console.warn(`[MockLogseq] deletePage: Page not found ${name}`);
    }
};

logseq.Editor.getPage = async (name) => {
    // Check _pages first
    const page = logseq._pages.find(p => p.name === name || p.originalName === name);
    if (page) {
        return {
            name: page.name,
            originalName: page.originalName,
            createdAt: page.createdAt,
            updatedAt: page.updatedAt,
            properties: page.properties,
            uuid: 'mock-page-uuid-' + (page.properties['lda.chatlog.id'] || Math.random().toString(36).substr(2, 5))
        };
    }
    return null;
};

logseq.Editor.getPageBlocksTree = async (name) => {
    // If the requested page matches the current simulation page title, return the live blocks
    // Note: getBlocks returns the root blocks from logseq-sim-lib
    const currentTitle = document.querySelector('.page-title')?.innerText;

    // Check if name matches current page name, or current page UUID, or specific test page
    // Also default to live blocks if name is null (current page)
    const isCurrentPage = !name || name === currentTitle || name === 'Embracing Imperfection Guide' || name === 'page-uuid-123' || name === 'start-page';

    // Helper to map internal sim nodes to BlockEntity and stringify properties
    const mapNode = (node) => {
        const props = node.properties || {};
        const stringifiedProps = {};
        for (const k in props) {
            const val = props[k];
            // Logseq returns complex properties as JSON strings usually
            stringifiedProps[k] = typeof val === 'object' ? JSON.stringify(val) : val;
        }

        return {
            uuid: node.uuid,
            content: node.content,
            properties: stringifiedProps,
            children: node.children ? node.children.map(mapNode) : []
        };
    };

    if (isCurrentPage) {
        const blocks = getBlocks();
        return blocks.map(mapNode);
    }

    // Fallback to the mocked _pages if defined
    const page = logseq._pages.find(p => p.name === name || p.originalName === name || p.uuid === name);
    if (page && page.blocks) {
        // Return simulated blocks
        return page.blocks.map(b => ({
            uuid: b.uuid,
            content: b.content,
            properties: b.properties || {}, // Properties here should already be strings if mocked manually
            children: []
        }));
    }

    // If still not found, and we are in Sim, maybe just return live blocks as fallback?
    // This helps when the plugin asks for a page by UUID that we don't know but is likely the current one.
    console.warn(`[MockLogseq] getPageBlocksTree: Page "${name}" not found. Returning attributes of current page.`);
    const blocks = getBlocks();
    return blocks.map(mapNode);
};

logseq.Editor.getCurrentPageBlocksTree = () => logseq.Editor.getPageBlocksTree();

// extend Editor.appendBlockInPage to update our mock pages
const originalAppendBlock = logseq.Editor.appendBlockInPage;
logseq.Editor.appendBlockInPage = async (pageId, content) => {
    // Try to find in _pages
    const page = logseq._pages.find(p => p.name === pageId || p.originalName === pageId || p.uuid === pageId);
    if (page) {
        const newBlock = {
            uuid: 'mock-block-' + Math.random().toString(36).substr(2, 5),
            content: content
        };
        if (!page.blocks) page.blocks = [];
        page.blocks.push(newBlock);
        console.log(`[MockLogseq] Appended block to mock page ${page.name}:`, content);
        return newBlock;
    }
    return originalAppendBlock(pageId, content);
};

// Update DB.q to support chatlog queries
const originalQ = logseq.DB.q;
logseq.DB.q = async (query) => {
    console.log(`[MockLogseq] DB.q query: ${query}`);

    // Merge property query support
    if (query.includes('logseq-doc-agent.merge') || query.includes('logseqDocAgent.merge')) {
        console.log('[MockLogseq] Matched merge query');
        const blocks = getBlocks();
        const results = [];

        const traverse = (nodes) => {
            for (const node of nodes) {
                const props = node.properties || {};
                if (props['logseq-doc-agent.merge'] || props['logseqDocAgent.merge']) {
                    // Stringify properties to match expected API behavior
                    const stringifiedProps = {};
                    for (const k in props) {
                        const val = props[k];
                        stringifiedProps[k] = typeof val === 'object' ? JSON.stringify(val) : val;
                    }
                    results.push({
                        uuid: node.uuid,
                        content: node.content,
                        properties: stringifiedProps
                    });
                }
                if (node.children) traverse(node.children);
            }
        };
        traverse(blocks);
        return results;
    }

    // Agent property query: (property logseq-doc-agent.agent)
    if (query.includes('logseq-doc-agent.agent')) {
        console.log('[MockLogseq] Matched agent query');
        // Return mock agent blocks (these are also stored in _agentBlocks for getBlock lookup)
        if (!logseq._agentBlocks) {
            logseq._agentBlocks = {
                'agent-block-1': {
                    uuid: 'agent-block-1',
                    id: 9001,
                    content: `logseq-doc-agent.agent:: Default Agent
logseq-doc-agent.agent.tools:: *
logseq-doc-agent.agent.default:: true
logseq-doc-agent.agent.description:: Default assistant with full tools`,
                    properties: {
                        'logseqDocAgent.agent': 'Default Agent',
                        'logseqDocAgent.agent.tools': '*',
                        'logseqDocAgent.agent.default': 'true',
                        'logseqDocAgent.agent.description': 'Default assistant with full tools'
                    },
                    page: { name: 'logseq-doc-agent/agents', 'original-name': 'logseq-doc-agent/agents' },
                    children: [
                        {
                            uuid: 'agent-block-1-child-1',
                            content: 'You are a helpful AI assistant for Logseq. Help users research, write, and manage notes.',
                            properties: {},
                            children: []
                        }
                    ]
                },
                'agent-block-2': {
                    uuid: 'agent-block-2',
                    id: 9002,
                    content: `logseq-doc-agent.agent:: Research Assistant
logseq-doc-agent.agent.tools:: readonly
logseq-doc-agent.agent.description:: Read-only research mode`,
                    properties: {
                        'logseqDocAgent.agent': 'Research Assistant',
                        'logseqDocAgent.agent.tools': 'readonly',
                        'logseqDocAgent.agent.description': 'Read-only research mode',
                    },
                    page: { name: 'logseq-doc-agent/agents', 'original-name': 'logseq-doc-agent/agents' },
                    children: [
                        {
                            uuid: 'agent-block-2-child-1',
                            content: 'You are a research assistant. You can read documents but cannot modify them. Focus on analysis and summarization.',
                            properties: {},
                            children: []
                        }
                    ]
                },
                'agent-block-3': {
                    uuid: 'agent-block-3',
                    id: 9003,
                    content: `logseq-doc-agent.agent:: Writer
logseq-doc-agent.agent.tools:: getLogseqDocument, addBlock
logseq-doc-agent.agent.description:: Writing assistance`,
                    properties: {
                        'logseqDocAgent.agent': 'Writer',
                        'logseqDocAgent.agent.tools': 'getLogseqDocument, addBlock',
                        'logseqDocAgent.agent.description': 'Writing assistance'
                    },
                    page: { name: 'My Agents', 'original-name': 'My Agents' },
                    children: [
                        {
                            uuid: 'agent-block-3-child-1',
                            content: 'You are a writing assistant. Help users draft and add content to their notes. You can read documents and add new blocks.',
                            properties: {},
                            children: []
                        }
                    ]
                }
            };
        }
        return Object.values(logseq._agentBlocks);
    }

    // Chatlog ID property query
    // Matches (property :lda.chatlog.id) OR (property :lda.chatlog.id "value")
    const idPropMatch = query.match(/\(property :lda\.chatlog\.id\s*"?([^"]*)"?\)/);

    if (query.includes(':lda.chatlog.id')) {
        const specificId = idPropMatch ? idPropMatch[1] : null; // capture group 1 might be undefined if just checking existence

        let results = logseq._pages;

        // If specific ID requested
        if (specificId && specificId.trim() !== '') {
            results = results.filter(c => c.properties['lda.chatlog.id'] === specificId);
        }

        return results.map(c => ({
            name: c.name,
            originalName: c.originalName,
            'original-name': c.originalName,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            properties: c.properties,
            uuid: 'mock-page-uuid-' + c.properties['lda.chatlog.id']
        }));
    }

    return originalQ(query);
};

// Make it available globally as expected by plugins
// Make it available globally and PREVENT OVERWRITE by bundled SDK
// This is crucial because dist/main.js bundles the SDK which tries to set window.logseq
Object.defineProperty(window, 'logseq', {
    get: () => logseq,
    set: (val) => {
        console.warn('[MockLogseq] Blocked attempt to overwrite window.logseq by bundled SDK', val);
    },
    configurable: false
});

// Update registerUIItem to render visually
logseq.App.registerUIItem = (location, config) => {
    console.log(`[MockLogseq] registerUIItem: ${location}`, config);

    const tryInject = (retries = 20) => {
        let container = null;
        if (location === 'pagebar') {
            container = document.getElementById('sim-pagebar');
        } else if (location === 'toolbar') {
            container = document.getElementById('sim-toolbar');
        }

        if (container) {
            const btnContainer = document.createElement('div');
            btnContainer.innerHTML = config.template;
            const btn = btnContainer.firstElementChild;
            if (btn && btn.getAttribute('data-on-click')) {
                const handlerName = btn.getAttribute('data-on-click');
                btn.onclick = () => {
                    console.log(`[MockLogseq] Clicked UI item invoking: ${handlerName}`);
                    if (logseq._model && logseq._model[handlerName]) {
                        logseq._model[handlerName]();
                    } else {
                        console.warn(`[MockLogseq] Model function ${handlerName} not found`);
                    }
                };
            }
            container.appendChild(btnContainer);
            console.log(`[MockLogseq] Injected item into ${location}`);
        } else {
            console.log(`[MockLogseq] Container for ${location} not found, retrying... (${retries})`);
            if (retries > 0) {
                setTimeout(() => tryInject(retries - 1), 100);
            } else {
                console.warn(`[MockLogseq] Failed to find container for ${location} after retries.`);
            }
        }
    };

    tryInject();
};

// Store model for event handlers
logseq.provideModel = (model) => {
    console.log(`[MockLogseq] provideModel received`, model);
    logseq._model = { ...logseq._model, ...model };
};

// --- Signal Effect for Selection ---
effect(() => {
    const uuid = selectedBlockUuid.value;
    if (uuid && logseq.Editor._onBlockSelectedCallbacks) {
        // Fetch full block details via getBlock to simulate realistic async fetch
        logseq.Editor.getBlock(uuid).then(block => {
            if (block) {
                logseq.Editor._onBlockSelectedCallbacks.forEach(cb => cb(block));
            }
        });
    }
});
