/**
 * Domain value objects for the feedback rating system
 * These are immutable value objects that represent domain concepts
 */

export class RatingValue {
    readonly value: number;
    readonly max: number;

    constructor(value: number, max: number = 5) {
        if (value < 0 || value > max) {
            throw new Error(`Rating value must be between 0 and ${max}`);
        }
        this.value = value;
        this.max = max;
    }

    static fromNumber(value: number, max: number = 5): RatingValue {
        return new RatingValue(value, max);
    }

    equals(other: RatingValue): boolean {
        return this.value === other.value && this.max === other.max;
    }

    toString(): string {
        return `${this.value}/${this.max}`;
    }

    toStars(): string {
        if (this.value === 0) {
            return '○'; // Circle for "not applicable"
        }
        return '★'.repeat(this.value);
    }

    getSeverity(): 'excellent' | 'good' | 'warning' | 'bad' | 'muted' {
        if (this.value === 0) {
            return 'muted';
        }

        // Use rounded value for visual consistency with stars
        const displayValue = this.toRoundedValue();

        if (displayValue > 4) return 'excellent'; // 4.5, 5
        if (displayValue > 3) return 'good';      // 3.5, 4
        if (displayValue > 2) return 'warning';   // 2.5, 3
        return 'bad';                             // 0.5, 1, 1.5, 2
    }

    isNotApplicable(): boolean {
        return this.value === 0;
    }

    getPercentage(): number {
        if (this.value === 0) {
            return 0;
        }
        return Math.round((this.value / this.max) * 100);
    }

    toRoundedValue(): number {
        // Rounds to nearest 0.5
        return Math.round(this.value * 2) / 2;
    }

    toFormattedString(): string {
        return `${this.value.toFixed(1)}/${this.max}`;
    }
}

export class RatingCategory {
    readonly name: string;

    constructor(name: string) {
        if (!name || name.trim().length === 0) {
            throw new Error('Category name cannot be empty');
        }
        this.name = name.trim();
    }

    static fromString(name: string): RatingCategory {
        return new RatingCategory(name);
    }

    equals(other: RatingCategory): boolean {
        return this.name === other.name;
    }

    toString(): string {
        return this.name;
    }
}
