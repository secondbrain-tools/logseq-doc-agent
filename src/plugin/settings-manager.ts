import '@logseq/libs';
import { PROVIDERS, type SettingSchemaDesc } from '../domain/settings/index';

export const configureSettings = () => {
    const currentSettings = (logseq.settings as any) || {};
    const settings: SettingSchemaDesc[] = [];

    // Parse custom models
    let customModels: Record<string, string[]> = {};
    try {
        customModels = JSON.parse(currentSettings['custom_models'] || '{}');
    } catch (e) {
        console.error('Failed to parse custom_models', e);
    }

    // 1. Providers Section
    const enabledModels: { label: string, value: string }[] = [];

    for (const provider of PROVIDERS) {
        const enableKey = `enable_provider_${provider.id}`;
        const defaultEnabled = provider.id === 'openai';

        settings.push({
            key: `spacer_provider_${provider.id}`,
            type: 'heading',
            title: '',
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

        const isProviderEnabled = currentSettings[enableKey] !== undefined ? currentSettings[enableKey] : defaultEnabled;

        if (isProviderEnabled) {
            // API Key with password type
            settings.push({
                key: provider.apiKeySettingKey,
                type: 'string',
                title: provider.apiKeyLabel,
                description: provider.apiKeyDesc,
                default: '',
                inputAs: 'password' as any
            });

            // Models Heading
            settings.push({
                key: `heading_models_${provider.id}`,
                type: 'heading',
                title: `  ${provider.label} Models`,
                description: '',
                default: null
            });

            // Built-in Models
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

                    // Disable Streaming Toggle
                    settings.push({
                        key: `disable_streaming_${provider.id}_${model.value}`,
                        type: 'boolean',
                        title: `    ↳ Disable Streaming`,
                        description: `Show full response at once instead of typing effect.`,
                        default: false,
                    });

                    settings.push({
                        key: `enable_reasoning_${provider.id}_${model.value}`,
                        type: 'boolean',
                        title: `    ↳ Enable Reasoning`,
                        description: `Enable reasoning capabilities for this model.`,
                        default: model.supportsReasoning || false,
                    });
                }
            }

            // Custom Models
            const providerCustomModels = customModels[provider.id] || [];
            if (providerCustomModels.length > 0) {
                settings.push({
                    key: `heading_custom_models_${provider.id}`,
                    type: 'heading',
                    title: `  Custom ${provider.label} Models`,
                    description: '',
                    default: null
                });

                for (const modelName of providerCustomModels) {
                    enabledModels.push({
                        label: `${provider.label}: ${modelName} (Custom)`,
                        value: modelName
                    });

                    settings.push({
                        key: `remove_custom_model_${provider.id}_${modelName}`,
                        type: 'boolean',
                        title: `Remove ${modelName}`,
                        description: `Remove this custom model.`,
                        default: false,
                    });

                    // Disable Streaming Toggle for Custom Model
                    settings.push({
                        key: `disable_streaming_${provider.id}_${modelName}`,
                        type: 'boolean',
                        title: `    ↳ Disable Streaming`,
                        description: `Show full response at once.`,
                        default: false,
                    });

                    settings.push({
                        key: `enable_reasoning_${provider.id}_${modelName}`,
                        type: 'boolean',
                        title: `    ↳ Enable Reasoning`,
                        description: `Enable reasoning capabilities for this custom model.`,
                        default: false,
                    });
                }
            }

            // Add New Model Field
            settings.push({
                key: `add_custom_model_${provider.id}`,
                type: 'string',
                title: `Add New ${provider.label} Model`,
                description: 'Enter model name and click away to add (e.g. gpt-4-32k)',
                default: '',
            });
        }
    }

    // Merge Settings
    settings.push({
        key: 'merge_settings_heading',
        type: 'heading',
        title: 'Merge Configuration',
        description: '',
        default: null
    });

    settings.push({
        key: 'mergeFilterPatterns',
        type: 'string',
        title: 'Merge Property Filters (Wildcards allowed)',
        description: 'Properties matching these patterns will be hidden in the merge editor but preserved on save. One pattern per line.',
        default: 'logseq-doc-agent.*',
        inputAs: 'textarea'
    });

    settings.push({
        key: 'get_merged_content_default',
        type: 'boolean',
        title: 'Use Merged Content by Default',
        description: 'If enabled, the AI will see the content from the merge property (proposed changes) instead of the block body (original content).',
        default: true
    });

    settings.push({
        key: 'get_merged_content_both',
        type: 'boolean',
        title: 'Provide Both Original and Merged Content',
        description: 'If enabled, the AI will receive both the original content and the merged/proposed content.',
        default: false
    });

    // 2. Active Model Selection
    const modelEnumChoices = enabledModels.map(m => m.value);

    settings.unshift({
        key: 'spacer_global_models',
        type: 'heading',
        title: 'To refresh lists, switch to another tab and back',
        description: '',
        default: null
    });

    if (modelEnumChoices.length > 0) {
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

    // Reasoning Effort Settings
    settings.push({
        key: 'heading_reasoning',
        type: 'heading',
        title: 'Reasoning Effort',
        description: '',
        default: null
    });

    settings.push({
        key: 'defaultReasoningEffort',
        type: 'enum',
        title: 'Default Reasoning Effort',
        description: 'Default reasoning effort for the main model (if supported).',
        default: 'medium',
        enumChoices: ['none', 'low', 'medium', 'high'],
    });

    settings.push({
        key: 'miniModelReasoningEffort',
        type: 'enum',
        title: 'Mini Model Reasoning Effort',
        description: 'Default reasoning effort for the mini model (if supported).',
        default: 'none',
        enumChoices: ['none', 'low', 'medium', 'high'],
    });

    // 2.5 Agent Configuration
    settings.push({
        key: 'heading_agent_config',
        type: 'heading',
        title: 'Agent Configuration',
        description: '',
        default: null
    });

    settings.push({
        key: 'maxAgentCycles',
        type: 'number',
        title: 'Max Agent Cycles',
        description: 'Maximum number of autonomous cycles (tool calls -> output -> continue) the agent can perform per request. Default: 10',
        default: 10,
    });

    // 3. Storage Settings
    settings.push({
        key: 'heading_storage',
        type: 'heading',
        title: 'Storage Settings',
        description: '',
        default: null
    });

    settings.push({
        key: 'maximizedChatWidth',
        type: 'string',
        title: 'Maximized Chat Width',
        description: 'Width of the chat area when maximized (e.g. "900px", "60%", "40rem"). Default: 900px',
        default: '80rem',
    });

    settings.push({
        key: 'storageRoot',
        type: 'string',
        title: 'Storage Root Page',
        description: 'The root page name for storing plugin data (chatlogs, prompts, etc.). Default: "logseq-doc-agent"',
        default: 'logseq-doc-agent',
    });

    logseq.useSettingsSchema(settings as any);
};

export const setupSettings = () => {
    // Initial configuration
    configureSettings();

    // Re-configure when settings change
    logseq.onSettingsChanged((newSettings, oldSettings) => {
        let shouldReconfigure = false;
        let shouldUpdateCustomModels = false;

        // Parse custom models
        let customModels: Record<string, string[]> = {};
        try {
            customModels = JSON.parse(newSettings['custom_models'] || '{}');
        } catch (e) {
            console.error('Failed to parse custom_models', e);
        }

        // Check for provider enable/disable changes
        if (newSettings['custom_models'] !== oldSettings['custom_models']) {
            shouldReconfigure = true;
        }

        for (const provider of PROVIDERS) {
            const key = `enable_provider_${provider.id}`;
            if (newSettings[key] !== oldSettings[key]) {
                shouldReconfigure = true;
            }

            // Check for built-in model enable/disable changes
            for (const model of provider.models) {
                const modelKey = `enable_model_${model.value}`;
                if (newSettings[modelKey] !== oldSettings[modelKey]) {
                    shouldReconfigure = true;
                }
            }

            // Check for "Add New Model"
            const addKey = `add_custom_model_${provider.id}`;
            const newModelName = newSettings[addKey];
            if (newModelName && newModelName.trim() !== '') {

                if (!customModels[provider.id]) {
                    customModels[provider.id] = [];
                }
                const name = newModelName.trim();
                if (!customModels[provider.id].includes(name)) {
                    customModels[provider.id].push(name);
                    shouldUpdateCustomModels = true;
                }

                logseq.updateSettings({ [addKey]: '' });
            }

            // Check for "Remove Custom Model"
            const providerCustomModels = customModels[provider.id] || [];
            const modelsToRemove: string[] = [];
            for (const modelName of providerCustomModels) {
                const removeKey = `remove_custom_model_${provider.id}_${modelName}`;
                if (newSettings[removeKey] === true) {
                    modelsToRemove.push(modelName);
                    logseq.updateSettings({ [removeKey]: false });
                }
            }

            if (modelsToRemove.length > 0) {
                customModels[provider.id] = customModels[provider.id].filter(m => !modelsToRemove.includes(m));
                shouldUpdateCustomModels = true;
            }
        }

        if (shouldUpdateCustomModels) {
            logseq.updateSettings({ custom_models: JSON.stringify(customModels) });
            return;
        }

        if (shouldReconfigure) {
            console.log('Settings schema affecting configuration changed, refreshing schema...');
            configureSettings();
        }
    });
};
