
export class ShortIdService {
    private static instance: ShortIdService;
    private uuidToShortMap: Map<string, string>;
    private shortToUuidMap: Map<string, string>;

    private constructor() {
        this.uuidToShortMap = new Map();
        this.shortToUuidMap = new Map();
    }

    public static getInstance(): ShortIdService {
        if (!ShortIdService.instance) {
            ShortIdService.instance = new ShortIdService();
        }
        return ShortIdService.instance;
    }

    public getShortId(uuid: string): string {
        if (!uuid) return '';

        if (this.uuidToShortMap.has(uuid)) {
            return this.uuidToShortMap.get(uuid)!;
        }

        const shortId = this.generateUniqueShortId();
        this.uuidToShortMap.set(uuid, shortId);
        this.shortToUuidMap.set(shortId, uuid);

        return shortId;
    }

    public getUuid(shortId: string): string | undefined {
        if (!shortId || typeof shortId !== 'string') return undefined;
        // Strip the '#' prefix if present for lookup
        const cleanId = shortId.startsWith('#') ? shortId.substring(1) : shortId;
        return this.shortToUuidMap.get(`#${cleanId}`) ?? this.shortToUuidMap.get(cleanId);
    }

    public reset(): void {
        this.uuidToShortMap.clear();
        this.shortToUuidMap.clear();
    }

    private generateUniqueShortId(): string {
        while (true) {
            // Generate a random 4-character alphanumeric string
            // Using a simple strategy: random hex/alphanum
            // Math.random base 36 is easy: 0-9 a-z
            const candidate = '#' + Math.random().toString(36).substring(2, 6);

            if (!this.shortToUuidMap.has(candidate) && candidate.length === 5) { // # + 4 chars
                return candidate;
            }
            // Retry if collision (rare) or length mismatch
        }
    }
}
