export class MergeState {
    count = $state(0);

    constructor(initialCount: number = 0) {
        this.count = initialCount;
    }

    updateCount(newCount: number) {
        this.count = newCount;
    }
}
