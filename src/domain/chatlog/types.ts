import type { Message } from '../chat/types';

/**
 * Metadata for a chatlog entry (used in history list)
 */
export interface ChatlogMetadata {
    /** Logseq page UUID */
    id: string;
    /** Page title (auto-generated or user-edited) */
    title: string;
    /** ISO timestamp from Logseq page properties */
    created: string;
    /** ISO timestamp from Logseq page properties */
    updated: string;
    /** Model used for the chat session */
    model?: string;
    /** Provider ID */
    provider?: string;
    /** Number of messages in the chatlog */
    messageCount: number;
}

/**
 * Full chatlog entry with messages
 */
export interface ChatlogEntry {
    metadata: ChatlogMetadata;
    messages: Message[];
}

/**
 * Properties stored on chatlog page blocks
 */
export const CHATLOG_PROPERTIES = {
    ROLE: 'lda.chatlog.role',
    TIMESTAMP: 'lda.chatlog.timestamp',
    MODEL: 'lda.chatlog.model',
    PROVIDER: 'lda.chatlog.provider',
    AGENT: 'lda.chatlog.agent',
    ID: 'lda.chatlog.id',
    PARTS: 'lda.chatlog.parts',
} as const;
