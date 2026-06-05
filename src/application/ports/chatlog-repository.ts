import type { ChatlogEntry, ChatlogMetadata } from "../../domain/chatlog/types";
import type { Message } from "../../domain/chat/types";

/**
 * Interface for Chatlog persistence
 */
export interface IChatlogRepository {
  /**
   * Generate a unique ID for a new chatlog
   */
  generateId(): string;

  /**
   * Save a chatlog
   * @param id Chatlog ID
   * @param title Title of the chatlog
   * @param messages Messages to save
   * @param model Model used
   * @param provider Provider used
   */
  saveChatlog(
    id: string,
    title: string,
    messages: Message[],
    model: string,
    provider: string,
  ): Promise<void>;

  /**
   * Load a chatlog by ID
   * @param id Chatlog ID
   */
  loadChatlog(id: string): Promise<ChatlogEntry | null>;

  /**
   * List all chatlogs
   */
  listChatlogs(): Promise<ChatlogMetadata[]>;

  /**
   * Delete a chatlog by ID
   * @param id Chatlog ID
   */
  deleteChatlog(id: string): Promise<void>;
}
