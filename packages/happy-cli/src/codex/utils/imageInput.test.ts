import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui/logger', () => ({
    logger: { debug: vi.fn() },
}));

vi.mock('@/configuration', () => ({
    configuration: { happyHomeDir: '/home/test/.happy' },
}));

import { logger } from '@/ui/logger';
import {
    detectSupportedImageType,
    prepareCodexAttachmentInputItems,
    prepareCodexImageInputItems,
    resolveCodexImageCacheDir,
} from './imageInput';

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'happy-codex-image-input-'));
    tempDirs.push(dir);
    return dir;
}

function createStoredZip(entries: Record<string, string>): Uint8Array {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const [name, text] of Object.entries(entries)) {
        const nameBuffer = Buffer.from(name, 'utf8');
        const content = Buffer.from(text, 'utf8');
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(0, 14);
        local.writeUInt32LE(content.length, 18);
        local.writeUInt32LE(content.length, 22);
        local.writeUInt16LE(nameBuffer.length, 26);
        localParts.push(local, nameBuffer, content);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(0, 16);
        central.writeUInt32LE(content.length, 20);
        central.writeUInt32LE(content.length, 24);
        central.writeUInt16LE(nameBuffer.length, 28);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, nameBuffer);

        offset += local.length + nameBuffer.length + content.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(Object.keys(entries).length, 8);
    end.writeUInt16LE(Object.keys(entries).length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...localParts, centralDirectory, end]);
}

afterEach(async () => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()!;
        await rm(dir, { recursive: true, force: true });
    }
    vi.mocked(logger.debug).mockClear();
});

describe('detectSupportedImageType', () => {
    it('detects supported image formats by magic bytes', () => {
        expect(detectSupportedImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
            mimeType: 'image/png',
            extension: 'png',
        });
        expect(detectSupportedImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toEqual({
            mimeType: 'image/jpeg',
            extension: 'jpg',
        });
        expect(detectSupportedImageType(new TextEncoder().encode('GIF89a'))).toEqual({
            mimeType: 'image/gif',
            extension: 'gif',
        });
        expect(detectSupportedImageType(new Uint8Array([
            0x52, 0x49, 0x46, 0x46,
            0x00, 0x00, 0x00, 0x00,
            0x57, 0x45, 0x42, 0x50,
        ]))).toEqual({
            mimeType: 'image/webp',
            extension: 'webp',
        });
    });

    it('rejects unsupported bytes', () => {
        expect(detectSupportedImageType(new TextEncoder().encode('not an image'))).toBeNull();
    });
});

describe('prepareCodexImageInputItems', () => {
    it('writes supported images with generated names and returns localImage items', async () => {
        const cacheRootDir = await makeTempDir();
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

        const result = await prepareCodexImageInputItems([{
            data: pngBytes,
            mimeType: 'image/heic',
            name: '../../original name.heic',
        }], {
            cacheRootDir,
            sessionId: 'session-1',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0].type).toBe('localImage');
        if (result.inputItems[0].type === 'localImage') {
            expect(result.inputItems[0].path).toContain(join(cacheRootDir, 'session-1'));
            expect(result.inputItems[0].path).toMatch(/\.png$/);
            expect(result.inputItems[0].path).not.toContain('original name');
            expect(new Uint8Array(await readFile(result.inputItems[0].path))).toEqual(pngBytes);
        }
    });

    it('uses restrictive permissions for plaintext cache files on POSIX', async () => {
        const cacheRootDir = await makeTempDir();
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

        const result = await prepareCodexImageInputItems([{
            data: pngBytes,
            mimeType: 'image/png',
            name: 'image.png',
        }], {
            cacheRootDir,
            sessionId: 'session-permissions',
        });

        expect(result.inputItems).toHaveLength(1);
        if (process.platform === 'win32' || result.inputItems[0].type !== 'localImage') {
            return;
        }

        expect((await stat(join(cacheRootDir, 'session-permissions'))).mode & 0o777).toBe(0o700);
        expect((await stat(result.inputItems[0].path)).mode & 0o777).toBe(0o600);
    });

    it('skips unsupported images without writing fallback files', async () => {
        const cacheRootDir = await makeTempDir();
        const sensitiveName = 'https://upload.example.test/presigned?token=secret';

        const result = await prepareCodexImageInputItems([{
            data: new TextEncoder().encode('not an image'),
            mimeType: 'image/png',
            name: sensitiveName,
        }], {
            cacheRootDir,
            sessionId: 'session-2',
        });

        expect(result).toEqual({
            inputItems: [],
            skipped: 1,
        });
        expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(sensitiveName);
    });

    it('skips images when cache writes fail', async () => {
        const cacheRootDir = await makeTempDir();
        const fileRoot = join(cacheRootDir, 'not-a-directory');
        await writeFile(fileRoot, 'occupied');
        const sensitiveName = 'data:image/png;base64,secret';

        const result = await prepareCodexImageInputItems([{
            data: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]),
            mimeType: 'image/jpeg',
            name: sensitiveName,
        }], {
            cacheRootDir: fileRoot,
            sessionId: 'session-3',
        });

        expect(result).toEqual({
            inputItems: [],
            skipped: 1,
        });
        expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(fileRoot);
        expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(sensitiveName);
    });
});

describe('prepareCodexAttachmentInputItems', () => {
    it('keeps supported images as localImage inputs', async () => {
        const cacheRootDir = await makeTempDir();
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

        const result = await prepareCodexAttachmentInputItems([{
            data: pngBytes,
            mimeType: 'image/heic',
            name: 'photo.heic',
        }], {
            cacheRootDir,
            sessionId: 'session-attachment-image',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0].type).toBe('localImage');
    });

    it('inlines text file attachments for Codex consumption', async () => {
        const result = await prepareCodexAttachmentInputItems([{
            data: new TextEncoder().encode('hello from a note'),
            mimeType: 'text/plain',
            name: 'note.txt',
        }], {
            cacheRootDir: await makeTempDir(),
            sessionId: 'session-text',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0]).toMatchObject({
            type: 'text',
            text: expect.stringContaining('hello from a note'),
        });
        expect(result.inputItems[0]).toMatchObject({
            text: expect.stringContaining('note.txt'),
        });
    });

    it('extracts PDF text instead of sending an unsupported notice', async () => {
        const pdf = [
            '%PDF-1.7',
            '1 0 obj',
            '<< /Length 44 >>',
            'stream',
            'BT /F1 12 Tf 72 712 Td (Quarterly PDF text) Tj ET',
            'endstream',
            'endobj',
            '%%EOF',
        ].join('\n');

        const result = await prepareCodexAttachmentInputItems([{
            data: new TextEncoder().encode(pdf),
            mimeType: 'application/pdf',
            name: 'report.pdf',
        }], {
            cacheRootDir: await makeTempDir(),
            sessionId: 'session-pdf',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0]).toMatchObject({
            type: 'text',
            text: expect.stringContaining('report.pdf'),
        });
        expect(result.inputItems[0]).toMatchObject({
            text: expect.stringContaining('Quarterly PDF text'),
        });
    });

    it('extracts Office Open XML document text', async () => {
        const docx = createStoredZip({
            'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>DOCX body text</w:t></w:r></w:p></w:body></w:document>',
        });

        const result = await prepareCodexAttachmentInputItems([{
            data: docx,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            name: 'notes.docx',
        }], {
            cacheRootDir: await makeTempDir(),
            sessionId: 'session-docx',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0]).toMatchObject({
            type: 'text',
            text: expect.stringContaining('DOCX body text'),
        });
    });

    it('passes unknown binary document content as base64 instead of only a notice', async () => {
        const result = await prepareCodexAttachmentInputItems([{
            data: new Uint8Array([0, 1, 2, 3, 4, 5]),
            mimeType: 'application/octet-stream',
            name: 'archive.bin',
        }], {
            cacheRootDir: await makeTempDir(),
            sessionId: 'session-binary',
        });

        expect(result.skipped).toBe(0);
        expect(result.inputItems).toHaveLength(1);
        expect(result.inputItems[0]).toMatchObject({
            type: 'text',
            text: expect.stringContaining('AAECAwQF'),
        });
        expect(result.inputItems[0]).toMatchObject({
            text: expect.not.stringContaining('cannot extract text'),
        });
    });
});

describe('resolveCodexImageCacheDir', () => {
    it('uses the explicit cache root when provided', () => {
        expect(resolveCodexImageCacheDir({
            cacheRootDir: '/tmp/happy-cache',
            sessionId: 'session-1',
        })).toBe('/tmp/happy-cache/session-1');
    });

    it('defaults to Happy local state instead of arbitrary OS temp', () => {
        expect(resolveCodexImageCacheDir({
            sessionId: 'session-4',
        })).toBe('/home/test/.happy/codex-image-cache/session-4');
    });

    it('keeps malformed session ids inside the cache root', () => {
        const cacheRootDir = '/tmp/happy-cache';

        const resolved = resolveCodexImageCacheDir({
            cacheRootDir,
            sessionId: '../outside/nested',
        });

        expect(resolved.startsWith(`${cacheRootDir}${sep}`)).toBe(true);
        expect(resolved).not.toContain('..');
    });
});
