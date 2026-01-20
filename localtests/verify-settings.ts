
// Polyfill for @logseq/libs which expects browser environment
(global as any).self = global;
(global as any).window = global;

// Mock Logseq Global
const mockSettings: Record<string, any> = {};
const mockSchema: any[] = [];
let onSettingsChangedCallback: ((newSettings: any, oldSettings: any) => void) | null = null;

const logseqMock = {
    settings: mockSettings,
    useSettingsSchema: (schema: any[]) => {
        console.log(`[Mock] useSettingsSchema called with ${schema.length} items`);
        mockSchema.length = 0;
        mockSchema.push(...schema);
    },
    onSettingsChanged: (cb: any) => {
        console.log(`[Mock] onSettingsChanged registered`);
        onSettingsChangedCallback = cb;
    },
    updateSettings: (newProps: any) => {
        console.log(`[Mock] updateSettings called with:`, newProps);
        const oldSettings = { ...logseqMock.settings };
        Object.assign(logseqMock.settings, newProps);
        if (onSettingsChangedCallback) {
            console.log(`[Mock] Triggering onSettingsChanged callback`);
            onSettingsChangedCallback(logseqMock.settings, oldSettings);
        }
    }
};

(global as any).logseq = logseqMock;

async function runTest() {
    console.log('=== Starting Settings Verification ===');

    // Dynamic import to ensure polyfills are applied first and to avoid static import hoisting
    const { setupSettings, configureSettings } = await import('../src/plugin/settings-manager');
    const { PROVIDERS } = await import('../src/domain/settings');

    // Re-apply Mock to override anything @logseq/libs might have done
    (global as any).logseq = logseqMock;
    (global as any).window.logseq = logseqMock;

    // 1. Initial Setup
    console.log('\n[1] Initial Setup...');
    setupSettings();

    // Verify Password Input Type
    console.log('Schema keys:', mockSchema.map(s => s.key));
    const apiKeySetting = mockSchema.find(s => s.key === 'openaiApiKey');
    if (apiKeySetting?.inputAs === 'password') {
        console.log('✓ OpenAI API Key has inputAs: password');
    } else {
        console.error('✗ OpenAI API Key missing inputAs: password', apiKeySetting);
    }

    // 2. Add Custom Model
    console.log('\n[2] Adding Custom Model (gpt-test-custom)...');
    // Simulate user typing in "add_custom_model_openai"
    logseqMock.updateSettings({ add_custom_model_openai: 'gpt-test-custom' });

    // Verify it was added to custom_models hidden setting
    const customModelsJson = logseqMock.settings['custom_models'];
    console.log('Current custom_models JSON:', customModelsJson);

    // Parse it back to check
    let customModelsObj: any = {};
    try {
        customModelsObj = JSON.parse(customModelsJson || '{}');
    } catch (e) { }

    if (customModelsObj['openai'] && customModelsObj['openai'].includes('gpt-test-custom')) {
        console.log('✓ Custom model saved in JSON');
    } else {
        console.error('✗ Custom model NOT saved in JSON');
    }

    // Verify it appears in the schema (after re-configuration triggered by update)
    const removeToggle = mockSchema.find(s => s.key === 'remove_custom_model_openai_gpt-test-custom');
    if (removeToggle) {
        console.log('✓ Remove toggle present for custom model');
    } else {
        console.error('✗ Remove toggle convert custom model NOT found');
    }

    // Verify Disable Streaming for Custom Model
    const disableCustomVal = mockSchema.find(s => s.key === 'disable_streaming_openai_gpt-test-custom');
    if (disableCustomVal) {
        console.log('✓ Disable streaming setting present for custom model');
    } else {
        console.error('✗ Disable streaming setting NOT found for custom model');
    }

    // Verify it is in the model list
    const modelDropdown = mockSchema.find(s => s.key === 'model');
    // Note: The value in enabledModels for custom model is just the name
    if (modelDropdown && modelDropdown.enumChoices.includes('gpt-test-custom')) {
        console.log('✓ Custom model present in Default Model dropdown');
    } else {
        console.error('✗ Custom model NOT found in dropdown', modelDropdown?.enumChoices);
    }

    // 3. Remove Custom Model
    console.log('\n[3] Removing Custom Model...');
    // Simulate user toggling remove
    logseqMock.updateSettings({ 'remove_custom_model_openai_gpt-test-custom': true });

    const customModelsJsonAfter = logseqMock.settings['custom_models'];
    console.log('Current custom_models JSON:', customModelsJsonAfter);
    let customModelsObjAfter: any = {};
    try {
        customModelsObjAfter = JSON.parse(customModelsJsonAfter || '{}');
    } catch (e) { }

    if (!customModelsObjAfter['openai'] || !customModelsObjAfter['openai'].includes('gpt-test-custom')) {
        console.log('✓ Custom model removed from JSON');
    } else {
        console.error('✗ Custom model (gpt-test-custom) STILL in JSON');
    }

    // Verify schema updated
    const removeToggleAfter = mockSchema.find(s => s.key === 'remove_custom_model_openai_gpt-test-custom');
    if (!removeToggleAfter) {
        console.log('✓ Remove toggle gone from schema');
    } else {
        console.error('✗ Remove toggle STILL present in schema');
    }

    // 4. Disable Streaming Test
    console.log('\n[4] Test Disable Streaming Toggle...');
    // Logseq settings usage:
    // enable_model_gpt-4o should be default enabled
    const disableKey = 'disable_streaming_openai_gpt-4o';
    // Check if key exists in schema
    const disableSetting = mockSchema.find(s => s.key === disableKey);
    if (disableSetting) {
        console.log('✓ Disable streaming setting found for gpt-4o');
        console.log('  Title:', disableSetting.title);
    } else {
        console.error('✗ Disable streaming setting NOT found for gpt-4o');
    }

    console.log('\n=== Verification Complete ===');
}

runTest().catch((e) => {
    console.error('Test failed with error:');
    console.error(e);
    process.exit(1);
});
