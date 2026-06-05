export class EvaluationState {
  count = $state(0);
  uuids = $state<string[]>([]);

  constructor(initialCount: number = 0, initialUuids: string[] = []) {
    this.count = initialCount;
    this.uuids = initialUuids;
  }

  update(newCount: number, newUuids: string[]) {
    this.count = newCount;
    this.uuids = newUuids;
  }
}
