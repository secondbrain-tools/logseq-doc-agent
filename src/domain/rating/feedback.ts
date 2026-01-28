/**
 * Domain entities for the feedback rating system
 * These are pure domain entities that are framework-agnostic
 */

export interface FeedbackRating {
    id: string;
    overallRating: number;
    categoryRatings: CategoryRating[];
    timestamp: Date;
    targetElementId?: string;
}

export interface CategoryRating {
    category: string;
    overallRating: number;
    criteriaRatings: CriterionRating[];
}

export interface CriterionRating {
    criterion: string;
    rating: number;
    feedback: string;
}

// Legacy interface for backward compatibility
export interface DetailedRating {
    category: string;
    rating: number;
    weight?: number;
}

export class FeedbackElementId {
    readonly value: string;

    constructor(id: string) {
        if (!id || id.trim().length === 0) {
            throw new Error('Element ID cannot be empty');
        }
        this.value = id.trim();
    }

    static fromString(id: string): FeedbackElementId {
        return new FeedbackElementId(id);
    }

    equals(other: FeedbackElementId): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}

export class FeedbackText {
    readonly value: string;

    constructor(text: string) {
        if (text === null || text === undefined) {
            this.value = '';
        } else {
            this.value = text.trim();
        }
    }

    static fromString(text: string): FeedbackText {
        return new FeedbackText(text);
    }

    equals(other: FeedbackText): boolean {
        return this.value === other.value;
    }

    isEmpty(): boolean {
        return this.value.length === 0;
    }

    toString(): string {
        return this.value;
    }
}

export class CriterionName {
    readonly value: string;

    constructor(name: string) {
        if (!name || name.trim().length === 0) {
            throw new Error('Criterion name cannot be empty');
        }
        this.value = name.trim();
    }

    static fromString(name: string): CriterionName {
        return new CriterionName(name);
    }

    equals(other: CriterionName): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}
