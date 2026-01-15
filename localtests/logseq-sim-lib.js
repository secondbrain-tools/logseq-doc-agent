import { h, render } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import { signal, computed, effect } from 'https://esm.sh/@preact/signals@1.2.2';
import { html } from 'https://esm.sh/htm@3.1.1/preact';

// --- State Management ---
export const theme = signal('dark');
export const sourceText = signal('');
export const showEditor = signal(false);

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

export function parseOrg(text) {
    const lines = text.split('\n');
    const roots = [];
    const stack = []; // { indent, node }

    lines.forEach((line) => {
        if (!line.trim()) return;

        // Combined regex for:
        // 1. Standard Org headers: * Header, ** Header (at start of line)
        // 2. Indented bullets:   * Item,   - Item
        const match = line.match(/^(\s*)(\*+|-)\s+(.*)/);

        let level = 0;
        let content = "";
        let isBlock = false;

        if (match) {
            const indentStr = match[1];
            const bullet = match[2];
            const text = match[3];

            if (bullet === '-') {
                // Dash is always indentation based
                level = Math.floor(indentStr.length / 2);
            } else {
                // Star(s)
                if (indentStr.length === 0) {
                    // No indent -> Standard Org Header (* is level 0, ** is level 1)
                    level = bullet.length - 1;
                } else {
                    // Indented -> Treat as listed item
                    level = Math.floor(indentStr.length / 2);
                }
            }
            content = text;
            isBlock = true;
        }

        if (isBlock) {
            const node = {
                id: Math.random().toString(36).substr(2, 9),
                content: content,
                rawLines: [], // for properties
                children: [],
                properties: {},
                level: level,
                collapsed: signal(false)
            };

            // Find parent
            // If level is 0, stack should be empty or we pop until empty?
            // Actually, if we have level 0, we pop everything.
            // If level > stack.level, we push.
            // If level <= stack.level, we pop until we find a parent with level < current level.

            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            if (stack.length === 0) {
                roots.push(node);
            } else {
                // Parent is now at top of stack
                stack[stack.length - 1].node.children.push(node);
            }
            stack.push({ level, node });

        } else {
            // Continuation line or property
            if (stack.length > 0) {
                const lastNode = stack[stack.length - 1].node;
                lastNode.rawLines.push(line);
            } else {
                // Orphan text? 
                // If it's a property block at start of file? Ignore or console.warn
            }
        }
    });

    // Post-process for properties
    const processNode = (node) => {
        const { props, rest } = parseProperties(node.rawLines);
        node.properties = props;
        // Append rest to content if any? Usually simple multiline content isn't handled this way in logseq 
        // (it's new blocks), but let's assume rawLines are just properties for now.
        // Text after properties in a block is usually not standard Logseq unless Soft Line Break.
        if (rest.length > 0) {
            node.content += '\n' + rest.join('\n');
        }
        node.children.forEach(processNode);
    };
    roots.forEach(processNode);

    return roots;
}

export const blocks = computed(() => parseOrg(sourceText.value));

export const getBlocks = () => blocks.value;

// --- Components ---

const BlockProperties = ({ properties }) => {
    const entries = Object.entries(properties);
    if (entries.length === 0) return null;

    return html`
    <div class="block-properties">
        ${entries.map(([key, value]) => html`
            <div class="block-properties-row">
                <span class="block-properties-name">${key}:</span>
                <span class="block-properties-value">${value}</span>
            </div>
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
         data-block-id="${node.id}"
         data-refs="${JSON.stringify(Object.keys(node.properties))}">
        
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

const ThemeSwitcher = () => html`
<button class="theme-switcher" onClick=${toggleTheme}>
    ${theme.value === 'dark' ? '☀️ Light' : '🌙 Dark'}
</button>
`;

const App = () => {
    return html`
    <${ThemeSwitcher} />
    <div class="page">
        <h1 style="margin-bottom: 2rem;">Logseq Simulation</h1>
        
        <div id="editor-toggle" onClick=${() => showEditor.value = !showEditor.value}>
            ${showEditor.value ? 'Hide Source' : 'Edit Source'}
        </div>
        ${showEditor.value && html`
            <textarea id="source-input" 
                      style="display:block" 
                      value=${sourceText} 
                      onInput=${e => sourceText.value = e.target.value}></textarea>
        `}
        
        <div style="margin-top: 20px;">
            ${blocks.value.map(root => html`<${Block} node=${root} />`)}
        </div>
    </div>
`;
};

export function mountApp(elementId, initialContent) {
    if (initialContent) {
        sourceText.value = initialContent;
    }
    render(html`<${App} />`, document.getElementById(elementId));
}
