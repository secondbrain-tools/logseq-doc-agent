import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatlogService } from "./chatlog.service";
import type { IChatlogRepository } from "../ports/chatlog-repository";
import type { MiniModelRunner } from "../../infra/ai/mini-model-runner";
import type { Message } from "../../domain/chat/types";

// Mock IChatlogRepository
const createMockRepository = (): IChatlogRepository => ({
  generateId: vi.fn().mockReturnValue("mock-id"),
  saveChatlog: vi.fn().mockResolvedValue(undefined),
  loadChatlog: vi.fn().mockResolvedValue(null),
  listChatlogs: vi.fn().mockResolvedValue([]),
  deleteChatlog: vi.fn().mockResolvedValue(undefined),
});

// Mock MiniModelRunner
const createMockMiniModelRunner = (): MiniModelRunner =>
  ({
    generateTitle: vi.fn().mockResolvedValue("AI Generated Title"),
    getMiniModelSettings: vi.fn(),
    findProviderForModel: vi.fn(),
    generate: vi.fn(),
  }) as any as MiniModelRunner;

describe("ChatlogService", () => {
  let service: ChatlogService;
  let mockRepository: ReturnType<typeof createMockRepository>;
  let mockMiniModelRunner: ReturnType<typeof createMockMiniModelRunner>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = createMockRepository();
    mockMiniModelRunner = createMockMiniModelRunner();
    service = new ChatlogService(mockRepository, mockMiniModelRunner);
  });

  describe("generateId", () => {
    it("should delegate to repository", () => {
      service.generateId();
      expect(mockRepository.generateId).toHaveBeenCalled();
    });
  });

  describe("sanitizeTitle", () => {
    it("should strip non-alphanumeric characters", () => {
      const result = (service as any).sanitizeTitle("Hello, World! @2024 #test");
      expect(result).toBe("Hello World 2024 test");
    });

    it("should strip newlines and colons", () => {
      const result = (service as any).sanitizeTitle("Title:\nWith Newline");
      expect(result).toBe("Title With Newline");
    });

    it("should collapse multiple spaces", () => {
      const result = (service as any).sanitizeTitle("Word1    Word2");
      expect(result).toBe("Word1 Word2");
    });

    it("should limit length to 50 characters and append ellipsis", () => {
      const longTitle =
        "This is a very long title that exceeds the maximum allowed length for a chatlog title";
      const result = (service as any).sanitizeTitle(longTitle);
      expect(result.length).toBe(50);
      expect(result.endsWith("...")).toBe(true);
      expect(result).not.toContain("  "); // Should still be collapsed
    });

    it('should return "New Chat" if result is empty after sanitization', () => {
      const result = (service as any).sanitizeTitle("!!! @@@ ###");
      expect(result).toBe("New Chat");
    });
  });

  describe("generateTitle", () => {
    it('should return "New Chat" when no user messages', () => {
      const messages: Message[] = [{ id: "1", role: "assistant", content: "Hello!" }];

      const title = service.generateTitle(messages);
      expect(title).toBe("New Chat");
    });

    it("should use first user message content and sanitize it", () => {
      const messages: Message[] = [{ id: "1", role: "user", content: "What is AI?" }];

      const title = service.generateTitle(messages);
      expect(title).toBe("What is AI"); // ? is stripped
    });

    it("should truncate long messages and sanitize", () => {
      const longContent =
        "This is a very long message! With some @ special characters : that should be stripped.";
      const messages: Message[] = [{ id: "1", role: "user", content: longContent }];

      const title = service.generateTitle(messages);
      expect(title.length).toBe(50);
      expect(title.endsWith("...")).toBe(true);
      expect(title).not.toMatch(/[:!@]/); // Special chars stripped
    });
  });

  describe("generateTitleAsync", () => {
    it("should use MiniModelRunner with formatted context and sanitize result", async () => {
      const messages: Message[] = [{ id: "1", role: "user", content: "What is AI?" }];

      const title = await service.generateTitleAsync(messages);

      expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith(
        "First User Message: What is AI?",
      );
      expect(title).toBe("AI Generated Title");
    });

    it("should include first and last interaction for long history", async () => {
      const messages: Message[] = [
        { id: "1", role: "user", content: "First Q" },
        { id: "2", role: "assistant", content: "First A" },
        { id: "3", role: "user", content: "Middle Q" },
        { id: "4", role: "assistant", content: "Middle A" },
        { id: "5", role: "user", content: "Last Q" },
        { id: "6", role: "assistant", content: "Last A" },
      ];

      await service.generateTitleAsync(messages);

      const expectedContext = `First User Message: First Q
First Model Answer: First A

Last User Message: Last Q
Last Model Answer: Last A`;

      expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith(expectedContext);
    });

    it("should fallback to simple title when AI fails and sanitize", async () => {
      mockMiniModelRunner.generateTitle = vi.fn().mockRejectedValue(new Error("API Error"));
      service = new ChatlogService(mockRepository, mockMiniModelRunner);

      const messages: Message[] = [{ id: "1", role: "user", content: "Simple question?" }];

      const title = await service.generateTitleAsync(messages);

      expect(title).toBe("Simple question"); // ? stripped
    });

    it("should use fallback when no MiniModelRunner and sanitize", async () => {
      service = new ChatlogService(mockRepository); // No runner

      const messages: Message[] = [{ id: "1", role: "user", content: "Test: question!" }];

      const title = await service.generateTitleAsync(messages);

      expect(title).toBe("Test question"); // : and ! stripped
    });
  });

  describe("requestSave", () => {
    it("should call repository.saveChatlog with generated title", async () => {
      const messages: Message[] = [{ id: "1", role: "user", content: "Hello" }];

      await service.requestSave("new-id", messages, "gpt-4", "openai");

      expect(mockRepository.saveChatlog).toHaveBeenCalledWith(
        "new-id",
        "AI Generated Title",
        messages,
        "gpt-4",
        "openai",
      );
    });

    it("should generate title only for new chats", async () => {
      const messages: Message[] = [{ id: "1", role: "user", content: "Topic A" }];

      await service.requestSave("id-1", messages, "model", "provider");

      expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith("First User Message: Topic A");
    });

    it("should NOT regenerate title after new user messages", async () => {
      // First save
      let messages: Message[] = [{ id: "1", role: "user", content: "Msg 1" }];
      await service.requestSave("id-1", messages, "model", "provider");
      expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledTimes(1);

      // Add messages until 3 new user messages since last generation
      messages = [
        { id: "1", role: "user", content: "Msg 1" },
        { id: "2", role: "assistant", content: "Ans 1" },
        { id: "3", role: "user", content: "Msg 2" },
        { id: "4", role: "assistant", content: "Ans 2" },
        { id: "5", role: "user", content: "Msg 3" },
        { id: "6", role: "assistant", content: "Ans 3" },
        { id: "7", role: "user", content: "Msg 4" },
      ];

      await service.requestSave("id-1", messages, "model", "provider");

      expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledTimes(1); // Still 1
    });

    it("should queue pending saves if saving is in progress", async () => {
      // Mock slow save
      mockRepository.saveChatlog = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const p1 = service.requestSave(
        "id-queue",
        [{ id: "1", role: "user", content: "1" }],
        "m",
        "p",
      );
      const p2 = service.requestSave(
        "id-queue",
        [{ id: "2", role: "user", content: "2" }],
        "m",
        "p",
      );
      const p3 = service.requestSave(
        "id-queue",
        [{ id: "3", role: "user", content: "3" }],
        "m",
        "p",
      );

      await Promise.all([p1, p2, p3]);

      expect(mockRepository.saveChatlog).toHaveBeenCalled();
    });
  });

  describe("listChatlogs", () => {
    it("should delegate to repository", async () => {
      const mockList = [{ id: "1", title: "Test", created: "", updated: "", messageCount: 1 }];
      mockRepository.listChatlogs = vi.fn().mockResolvedValue(mockList);

      const result = await service.listChatlogs();

      expect(mockRepository.listChatlogs).toHaveBeenCalled();
      expect(result).toEqual(mockList);
    });
  });

  describe("deleteChatlog", () => {
    it("should delegate to repository", async () => {
      await service.deleteChatlog("delete-id");
      expect(mockRepository.deleteChatlog).toHaveBeenCalledWith("delete-id");
    });
  });

  describe("loadChatlog", () => {
    it("should cache title from loaded chatlog to prevent regeneration", async () => {
      const mockEntry = {
        metadata: {
          id: "existing-id",
          title: "Existing Title",
          created: "",
          updated: "",
          messageCount: 1,
        },
        messages: [{ id: "1", role: "user" as const, content: "New message triggering save" }],
      };
      mockRepository.loadChatlog = vi.fn().mockResolvedValue(mockEntry);

      // 1. Load the chatlog (should cache "Existing Title")
      await service.loadChatlog("existing-id");

      // 2. Request save with new messages
      await service.requestSave("existing-id", mockEntry.messages, "model", "provider");

      // 3. Verify title was NOT regenerated
      expect(mockMiniModelRunner.generateTitle).not.toHaveBeenCalled();

      // 4. Verify save used the existing title
      expect(mockRepository.saveChatlog).toHaveBeenCalledWith(
        "existing-id",
        "Existing Title",
        mockEntry.messages,
        "model",
        "provider",
      );
    });
  });
});
