import { fireEvent, render, screen, within, cleanup } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import MessageBubble from "./MessageBubble.svelte";
import type { Message } from "../../../domain/chat/types";

afterEach(() => cleanup());

function renderMessage(msg: Message) {
  const onToggleCollapse = vi.fn();
  const onContextMenu = vi.fn();

  render(MessageBubble, {
    props: {
      msg,
      onToggleCollapse,
      onContextMenu,
    },
  });

  return { onToggleCollapse, onContextMenu };
}

describe("MessageBubble", () => {
  it("shows maximize only for assistant text responses", () => {
    renderMessage({
      id: "assistant-plain",
      role: "assistant",
      content: "Just a paragraph.",
    });

    expect(screen.getByRole("button", { name: /maximize response/i })).toBeInTheDocument();
    expect(screen.getByText("Just a paragraph.")).toBeInTheDocument();
  });

  it("renders headingless assistant content without section toggles", () => {
    renderMessage({
      id: "assistant-flat",
      role: "assistant",
      content: "A short reply with **formatting**.",
    });

    expect(screen.getByText(/A short reply with/i)).toBeInTheDocument();
    expect(screen.getByText("formatting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /collapse/i })).toBeNull();
  });

  it("collapses only the selected section body", async () => {
    renderMessage({
      id: "assistant-sections",
      role: "assistant",
      content: `# Alpha

Alpha body.

# Beta

Beta body.
`,
    });

    await fireEvent.click(screen.getByRole("button", { name: /collapse alpha/i }));

    expect(screen.queryByText("Alpha body.")).toBeNull();
    expect(screen.getByText("Beta body.")).toBeInTheDocument();
  });

  it("reuses the same structured sections inside the expanded modal", async () => {
    renderMessage({
      id: "assistant-modal",
      role: "assistant",
      content: `Intro text.

# Alpha

Alpha body.
`,
    });

    await fireEvent.click(screen.getByRole("button", { name: /maximize response/i }));

    const modal = document.querySelector(".lda-chat-modal-backdrop");
    expect(modal).not.toBeNull();
    expect(within(modal as HTMLElement).getByText("Alpha body.")).toBeInTheDocument();
    expect(
      within(modal as HTMLElement).getByRole("button", { name: /restore inline/i }),
    ).toBeInTheDocument();
  });

  it("keeps tool cards expandable beside the response renderer", async () => {
    renderMessage({
      id: "assistant-tools",
      role: "assistant",
      content: "# Alpha\n\nAlpha body.",
      parts: [
        {
          type: "content",
          text: "# Alpha\n\nAlpha body.",
        },
        {
          type: "tool_call",
          toolCallId: "1",
          toolName: "getBlock",
          toolArgs: { id: "123" },
          isCollapsed: false,
        },
        {
          type: "tool_result",
          toolCallId: "1",
          toolName: "getBlock",
          toolResult: "success",
        },
      ],
    });

    expect(screen.getByRole("button", { name: /getBlock/i })).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("Alpha body.")).toBeInTheDocument();
  });

  it("handles duplicate heading names with independent collapse", async () => {
    renderMessage({
      id: "assistant-dupes",
      role: "assistant",
      content: `# Alpha

First Alpha body.

# Alpha

Second Alpha body.`,
    });

    // Both headings exist
    const headings = screen.getAllByText("Alpha");
    expect(headings).toHaveLength(2);

    // Collapse the first Alpha
    const collapseButtons = screen.getAllByRole("button", { name: /collapse alpha/i });
    await fireEvent.click(collapseButtons[0]);
    expect(screen.queryByText("First Alpha body.")).toBeNull();
    // Second Alpha still visible
    expect(screen.getByText("Second Alpha body.")).toBeInTheDocument();
  });

  it("shares collapse-state map between inline and modal views", async () => {
    renderMessage({
      id: "assistant-shared",
      role: "assistant",
      content: `# Alpha

Alpha body.

# Beta

Beta body.`,
    });

    // Collapse Alpha inline
    await fireEvent.click(screen.getByRole("button", { name: /collapse alpha/i }));
    expect(screen.queryByText("Alpha body.")).toBeNull();

    // Maximize
    await fireEvent.click(screen.getByRole("button", { name: /maximize response/i }));
    const modal = document.querySelector(".lda-chat-modal-backdrop");
    expect(modal).not.toBeNull();

    // Alpha is still collapsed in modal (shared state)
    expect(within(modal as HTMLElement).queryByText("Alpha body.")).toBeNull();
    // Beta is still visible
    expect(within(modal as HTMLElement).getByText("Beta body.")).toBeInTheDocument();
  });

  it("does not render toggle for headings with no body or children", async () => {
    renderMessage({
      id: "assistant-empty-section",
      role: "assistant",
      content: `# Plain Heading`,
    });

    // Heading is visible
    expect(screen.getByText("Plain Heading")).toBeInTheDocument();
    // No collapse toggle since there is no body content
    expect(screen.queryByRole("button", { name: /collapse plain heading/i })).toBeNull();
  });

  it("combines multiple content parts into full expanded view", async () => {
    renderMessage({
      id: "assistant-multipart",
      role: "assistant",
      content: "",
      parts: [
        { type: "content", text: "First message block." },
        { type: "content", text: "Second message block." },
      ],
    });

    // Both parts visible inline
    expect(screen.getByText("First message block.")).toBeInTheDocument();
    expect(screen.getByText("Second message block.")).toBeInTheDocument();

    // Maximize button should be present since fullResponseText is non-empty
    expect(screen.getByRole("button", { name: /maximize response/i })).toBeInTheDocument();
  });
});

it("calls onSelect when bubble is clicked", async () => {
  const onSelect = vi.fn();
  render(MessageBubble, {
    props: {
      msg: { id: "click-me", role: "assistant", content: "Clickable" },
      onToggleCollapse: vi.fn(),
      onContextMenu: vi.fn(),
      onSelect,
    },
  });

  const bubble = document.querySelector(".lda-bubble");
  expect(bubble).not.toBeNull();
  await fireEvent.click(bubble!);
  expect(onSelect).toHaveBeenCalledOnce();
});

it("adds lda-bubble-highlighted class when isHighlighted is true", () => {
  render(MessageBubble, {
    props: {
      msg: { id: "hl", role: "user", content: "Highlight me" },
      onToggleCollapse: vi.fn(),
      onContextMenu: vi.fn(),
      isHighlighted: true,
    },
  });

  const bubble = document.querySelector(".lda-bubble");
  expect(bubble).not.toBeNull();
  expect(bubble!.classList.contains("lda-bubble-highlighted")).toBe(true);
});

it("does NOT add highlight class when isHighlighted is false", () => {
  render(MessageBubble, {
    props: {
      msg: { id: "no-hl", role: "user", content: "Not highlighted" },
      onToggleCollapse: vi.fn(),
      onContextMenu: vi.fn(),
      isHighlighted: false,
    },
  });

  const bubble = document.querySelector(".lda-bubble");
  expect(bubble).not.toBeNull();
  expect(bubble!.classList.contains("lda-bubble-highlighted")).toBe(false);
});

it("opens modal when maximizeSignal changes from 0 to non-zero", async () => {
  // Render with signal=0, then replace with signal=1 by re-rendering
  const onToggleCollapse = vi.fn();
  const onContextMenu = vi.fn();
  const msg: Message = { id: "sig", role: "assistant", content: "Signal test" };

  const { rerender } = render(MessageBubble, {
    props: {
      msg,
      onToggleCollapse,
      onContextMenu,
      maximizeSignal: 0,
    },
  });

  // Initially no modal
  expect(document.querySelector(".lda-chat-modal-backdrop")).toBeNull();

  // Update signal
  await rerender({
    msg,
    onToggleCollapse,
    onContextMenu,
    maximizeSignal: 1,
  });

  // Modal should appear
  const modal = document.querySelector(".lda-chat-modal-backdrop");
  expect(modal).not.toBeNull();
});

it("does NOT open modal on initial render with signal=0", () => {
  render(MessageBubble, {
    props: {
      msg: { id: "init", role: "assistant", content: "No modal" },
      onToggleCollapse: vi.fn(),
      onContextMenu: vi.fn(),
      maximizeSignal: 0,
    },
  });

  expect(document.querySelector(".lda-chat-modal-backdrop")).toBeNull();
});
