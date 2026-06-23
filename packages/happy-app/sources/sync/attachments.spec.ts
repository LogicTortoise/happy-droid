import { describe, it, expect } from 'vitest';
import {
    buildAttachmentBody,
    parseAttachmentBody,
    formatBytes,
    formatAttachmentMarker,
    appendAttachmentMarkers,
    collectMessageDownloads,
    extractArtifactRefsFromText,
    PickedFile,
    sanitizeFileName,
    isImageMimeType,
    normalizeArtifactRef,
} from './attachments';
import { MessageAttachment } from './typesMessageMeta';

const sampleFile: PickedFile = {
    name: 'report.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    base64: 'SGVsbG8=',
};

const sampleAttachment: MessageAttachment = {
    artifactId: 'art-123',
    name: 'report.pdf',
    mimeType: 'application/pdf',
    size: 2048,
};

describe('attachments body encode/decode', () => {
    it('round-trips a picked file through the artifact body', () => {
        const body = buildAttachmentBody(sampleFile);
        expect(typeof body.body).toBe('string');
        const parsed = parseAttachmentBody(body);
        expect(parsed).toEqual(sampleFile);
    });

    it('returns null for a non-attachment body', () => {
        expect(parseAttachmentBody({ body: 'just some text' })).toBeNull();
        expect(parseAttachmentBody({ body: null })).toBeNull();
        expect(parseAttachmentBody(null)).toBeNull();
    });

    it('returns null when the JSON is not a file payload', () => {
        expect(parseAttachmentBody({ body: JSON.stringify({ kind: 'note' }) })).toBeNull();
    });
});

describe('formatBytes', () => {
    it('formats across units', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(10 * 1024)).toBe('10 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });

    it('handles invalid input', () => {
        expect(formatBytes(-1)).toBe('0 B');
        expect(formatBytes(NaN)).toBe('0 B');
    });
});

describe('message markers', () => {
    it('formats a single attachment marker referencing the artifact', () => {
        const marker = formatAttachmentMarker(sampleAttachment);
        expect(marker).toContain('report.pdf');
        expect(marker).toContain('application/pdf');
        expect(marker).toContain('artifact:art-123');
    });

    it('appends markers after user text with a blank line', () => {
        const out = appendAttachmentMarkers('hello', [sampleAttachment]);
        expect(out.startsWith('hello\n\n')).toBe(true);
        expect(out).toContain('artifact:art-123');
    });

    it('uses only markers when there is no user text', () => {
        const out = appendAttachmentMarkers('   ', [sampleAttachment]);
        expect(out.startsWith('[attachment:')).toBe(true);
    });

    it('returns the original text when there are no attachments', () => {
        expect(appendAttachmentMarkers('hello', [])).toBe('hello');
    });
});

describe('download helpers', () => {
    it('extracts artifact refs from attachment markers', () => {
        const items = extractArtifactRefsFromText('done\n[attachment: report.pdf (application/pdf, 2.0 KB) artifact:art-123]');
        expect(items).toEqual([{
            id: 'artifact:art-123',
            source: 'artifact',
            artifactId: 'art-123',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            size: 2048,
        }]);
    });

    it('sanitizes unsafe file names', () => {
        expect(sanitizeFileName('../bad:name?.png')).toBe('.._bad_name_.png');
        expect(sanitizeFileName('   ')).toBe('file');
    });

    it('detects image mime types', () => {
        expect(isImageMimeType('image/png')).toBe(true);
        expect(isImageMimeType('application/pdf')).toBe(false);
    });

    it('normalizes artifact refs', () => {
        expect(normalizeArtifactRef('artifact:abc')).toBe('abc');
        expect(normalizeArtifactRef('2d931510-d99f-494a-8c67-87feb05e1594')).toBe('2d931510-d99f-494a-8c67-87feb05e1594');
        expect(normalizeArtifactRef('upload-1')).toBeNull();
    });

    it('collects meta attachments and dedupes matching text markers', () => {
        const message = {
            kind: 'user-text' as const,
            id: 'm1',
            localId: null,
            createdAt: 1,
            text: appendAttachmentMarkers('hello', [sampleAttachment]),
            meta: { attachments: [sampleAttachment] },
        };

        const items = collectMessageDownloads(message);
        expect(items).toHaveLength(1);
        expect(items[0].artifactId).toBe('art-123');
    });

    it('collects session file refs separately from artifact refs', () => {
        const message = {
            kind: 'tool-call' as const,
            id: 'm2',
            localId: null,
            createdAt: 1,
            children: [],
            tool: {
                name: 'file',
                state: 'completed' as const,
                input: {
                    ref: 'outputs/image.png',
                    name: 'image.png',
                    size: 10,
                    mimeType: 'image/png',
                    image: { width: 1, height: 1 },
                },
                createdAt: 1,
                startedAt: 1,
                completedAt: 1,
                description: null,
            },
        };

        const items = collectMessageDownloads(message);
        expect(items).toHaveLength(1);
        expect(items[0].source).toBe('file-ref');
        expect(items[0].artifactId).toBeUndefined();
        expect(items[0].ref).toBe('outputs/image.png');
        expect(items[0].mimeType).toBe('image/png');
    });
});
