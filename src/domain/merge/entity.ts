export interface MergeEntity {
    type?: 'add' | 'update' | 'delete' | 'move';
    newContent?: string;
    originalContent?: string;
    currentContent?: string;
    originalParentUuid?: string;
    originalPriorSiblingUuid?: string;
}
