export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;

export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

export function shouldAutoScrollOnMessageChange(params: {
  currentCount: number;
  lastMessageCount: number;
  currentTailSignature: string;
  lastTailMessageSignature: string;
  isNearBottom: boolean;
}): boolean {
  const {
    currentCount,
    lastMessageCount,
    currentTailSignature,
    lastTailMessageSignature,
    isNearBottom,
  } = params;

  if (currentCount > lastMessageCount) {
    return true;
  }

  if (currentCount === lastMessageCount && currentTailSignature !== lastTailMessageSignature) {
    return isNearBottom;
  }

  return false;
}
