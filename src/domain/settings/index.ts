
// Define the interface locally to avoid deep import issues with @logseq/libs
export interface SettingSchemaDesc {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'heading';
    title: string;
    description?: string;
    default?: any;
    enumChoices?: string[];
    enumPicker?: 'radio' | 'select' | 'checkbox';
    inputType?: 'password' | 'text' | 'number';
    [key: string]: any;
}

export interface ModelDefinition {
    label: string;
    value: string;
    defaultEnabled: boolean;
    supportsReasoning?: boolean;
}

export interface ProviderDefinition {
    id: string;
    label: string;
    apiKeySettingKey: string;
    apiKeyLabel: string;
    apiKeyDesc: string;
    models: ModelDefinition[];
}

export const PROVIDERS: ProviderDefinition[] = [
    {
        id: 'openai',
        label: 'OpenAI',
        apiKeySettingKey: 'openaiApiKey',
        apiKeyLabel: 'OpenAI API Key',
        apiKeyDesc: 'Enter your OpenAI API key.',
        models: [
            { label: 'GPT-5.4', value: 'gpt-5.4', defaultEnabled: true, supportsReasoning: true },
            { label: 'GPT-5.3', value: 'gpt-5.3', defaultEnabled: true, supportsReasoning: true },
            { label: 'GPT-5.2', value: 'gpt-5.2', defaultEnabled: true, supportsReasoning: true },
            { label: 'GPT-5.1', value: 'gpt-5.1', defaultEnabled: true, supportsReasoning: true },
            { label: 'GPT-5 Mini', value: 'gpt-5-mini', defaultEnabled: true },
            { label: 'GPT-5 Nano', value: 'gpt-5-nano', defaultEnabled: true },
        ]
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        apiKeySettingKey: 'anthropicApiKey',
        apiKeyLabel: 'Anthropic API Key',
        apiKeyDesc: 'Enter your Anthropic API key.',
        models: [
            { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620', defaultEnabled: true, supportsReasoning: true },
            { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229', defaultEnabled: true, supportsReasoning: true },
            { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229', defaultEnabled: false },
            { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307', defaultEnabled: false },
        ]
    },
    {
        id: 'google',
        label: 'Google',
        apiKeySettingKey: 'googleApiKey',
        apiKeyLabel: 'Google AI API Key',
        apiKeyDesc: 'Enter your Google AI API key.',
        models: [
            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro-latest', defaultEnabled: true },
            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash-latest', defaultEnabled: true },
        ]
    },
    {
        id: 'mistral',
        label: 'Mistral',
        apiKeySettingKey: 'mistralApiKey',
        apiKeyLabel: 'Mistral API Key',
        apiKeyDesc: 'Enter your Mistral API key.',
        models: [
            { label: 'Mistral Large', value: 'mistral-large-latest', defaultEnabled: true },
            { label: 'Mistral Small', value: 'mistral-small-latest', defaultEnabled: true },
        ]
    }
];

// Helper to get all models for backward compatibility or direct access if needed
export const ALL_MODELS = PROVIDERS.flatMap(p => p.models.map(m => ({
    label: `${p.label}: ${m.label}`,
    value: m.value,
    provider: p.id
})));

export const getProviderForModel = (modelValue: string) => {
    for (const provider of PROVIDERS) {
        if (provider.models.find(m => m.value === modelValue)) {
            return provider.id;
        }
    }
    return 'openai'; // Default fallback
};
