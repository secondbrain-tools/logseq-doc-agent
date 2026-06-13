import { describe, expect, it } from "vitest";

import {
  AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
  isNearBottom,
  shouldAutoScrollOnMessageChange,
} from "./chat-scroll";

describe("chat scroll helpers", () => {
  it("treats positions near the bottom as sticky", () => {
    expect(isNearBottom(452, 500, 1000)).toBe(true);
    expect(isNearBottom(451, 500, 1000)).toBe(false);
  });

  it("always auto-scrolls when a new message is added", () => {
    expect(
      shouldAutoScrollOnMessageChange({
        currentCount: 3,
        lastMessageCount: 2,
        currentTailSignature: "b",
        lastTailMessageSignature: "a",
        isNearBottom: false,
      }),
    ).toBe(true);
  });

  it("keeps following streaming updates while the user stays near the bottom", () => {
    expect(
      shouldAutoScrollOnMessageChange({
        currentCount: 3,
        lastMessageCount: 3,
        currentTailSignature: "b",
        lastTailMessageSignature: "a",
        isNearBottom: true,
      }),
    ).toBe(true);
  });

  it("stops auto-scroll on streaming updates after the user scrolls away", () => {
    expect(
      shouldAutoScrollOnMessageChange({
        currentCount: 3,
        lastMessageCount: 3,
        currentTailSignature: "b",
        lastTailMessageSignature: "a",
        isNearBottom: false,
      }),
    ).toBe(false);
  });

  it("uses the configured threshold consistently", () => {
    expect(isNearBottom(1000 - 500 - AUTO_SCROLL_BOTTOM_THRESHOLD_PX, 500, 1000)).toBe(true);
  });
});
