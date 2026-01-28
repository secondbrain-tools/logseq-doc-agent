
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

// Helper: Find parent of a node in the tree
function findParent(nodes, childUuid) {
    for (const node of nodes) {
        if (node.children) {
            if (node.children.some(c => c.uuid === childUuid)) {
                return node;
            }
            const found = findParent(node.children, childUuid);
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

        insertBlock: async (targetUuid, content, options) => {
            console.log(`[MockLogseq] insertBlock: target=${targetUuid}`, content, options);
            const state = blockState.value;
            const target = state[targetUuid];
            const roots = getBlocks();

            if (!target) {
                console.warn(`[MockLogseq] insertBlock: Target not found ${targetUuid}`);
                return null;
            }

            const newUuid = 'block-' + Math.random().toString(36).substr(2, 9);
            const newNode = {
                uuid: newUuid,
                content: content,
                properties: {},
                children: [],
                level: target.level + (options?.sibling ? 0 : 1),
                collapsed: { value: false }
            };

            // Add to state
            state[newUuid] = newNode;

            if (options && options.sibling) {
                // Find parent of target
                const parent = findParent(roots, targetUuid);
                const list = parent ? parent.children : roots;
                const index = list.findIndex(n => n.uuid === targetUuid);

                if (options.before) {
                    list.splice(index, 0, newNode);
                } else {
                    list.splice(index + 1, 0, newNode);
                }
            } else {
                // Child
                target.children.push(newNode);
            }

            return newNode;
        },

        removeBlock: async (uuid) => {
            console.log(`[MockLogseq] removeBlock: ${uuid}`);
            const roots = getBlocks();
            const parent = findParent(roots, uuid);
            const list = parent ? parent.children : roots;

            const index = list.findIndex(n => n.uuid === uuid);
            if (index !== -1) {
                list.splice(index, 1);
            }
        },

        moveBlock: async (uuid, targetUuid, options) => {
            console.log(`[MockLogseq] moveBlock: ${uuid} to ${targetUuid}`, options);
            const roots = getBlocks();

            // 1. Find and remove
            const parent = findParent(roots, uuid);
            const list = parent ? parent.children : roots;
            const index = list.findIndex(n => n.uuid === uuid);
            if (index === -1) return;

            const [node] = list.splice(index, 1);

            // 2. Insert at target
            const targetParent = findParent(roots, targetUuid);

            let targetList;
            let insertIndex;

            if (options && options.sibling) {
                // Insert into target's parent list
                // If targetParent is null, target is root -> targetList is roots
                targetList = targetParent ? targetParent.children : roots;
                const targetIndex = targetList.findIndex(n => n.uuid === targetUuid);

                if (options.before) {
                    insertIndex = targetIndex;
                } else {
                    insertIndex = targetIndex + 1;
                }
            } else {
                // Child of target
                const targetNode = blockState.value[targetUuid];
                if (!targetNode) {
                    console.warn("Target for move not found");
                    return;
                }
                targetList = targetNode.children;
                insertIndex = targetList.length;
            }

            targetList.splice(insertIndex, 0, node);
        },

        appendBlockInPage: async (pageId, content) => {
            console.log(`[MockLogseq] appendBlockInPage: ${pageId}`, content);
            const newUuid = 'block-' + Math.random().toString(36).substr(2, 9);
            const newNode = {
                uuid: newUuid,
                content: content,
                properties: {},
                children: [],
                level: 1,
                collapsed: { value: false }
            };
            const roots = getBlocks();
            roots.push(newNode);
            blockState.value[newUuid] = newNode;
            return newNode;
        },

        registerSlashCommand: (name, callback) => {
            console.log(`[MockLogseq] registerSlashCommand: /${name}`);
        },
        registerBlockContextMenuItem: (name, callback) => {
            console.log(`[MockLogseq] registerBlockContextMenuItem: ${name}`);
            registerContextMenuItem({ label: name, callback });
        },
        getBlock: async (uuid, opts) => {
            const state = blockState.value;
            const block = state[uuid];

            if (block) {
                const roots = getBlocks();
                const parent = findParent(roots, uuid);

                const result = {
                    uuid: block.uuid,
                    content: block.content,
                    properties: block.properties,
                    children: [],
                    parent: parent ? { id: parent.uuid, uuid: parent.uuid } : null,
                };

                const list = parent ? parent.children : roots;
                const index = list.findIndex(n => n.uuid === uuid);
                if (index > 0) {
                    const prev = list[index - 1];
                    result.left = { id: prev.uuid, uuid: prev.uuid };
                }

                if (opts && opts.includeChildren && block.children && block.children.length > 0) {
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
                block.content = newContent;
                return;
            } else {
                console.warn(`[MockLogseq] updateBlock: Block not found ${uuid}`);
            }
        },
        removeBlockProperty: async (uuid, propName) => {
            console.log(`[MockLogseq] removeBlockProperty: ${uuid}, ${propName}`);
            const state = blockState.value;
            const block = state[uuid];
            if (block && block.content) {
                const lines = block.content.split('\n');
                const newLines = lines.filter(l => !l.includes(propName));
                block.content = newLines.join('\n');
            }
        },
    },
    DB: {
        q: async (query) => {
            console.log(`[MockLogseq] DB.q query: ${query}`);
            const propMatch = query.match(/\(property :([\w-]+)\)/);
            if (propMatch) {
                const propName = propMatch[1];
                const results = [];
                const state = blockState.value;
                for (const uuid in state) {
                    const block = state[uuid];
                    if (block.properties && block.properties[propName]) {
                        results.push({
                            uuid: block.uuid,
                            content: block.content,
                            properties: block.properties,
                            parent: null // simplify
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

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

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
