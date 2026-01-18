import '@logseq/libs';

// Define the interface locally to avoid deep import issues with @logseq/libs
export interface SettingSchemaDesc {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'heading';
    title: string;
    description?: string;
    default?: any;
    enumChoices?: string[];
    enumPicker?: 'radio' | 'select' | 'checkbox';
    [key: string]: any;
}

export const SUPPORTED_MODELS = [
    // OpenAI
    { label: 'OpenAI: GPT-4o', value: 'gpt-4o', provider: 'openai' },
    { label: 'OpenAI: GPT-4o Mini', value: 'gpt-4o-mini', provider: 'openai' },
    { label: 'OpenAI: GPT-4 Turbo', value: 'gpt-4-turbo', provider: 'openai' },
    { label: 'OpenAI: GPT-3.5 Turbo', value: 'gpt-3.5-turbo', provider: 'openai' },

    // Anthropic
    { label: 'Anthropic: Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620', provider: 'anthropic' },
    { label: 'Anthropic: Claude 3 Opus', value: 'claude-3-opus-20240229', provider: 'anthropic' },
    { label: 'Anthropic: Claude 3 Sonnet', value: 'claude-3-sonnet-20240229', provider: 'anthropic' },
    { label: 'Anthropic: Claude 3 Haiku', value: 'claude-3-haiku-20240307', provider: 'anthropic' },

    // Google
    { label: 'Google: Gemini 1.5 Pro', value: 'gemini-1.5-pro-latest', provider: 'google' },
    { label: 'Google: Gemini 1.5 Flash', value: 'gemini-1.5-flash-latest', provider: 'google' },

    // Mistral
    { label: 'Mistral: Mistral Large', value: 'mistral-large-latest', provider: 'mistral' },
    { label: 'Mistral: Mistral Small', value: 'mistral-small-latest', provider: 'mistral' },
];

const getProviderForModel = (modelValue: string) => {
    const model = SUPPORTED_MODELS.find(m => m.value === modelValue);
    return model?.provider || 'openai'; // Default to openai if not found
};

export const configureSettings = () => {
    const currentSettings = (logseq.settings as any) || {};
    const selectedModel = currentSettings.model || 'gpt-4o';
    const provider = getProviderForModel(selectedModel);

    const settings: SettingSchemaDesc[] = [
        {
            key: 'model',
            type: 'enum',
            title: 'AI Model',
            description: 'Select the AI model to use.',
            default: 'gpt-4o',
            enumChoices: SUPPORTED_MODELS.map(m => m.value),
        }
    ];

    // Add provider-specific settings based on the selected model
    if (provider === 'openai') {
        settings.push({
            key: 'openaiApiKey',
            type: 'string',
            title: 'OpenAI API Key',
            description: 'Enter your OpenAI API key.',
            default: '',
        });
    } else if (provider === 'anthropic') {
        settings.push({
            key: 'anthropicApiKey',
            type: 'string',
            title: 'Anthropic API Key',
            description: 'Enter your Anthropic API key.',
            default: '',
        });
    } else if (provider === 'google') {
        settings.push({
            key: 'googleApiKey',
            type: 'string',
            title: 'Google AI API Key',
            description: 'Enter your Google AI API key.',
            default: '',
        });
    } else if (provider === 'mistral') {
        settings.push({
            key: 'mistralApiKey',
            type: 'string',
            title: 'Mistral API Key',
            description: 'Enter your Mistral API key.',
            default: '',
        });
    }

    logseq.useSettingsSchema(settings as any);
};

export const setupSettings = () => {
    // Initial configuration
    configureSettings();

    // Re-configure when settings change (specifically when model changes)
    logseq.onSettingsChanged((newSettings, oldSettings) => {
        if (newSettings.model !== oldSettings.model) {
            console.log('Model changed from', oldSettings.model, 'to', newSettings.model);
            configureSettings();
        }
    });
};
