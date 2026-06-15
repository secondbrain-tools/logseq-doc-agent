export interface MergeEntity {
  type?: "add" | "update" | "delete" | "move";
  base?: string; // Original content before LLM changes (preserved across updates)
  currentContent?: string; // Used by UI for user edits
  originalParentUuid?: string;
  originalPriorSiblingUuid?: string;
}
