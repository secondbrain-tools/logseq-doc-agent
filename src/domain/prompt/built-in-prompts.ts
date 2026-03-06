export interface BuiltInPromptConfig {
    name: string;
    text: string;
    version: number;
}

import { BASE_PROMPT_CONFIG } from '../chat/base.prompt';
import { BASIC_SUMMARY_PROMPT_CONFIG } from '../chat/basic-summary.prompt';
import { RUBRIC_BUILDER_PROMPT_CONFIG } from '../evaluation/rubric-builder.prompt';

export const builtInPrompts: BuiltInPromptConfig[] = [
    BASIC_SUMMARY_PROMPT_CONFIG,
    RUBRIC_BUILDER_PROMPT_CONFIG,
    BASE_PROMPT_CONFIG
];
