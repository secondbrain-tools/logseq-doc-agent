import fs from 'fs';

// Mock sim logic
function normalizePropertyKey(key) {
    if (key.startsWith('logseq-doc-agent')) {
        return key;
    }
    const parts = key.split('.');
    const camelize = (str) => {
        return str.replace(/-./g, (x) => x[1].toUpperCase());
    };
    return parts.map(camelize).join('.');
}

function parseProperties(lines) {
    const props = {};
    const rest = [];
    const propRegex = /^\s*([^:]+)::\s*(.+)$/;

    for (const line of lines) {
        const match = line.match(propRegex);
        if (match) {
            const rawKey = match[1].trim();
            const value = match[2].trim();
            const normalizedKey = normalizePropertyKey(rawKey);
            props[normalizedKey] = value;
        } else {
            rest.push(line);
        }
    }
    return { props, rest };
}

const text = fs.readFileSync('tests/prompts.txt', 'utf8');
const allLines = text.split('\n');

allLines.forEach(line => {
    if (line.includes('::')) {
        const parsed = parseProperties([line]);
        console.log("Parsed line:", line);
        console.log("Result:", parsed);
    }
});

const query = "(property logseq-doc-agent.prompt.name)";
const propMatch = query.match(/\(property\s*:?([\w-.]+)\)/);
console.log("Regex match for query:", propMatch ? propMatch[1] : "No match");

