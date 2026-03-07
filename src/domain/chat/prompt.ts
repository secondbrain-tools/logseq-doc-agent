export interface ChatPrompt {
    id: string;        // Block UUID
    name: string;      // Prompt name from property
    content: string;   // Block content + children (property lines filtered out)
    pageName: string;  // Page where the prompt lives
    isBase: boolean;   // Whether name === 'base'
}
