import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    platform: { OS: 'ios' },
    requestMediaLibraryPermissionsAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
    getDocumentAsync: vi.fn(),
    manipulateAsync: vi.fn(),
    generateThumbhash: vi.fn(),
}));

vi.mock('react-native', () => ({
    Platform: mocks.platform,
}));

vi.mock('expo-image-picker', () => ({
    requestMediaLibraryPermissionsAsync: mocks.requestMediaLibraryPermissionsAsync,
    launchImageLibraryAsync: mocks.launchImageLibraryAsync,
}));

vi.mock('expo-document-picker', () => ({
    getDocumentAsync: mocks.getDocumentAsync,
}));

vi.mock('expo-image-manipulator', () => ({
    SaveFormat: { JPEG: 'jpeg' },
    manipulateAsync: mocks.manipulateAsync,
}));

vi.mock('@/modal', () => ({
    Modal: { alert: vi.fn() },
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/thumbhash', () => ({
    generateThumbhash: mocks.generateThumbhash,
}));

import { normalizePickedAssetForUpload, normalizePickedDocumentForUpload } from './useImagePicker';

describe('normalizePickedAssetForUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.platform.OS = 'ios';
    });

    it('normalizes iOS image picker assets to JPEG before upload', async () => {
        mocks.manipulateAsync.mockResolvedValue({
            uri: 'file:///tmp/ImageManipulator/IMG_9824.jpg',
            width: 4032,
            height: 3024,
        });

        const normalized = await normalizePickedAssetForUpload({
            uri: 'file:///tmp/IMG_9824.HEIC',
            width: 4032,
            height: 3024,
            fileName: 'IMG_9824.HEIC',
            fileSize: 2_701_533,
        });

        expect(mocks.manipulateAsync).toHaveBeenCalledWith(
            'file:///tmp/IMG_9824.HEIC',
            [],
            { compress: expect.any(Number), format: 'jpeg' },
        );
        expect(normalized).toEqual({
            uri: 'file:///tmp/ImageManipulator/IMG_9824.jpg',
            mimeType: 'image/jpeg',
            name: 'IMG_9824.jpg',
            width: 4032,
            height: 3024,
        });
    });
});

describe('normalizePickedDocumentForUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes arbitrary document picker assets for the attachment upload pipeline', () => {
        const normalized = normalizePickedDocumentForUpload({
            uri: 'file:///tmp/report.pdf',
            name: 'report.pdf',
            size: 123_456,
            mimeType: 'application/pdf',
            lastModified: 0,
        });

        expect(normalized).toMatchObject({
            uri: 'file:///tmp/report.pdf',
            width: 0,
            height: 0,
            mimeType: 'application/pdf',
            size: 123_456,
            name: 'report.pdf',
        });
        expect(normalized.id).toEqual(expect.any(String));
    });

    it('falls back when document metadata is missing', () => {
        const normalized = normalizePickedDocumentForUpload({
            uri: 'file:///tmp/blob',
            name: '',
            lastModified: 0,
        });

        expect(normalized).toMatchObject({
            uri: 'file:///tmp/blob',
            width: 0,
            height: 0,
            mimeType: 'application/octet-stream',
            size: 0,
        });
        expect(normalized.name).toMatch(/^file_/);
    });
});
