import { describe, it, expect, beforeEach } from 'vitest';
import { ShortIdService } from './short-id.service';

describe('ShortIdService', () => {
    let service: ShortIdService;

    beforeEach(() => {
        service = ShortIdService.getInstance();
        service.reset();
    });

    it('should be a singleton', () => {
        const s1 = ShortIdService.getInstance();
        const s2 = ShortIdService.getInstance();
        expect(s1).toBe(s2);
    });

    it('should generate a short ID for a new UUID', () => {
        const uuid = 'uuid-123';
        const shortId = service.getShortId(uuid);
        expect(shortId).toMatch(/^#[a-z0-9]{4}$/);
    });

    it('should return the same short ID for an existing UUID', () => {
        const uuid = 'uuid-123';
        const shortId1 = service.getShortId(uuid);
        const shortId2 = service.getShortId(uuid);
        expect(shortId1).toBe(shortId2);
    });

    it('should generate different IDs for different UUIDs', () => {
        const uuid1 = 'uuid-1';
        const uuid2 = 'uuid-2';
        const id1 = service.getShortId(uuid1);
        const id2 = service.getShortId(uuid2);
        expect(id1).not.toBe(id2);
    });

    it('should retrieve UUID from short ID', () => {
        const uuid = 'test-uuid';
        const shortId = service.getShortId(uuid);
        const retrieved = service.getUuid(shortId);
        expect(retrieved).toBe(uuid);
    });

    it('should handle retrieval with or without # prefix', () => {
        const uuid = 'test-uuid';
        const shortId = service.getShortId(uuid); // e.g. #abc1
        const bareId = shortId.substring(1);      // abc1

        expect(service.getUuid(shortId)).toBe(uuid);
        expect(service.getUuid(bareId)).toBe(uuid);
    });

    it('should return undefined for unknown short ID', () => {
        expect(service.getUuid('#unknown')).toBeUndefined();
    });

    it('should return undefined for invalid or empty inputs to getUuid', () => {
        expect(service.getUuid(undefined as any)).toBeUndefined();
        expect(service.getUuid(null as any)).toBeUndefined();
        expect(service.getUuid('')).toBeUndefined();
        expect(service.getUuid({} as any)).toBeUndefined();
    });
});
