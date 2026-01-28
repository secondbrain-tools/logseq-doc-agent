export interface MergeEntity {
    newContent?: string;
    originalContent?: string;
    currentContent?: string;
    type?: 'update' | 'add' | 'delete' | 'move';
    originalParentUuid?: string;
    originalPriorSiblingUuid?: string;
}
