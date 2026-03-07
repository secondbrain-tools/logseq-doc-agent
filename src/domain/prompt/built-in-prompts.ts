export interface BuiltInPromptConfig {
    name: string;
    text: string;
    version: number;
}

import { SYSTEM_PROMPT_CONFIG } from '../chat/system.prompt';
import { BASIC_SUMMARY_PROMPT_CONFIG } from '../chat/basic-summary.prompt';
import { RUBRIC_BUILDER_PROMPT_CONFIG } from '../evaluation/rubric-builder.prompt';
import { GENERAL_EVALUATION_PROMPT_CONFIG } from '../evaluation/generel-evaluation.prompt';

export const builtInPrompts: BuiltInPromptConfig[] = [
    BASIC_SUMMARY_PROMPT_CONFIG,
    RUBRIC_BUILDER_PROMPT_CONFIG,
    GENERAL_EVALUATION_PROMPT_CONFIG,
    SYSTEM_PROMPT_CONFIG
];
