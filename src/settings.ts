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

interface ModelDefinition {
    label: string;
    value: string;
    defaultEnabled: boolean;
}

interface ProviderDefinition {
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
            { label: 'GPT-4o', value: 'gpt-4o', defaultEnabled: true },
            { label: 'GPT-4o Mini', value: 'gpt-4o-mini', defaultEnabled: true },
            { label: 'GPT-4 Turbo', value: 'gpt-4-turbo', defaultEnabled: false },
            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', defaultEnabled: false },
        ]
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        apiKeySettingKey: 'anthropicApiKey',
        apiKeyLabel: 'Anthropic API Key',
        apiKeyDesc: 'Enter your Anthropic API key.',
        models: [
            { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20240620', defaultEnabled: true },
            { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229', defaultEnabled: true },
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

export const configureSettings = () => {
    const currentSettings = (logseq.settings as any) || {};
    const settings: SettingSchemaDesc[] = [];

    // 1. Providers Section
    //    We iterate through ALL providers.
    //    Always show a heading and an Enable toggle.
    //    If enabled, show configuration.

    const enabledModels: { label: string, value: string }[] = [];

    for (const provider of PROVIDERS) {
        const enableKey = `enable_provider_${provider.id}`;
        // Default OpenAI to true, others to false.
        const defaultEnabled = provider.id === 'openai';

        // Add a visual spacer before each provider block
        settings.push({
            key: `spacer_provider_${provider.id}`,
            type: 'heading',
            title: '', // Visual separator using empty heading
            description: '',
            default: null
        });

        settings.push({
            key: `heading_provider_${provider.id}`,
            type: 'heading',
            title: `${provider.label}`,
            description: '',
            default: null
        });

        settings.push({
            key: enableKey,
            type: 'boolean',
            title: `Enable ${provider.label}`,
            description: `Enable to configure ${provider.label} settings.`,
            default: defaultEnabled,
        });

        // Check if enabled in current settings (or default if not set)
        const isProviderEnabled = currentSettings[enableKey] !== undefined ? currentSettings[enableKey] : defaultEnabled;

        if (isProviderEnabled) {
            // API Key
            settings.push({
                key: provider.apiKeySettingKey,
                type: 'string',
                title: provider.apiKeyLabel,
                description: provider.apiKeyDesc,
                default: '',
            });

            // Models
            // We can add a small heading or separator if we want, but "Enable X" per model is clear enough?
            // Let's add a small definition to make it clear.
            settings.push({
                key: `heading_models_${provider.id}`,
                type: 'heading',
                title: `  ${provider.label} Models`, // Indent visually if possible? Logseq might trim.
                description: '',
                default: null
            });

            for (const model of provider.models) {
                const modelEnableKey = `enable_model_${model.value}`;
                settings.push({
                    key: modelEnableKey,
                    type: 'boolean',
                    title: `Show ${model.label}`,
                    description: `Include in model list.`,
                    default: model.defaultEnabled,
                });

                const isModelEnabled = currentSettings[modelEnableKey] !== undefined ? currentSettings[modelEnableKey] : model.defaultEnabled;

                if (isModelEnabled) {
                    enabledModels.push({
                        label: `${provider.label}: ${model.label}`,
                        value: model.value
                    });
                }
            }
        }
    }

    // 2. Active Model Selection
    //    Only show enabled models.
    const modelEnumChoices = enabledModels.map(m => m.value);

    // Spacer before global settings
    settings.unshift({
        key: 'spacer_global_models',
        type: 'heading',
        title: 'To refresh lists, switch to another tab and back',
        description: '',
        default: null
    });

    if (modelEnumChoices.length > 0) {
        // Add "Mini AI Model" first (order matters for unshift, so user sees them top-down: Model, Mini)
        // Actually unshift adds to the BEGINNING array.
        // So we want the array to look like:
        // [Default Model]
        // [Mini Model]
        // [Spacer]
        // [Provider 1...]

        // So we unshift Mini Model first, then Default Model.

        const defaultMiniModel = modelEnumChoices.find(m => m.includes('mini') || m.includes('flash') || m.includes('haiku')) || modelEnumChoices[0];

        settings.unshift({
            key: 'miniModel',
            type: 'enum',
            title: 'Mini AI Model',
            description: 'Select a smaller/faster model for quick tasks (e.g., summary, extraction).',
            default: defaultMiniModel,
            enumChoices: modelEnumChoices,
        });

        settings.unshift({
            key: 'model',
            type: 'enum',
            title: 'Default AI Model',
            description: 'Select the primary AI model for complex tasks.',
            default: modelEnumChoices[0],
            enumChoices: modelEnumChoices,
        });

    } else {
        settings.unshift({
            key: 'model',
            type: 'enum',
            title: 'Default AI Model',
            description: 'No models enabled. Please enable a provider below.',
            default: null,
            enumChoices: ['No models enabled'],
        });
    }

    logseq.useSettingsSchema(settings as any);
};

export const setupSettings = () => {
    // Initial configuration
    configureSettings();

    // Re-configure when settings change
    logseq.onSettingsChanged((newSettings, oldSettings) => {
        let shouldReconfigure = false;

        // Check for provider enable/disable changes
        for (const provider of PROVIDERS) {
            const key = `enable_provider_${provider.id}`;
            if (newSettings[key] !== oldSettings[key]) {
                shouldReconfigure = true;
                break;
            }
            // Check for model enable/disable changes
            for (const model of provider.models) {
                const modelKey = `enable_model_${model.value}`;
                if (newSettings[modelKey] !== oldSettings[modelKey]) {
                    shouldReconfigure = true;
                    break;
                }
            }
        }

        if (shouldReconfigure) {
            console.log('Settings schema affecting configuration changed, refreshing schema...');
            configureSettings();
        }
    });
};
