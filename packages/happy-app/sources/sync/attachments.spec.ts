import { describe, it, expect } from 'vitest';
import {
    buildAttachmentBody,
    parseAttachmentBody,
    formatBytes,
    formatAttachmentMarker,
    appendAttachmentMarkers,
    PickedFile,
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
