/**
 * Domain value objects for the feedback rating system
 * These are immutable value objects that represent domain concepts
 */

export class RatingValue {
  readonly value: number;
  readonly max: number;

  constructor(value: number, max: number = 4) {
    if (value < 1 || value > max) {
      throw new Error(`Rating value must be between 1 and ${max}`);
    }
    this.value = value;
    this.max = max;
  }

  static fromNumber(value: number, max: number = 4): RatingValue {
    return new RatingValue(value, max);
  }

  equals(other: RatingValue): boolean {
    return this.value === other.value && this.max === other.max;
  }

  toString(): string {
    return `${this.value}/${this.max}`;
  }

  toStars(): string {
    return '★'.repeat(this.value);
  }

  getColor(): string {
    switch(this.value) {
      case 1: return '#ef4444'; // red
      case 2: return '#eab308'; // yellow
      case 3: return '#86efac'; // light green
      case 4: return '#16a34a'; // dark green
      default: return '#6b7280'; // gray
    }
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

/**
 * Defines the position where a component can be injected relative to a target element
 */
export enum InjectionPosition {
  NextSibling = 'nextSibling',     // Default: after the target element
  PreviousSibling = 'previousSibling', // Before the target element
  FirstChild = 'firstChild',       // As the first child of the target
  LastChild = 'lastChild',         // As the last child of the target
  Replace = 'replace'              // Replace the target element
}