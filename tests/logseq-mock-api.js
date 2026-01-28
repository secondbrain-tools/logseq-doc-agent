import { getBlocks, blockState, registerContextMenuItem } from './logseq-sim-lib.js';

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
        },
        openRightSidebar: () => {
            console.log('[MockLogseq] openRightSidebar');
            window.dispatchEvent(new CustomEvent('logseq:open-sidebar'));
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
            registerContextMenuItem({ label: name, callback });
        },
        getBlock: async (uuid, opts) => {
            // console.log(`[MockLogseq] getBlock: ${uuid}`, opts);
            const state = blockState.value;
            const block = state[uuid];

            if (block) {
                // Return a simplified BlockEntity structure
                const result = {
                    uuid: block.uuid,
                    content: block.content,
                    properties: block.properties,
                    children: [] // Default empty
                };

                // Simple child fetching if requested
                if (opts && opts.includeChildren && block.children && block.children.length > 0) {
                    // In the sim signal structure, `children` are fully nested objects (from parseOrg).
                    // But `blockState` is flat map.
                    // The `block` object in `blockState` implies it HAS `children` array of nodes?
                    // Let's check `logseq-sim-lib.js`:
                    //  `newBlockState[node.uuid] = node;`
                    //  `node` has `children: []` which contains CHILD NODES (objects).
                    // So we can just map them recursively?
                    // BUT, strictly, `getBlock` returns `children` as mixed based on depth loading.
                    // For Sim, let's just return the nested structure since it's already in memory.

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
        removeBlockProperty: async (uuid, propName) => {
            console.log(`[MockLogseq] removeBlockProperty: ${uuid}, ${propName}`);
            // Mock removing property
            // Just update content to remove the property line?
            // Since we don't have perfect source text mapping, let's just ignore or clean content in memory.
            // We can strip it from `block.content` if present.
            const state = blockState.value;
            const block = state[uuid];
            if (block && block.content) {
                // Naive strip
                const lines = block.content.split('\n');
                const newLines = lines.filter(l => !l.includes(propName));
                block.content = newLines.join('\n');
            }
        },
    },
    DB: {
        q: async (query) => {
            console.log(`[MockLogseq] DB.q query: ${query}`);
            // Simple mock: if query is (property :propname), filter blocks having that property
            const propMatch = query.match(/\(property :([\w-]+)\)/);
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
    }
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
