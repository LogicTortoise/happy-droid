import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildAttachmentBody, collectMessageDownloads, isImageMimeType } from './attachments';
import { canDownloadFileItem, loadDownloadableFilePayload } from './fileDownloads';
import type { DownloadableFileItem } from './attachments';

const decodeText = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

describe('file download payload loading', () => {
    it('loads bytes from an artifact attachment payload', async () => {
        const item: DownloadableFileItem = {
            id: 'artifact:art-1',
            source: 'artifact',
            artifactId: 'art-1',
            name: 'fallback.txt',
            mimeType: 'text/plain',
            size: 0,
        };

        const payload = await loadDownloadableFilePayload(item, 'session-1', {
            decode: decodeText,
            fetchArtifactWithBody: async () => ({
                body: buildAttachmentBody({
                    name: 'report.txt',
                    mimeType: 'text/plain',
                    size: 5,
                    base64: Buffer.from('hello').toString('base64'),
                }).body,
            }),
        });

        expect(payload.name).toBe('report.txt');
        expect(payload.mimeType).toBe('text/plain');
        expect(payload.size).toBe(5);
        expect(Buffer.from(payload.bytes).toString('utf8')).toBe('hello');
        expect(payload.sourceId).toBe('art-1');
    });

    it('loads bytes for a normal session file ref through readFile RPC', async () => {
        const item: DownloadableFileItem = {
            id: 'file-ref:outputs/photo.png',
            source: 'file-ref',
            ref: 'outputs/photo.png',
            name: 'photo.png',
            mimeType: 'image/png',
            size: 0,
            image: { width: 2, height: 2 },
        };

        const payload = await loadDownloadableFilePayload(item, 'session-1', {
            decode: decodeText,
            readSessionFile: async (sessionId, path) => {
                expect(sessionId).toBe('session-1');
                expect(path).toBe('outputs/photo.png');
                return {
                    success: true,
                    content: Buffer.from([137, 80, 78, 71]).toString('base64'),
                };
            },
        });

        expect(payload.name).toBe('photo.png');
        expect(payload.mimeType).toBe('image/png');
        expect(payload.size).toBe(4);
        expect(Array.from(payload.bytes)).toEqual([137, 80, 78, 71]);
        expect(payload.sourceId).toBe('outputs/photo.png');
    });

    it('reports file-ref downloadability based on session id and ref', () => {
        const item: DownloadableFileItem = {
            id: 'file-ref:outputs/report.pdf',
            source: 'file-ref',
            ref: 'outputs/report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            size: 123,
        };

        expect(canDownloadFileItem(item, 'session-1')).toBe(true);
        expect(canDownloadFileItem(item, null)).toBe(false);
        expect(canDownloadFileItem({ ...item, ref: undefined }, 'session-1')).toBe(false);
    });

    it('surfaces readFile failures for normal session file refs', async () => {
        const item: DownloadableFileItem = {
            id: 'file-ref:missing.png',
            source: 'file-ref',
            ref: 'missing.png',
            name: 'missing.png',
            mimeType: 'image/png',
            size: 0,
        };

        await expect(loadDownloadableFilePayload(item, 'session-1', {
            readSessionFile: async () => ({ success: false, error: 'not found' }),
        })).rejects.toThrow('not found');
    });

    it('covers normal file-ref from message item through local file bytes and image preview eligibility', async () => {
        const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const message = {
            kind: 'tool-call' as const,
            id: 'm-file',
            localId: null,
            createdAt: 1,
            children: [],
            tool: {
                name: 'file',
                state: 'completed' as const,
                input: {
                    ref: 'outputs/preview.png',
                    name: 'preview.png',
                    size: pngBytes.length,
                    mimeType: 'image/png',
                    image: { width: 2, height: 2, thumbhash: 'abc' },
                },
                createdAt: 1,
                startedAt: 1,
                completedAt: 1,
                description: 'Attached image: preview.png',
            },
        };

        const [item] = collectMessageDownloads(message);
        const payload = await loadDownloadableFilePayload(item, 'session-1', {
            decode: decodeText,
            readSessionFile: async () => ({
                success: true,
                content: Buffer.from(pngBytes).toString('base64'),
            }),
        });

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-file-ref-'));
        const savedPath = path.join(dir, payload.name);
        fs.writeFileSync(savedPath, payload.bytes);

        expect(fs.readFileSync(savedPath)).toEqual(Buffer.from(pngBytes));
        expect(isImageMimeType(payload.mimeType)).toBe(true);
    });
});
