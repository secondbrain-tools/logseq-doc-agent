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
            // console.log(`[MockLogseq] getBlock: ${uuid}`);
            const state = blockState.value;
            const block = state[uuid];

            if (block) {
                // Return a simplified BlockEntity structure
                return {
                    uuid: block.uuid,
                    content: block.content,
                    properties: block.properties,
                    // mock other fields if needed
                };
            } else {
                console.warn(`[MockLogseq] getBlock: Block not found for uuid: ${uuid}`);
            }
            return null;
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
    provideModel: (model) => {
        console.log(`[MockLogseq] provideModel`, model);
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
    if (location === 'pagebar') {
        const pagebar = document.getElementById('sim-pagebar');
        if (pagebar) {
            const btnContainer = document.createElement('div');
            btnContainer.innerHTML = config.template;
            // Attach click handler if data-on-click is present (Logseq style)
            const btn = btnContainer.firstElementChild;
            if (btn && btn.getAttribute('data-on-click')) {
                const handlerName = btn.getAttribute('data-on-click');
                btn.onclick = () => {
                    console.log(`[MockLogseq] Clicked UI item invoking: ${handlerName}`);
                    // Trigger the model function if it exists
                    if (logseq._model && logseq._model[handlerName]) {
                        logseq._model[handlerName]();
                    } else {
                        console.warn(`[MockLogseq] Model function ${handlerName} not found`);
                    }
                };
            }
            pagebar.appendChild(btnContainer);
        }
    }
};

// Store model for event handlers
logseq.provideModel = (model) => {
    console.log(`[MockLogseq] provideModel received`, model);
    logseq._model = model;
};
