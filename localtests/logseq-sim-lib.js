import { h, render } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { signal, computed, effect } from 'https://esm.sh/@preact/signals@1.2.2';
import { html } from 'https://esm.sh/htm@3.1.1/preact';

// --- State Management ---
export const theme = signal('dark');
export const sourceText = signal('');
export const showEditor = signal(false);
// Map of uuid -> block node
export const blockState = signal({});

effect(() => {
    document.documentElement.setAttribute('data-theme', theme.value);
});

export const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
};

// --- Parser Logic ---

function parseProperties(lines) {
    const props = {};
    const rest = [];
    const propRegex = /^\s*([^:]+)::\s*(.+)$/;

    let parsingProps = true;
    for (const line of lines) {
        if (parsingProps) {
            const match = line.match(propRegex);
            if (match) {
                props[match[1].trim()] = match[2].trim();
            } else {
                parsingProps = false;
                rest.push(line);
            }
        } else {
            rest.push(line);
        }
    }
    return { props, rest };
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function parseOrg(text) {
    const allLines = text.split('\n');
    if (allLines.length === 0) return { title: '', roots: [] };

    // Extract Title (First Line)
    const title = allLines[0].trim();
    const lines = allLines.slice(1);

    const roots = [];
    const stack = []; // { level, node }
    const newBlockState = {};

    lines.forEach((line) => {
        if (!line.trim()) return;

        // Combined regex for:
        // 1. Standard Org headers: * Header, ** Header (at start of line)
        // 2. Indented bullets:   * Item,   - Item
        const match = line.match(/^(\s*)(\*+|-)\s+(.*)/);

        let levelIdx = 0; // Internal level index for hierarchy building
        let content = "";
        let isBlock = false;

        if (match) {
            const indentStr = match[1];
            const bullet = match[2];
            const textMatch = match[3];

            if (bullet === '-') {
                // Dash is always indentation based
                levelIdx = Math.floor(indentStr.length / 2);
            } else {
                // Star(s)
                if (indentStr.length === 0) {
                    // No indent -> Standard Org Header (* is level 0, ** is level 1)
                    levelIdx = bullet.length - 1;
                } else {
                    // Indented -> Treat as listed item
                    levelIdx = Math.floor(indentStr.length / 2);
                }
            }
            content = textMatch;
            isBlock = true;
        }

        if (isBlock) {
            const node = {
                // Temporary ID until properties are parsed, or final if no ID prop
                uuid: null,
                content: content,
                rawLines: [], // for properties
                children: [],
                properties: {},
                level: 1, // Will be set correctly after hierarchy
                collapsed: signal(false)
            };

            // Maintain hierarchy strictly based on visual levelIdx
            while (stack.length > 0 && stack[stack.length - 1].levelIdx >= levelIdx) {
                stack.pop();
            }

            if (stack.length === 0) {
                // Top level block
                node.level = 1;
                roots.push(node);
            } else {
                // Child block
                const parent = stack[stack.length - 1].node;
                node.level = parent.level + 1;
                parent.children.push(node);
            }
            stack.push({ levelIdx, node });

        } else {
            // Continuation line or property
            if (stack.length > 0) {
                const lastNode = stack[stack.length - 1].node;
                lastNode.rawLines.push(line);
            }
        }
    });

    // Post-process: Parse properties, Assign UUIDs, Populate State
    const processNode = (node) => {
        const { props, rest } = parseProperties(node.rawLines);
        node.properties = props;

        // Check for ID property, else generate
        if (node.properties.id) {
            node.uuid = node.properties.id;
        } else {
            node.uuid = generateUUID();
        }

        // Add to state
        newBlockState[node.uuid] = node;

        if (rest.length > 0) {
            node.content += '\n' + rest.join('\n');
        }
        node.children.forEach(processNode);
    };
    roots.forEach(processNode);

    // Update global signal using a side-effect (not ideal in pure computed, but practical here)
    // We defer this update to avoid side-effects during computation if possible, 
    // but since 'blocks' is widely used, we'll expose blockState via a separate action or just update it here.
    // However, computing derived state in a computed is fine as long as we don't cause loops.
    // We will update a separate signal in an effect in the component or just let consumers read the latest map from here.
    // Ideally `blocks` returns the whole structure including the map.

    return { title, roots, blockMap: newBlockState };
}

export const parsedData = computed(() => parseOrg(sourceText.value));
export const blocks = computed(() => parsedData.value.roots);
export const pageTitle = computed(() => parsedData.value.title);

// Update global block state whenever parsing finishes
effect(() => {
    blockState.value = parsedData.value.blockMap;
});

export const getBlocks = () => blocks.value;


// --- Components ---

const PropertyRow = ({ name, value }) => {
    const isLong = value && value.length > 20;
    const [collapsed, setCollapsed] = useState(isLong);

    const toggle = (e) => {
        if (isLong) {
            e.stopPropagation();
            setCollapsed(!collapsed);
        }
    };

    const displayValue = (isLong && collapsed) ? value.substring(0, 20) + '...' : value;

    return html`
    <div class="block-properties-row" onClick=${toggle} style=${isLong ? 'cursor: pointer;' : ''}>
        <span class="block-properties-name">${name}:</span>
        <span class="block-properties-value">
            ${displayValue}
            ${isLong ? html`<span style="opacity: 0.5; margin-left: 5px; font-size: 0.8em;">${collapsed ? '(more)' : '(less)'}</span>` : ''}
        </span>
    </div>
    `;
};

const BlockProperties = ({ properties }) => {
    const entries = Object.entries(properties);
    if (entries.length === 0) return null;

    return html`
    <div class="block-properties">
        ${entries.map(([key, value]) => html`
            <${PropertyRow} name=${key} value=${value} />
        `)}
    </div>
`;
};

const formatContent = (text) => {
    // Simple formatter for [[Links]] and **Bold**
    // Returns an array of strings and vnodes
    if (!text) return null;

    const parts = [];
    let lastLastIndex = 0;

    // Regex for [[Link]] or **Bold**
    const regex = /(\[\[.*?\]\])|(\*\*.*?\*\*)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastLastIndex) {
            parts.push(text.substring(lastLastIndex, match.index));
        }

        if (match[1]) { // Link
            const linkText = match[1].slice(2, -2);
            parts.push(html`<a class="page-ref" href="#">${linkText}</a>`);
        } else if (match[2]) { // Bold
            const boldText = match[2].slice(2, -2);
            parts.push(html`<strong>${boldText}</strong>`);
        }

        lastLastIndex = regex.lastIndex;
    }

    if (lastLastIndex < text.length) {
        parts.push(text.substring(lastLastIndex));
    }

    return parts;
};

const Block = ({ node }) => {
    // Use local state for collapsing to ensure re-render on click
    // Initialize from node property if exists, else default false (expanded)
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggle = (e) => {
        e.stopPropagation();
        if (node.children.length > 0) {
            setIsCollapsed(!isCollapsed);
        }
    };

    // Icon for Arrow (Simple triangle >)
    // Default SVG points Right.
    // User Request for Customization:
    // Collapsed -> Down (rotate(90deg))
    // Open [Expanded] -> Right (rotate(0deg))

    const ToggleArrow = () => html`
        <div class="arrow" onClick=${toggle}>
            <svg viewBox="0 0 20 20" style="transform: ${isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)'}">
                <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
            </svg>
        </div>
    `;

    return html`
    <div class="ls-block ${isCollapsed ? 'is-collapsed' : ''}" 
         id="ls-block-${node.uuid}"
         blockid="${node.uuid}"
         level="${node.level}"
         data-refs-self="${JSON.stringify(Object.keys(node.properties))}">
        
        <div class="block-main-container">
            <div class="block-control-wrap">
                ${node.children.length > 0 && html`<${ToggleArrow} />`}
                <div class="bullet-container" onClick=${toggle}>
                     <div class="bullet"></div>
                </div>
            </div>
            
            <div class="block-content-wrapper">
                <div class="block-content-inner">
                    ${formatContent(node.content)}
                </div>
                <${BlockProperties} properties=${node.properties} />
            </div>
        </div>

        ${node.children.length > 0 && html`
            <div class="block-children-container">
                ${node.children.map(child => html`<${Block} node=${child} />`)}
            </div>
        `}
    </div>
`;
};

const ThemeSwitcher = () => {
    // We can just read the value, App re-renders when theme changes because App subscribes to it.
    // Or we can subscribe locally too if we want independent re-renders.
    // For simplicity, let's just use the global signal value, relying on App's re-render or click handler.
    // Actually, to be safe, let's subscribe.
    const [currentTheme, setCurrentTheme] = useState(theme.value);
    useEffect(() => effect(() => setCurrentTheme(theme.value)), []);

    return html`
    <button class="theme-switcher" onClick=${toggleTheme}>
        ${currentTheme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
    `;
};

const App = () => {
    // Local state for UI toggles (more robust than global signals here)
    const [isEditorVisible, setEditorVisible] = useState(false);

    // Subscribe to the global 'blocks' computed signal
    const [currentBlocks, setCurrentBlocks] = useState(blocks.value);

    // Subscribe to theme to re-render button text
    const [currentTheme, setCurrentTheme] = useState(theme.value);

    const [currentTitle, setCurrentTitle] = useState(pageTitle.value);

    // Effect to track signals manually (avoids Preact instance mismatch issues with automatic signal tracking)
    useEffect(() => {
        const disposeBlocks = effect(() => setCurrentBlocks(blocks.value));
        const disposeTheme = effect(() => setCurrentTheme(theme.value));
        const disposeTitle = effect(() => setCurrentTitle(pageTitle.value));
        return () => {
            disposeBlocks();
            disposeTheme();
            disposeTitle();
        };
    }, []);

    return html`
    <div class="sim-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border-color, #ccc);">
        <div class="header-left">
             <${ThemeSwitcher} />
        </div>
        <div id="sim-pagebar" style="display: flex; gap: 10px; align-items: center;">
            <!-- Icons injected here -->
        </div>
    </div>
    <div class="page">
        <h1 class="page-title" style="margin-bottom: 2rem;">${currentTitle}</h1>
        
        <div id="editor-toggle" onClick=${() => setEditorVisible(!isEditorVisible)}>
            ${isEditorVisible ? 'Hide Source' : 'Edit Source'}
        </div>
        ${isEditorVisible && html`
            <textarea id="source-input" 
                      style="display:block" 
                      value=${sourceText} 
                      onInput=${e => sourceText.value = e.target.value}></textarea>
        `}
        
        <div style="margin-top: 20px;">
            ${currentBlocks.map(root => html`<${Block} node=${root} />`)}
        </div>
    </div>
`;
};

export function mountApp(elementId, initialContent) {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Clear existing content (e.g., "Loading...")
    el.innerHTML = '';

    if (initialContent) {
        sourceText.value = initialContent;
    }
    render(html`<${App} />`, el);
}
