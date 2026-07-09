import { beforeAll, describe, expect, it, vi } from 'vitest';
import { encodeBase64 } from '@/encryption/base64';
import type { DownloadedAgentFile } from './agentFileDownloads';

vi.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///documents',
    EncodingType: { Base64: 'base64' },
    getInfoAsync: vi.fn(),
    makeDirectoryAsync: vi.fn(),
    writeAsStringAsync: vi.fn(),
}));

const credentials = {
    token: 'token',
    secret: 'secret',
};

let agentFileDownloads: typeof import('./agentFileDownloads');

beforeAll(async () => {
    agentFileDownloads = await import('./agentFileDownloads');
});

describe('parseAgentFileReferences', () => {
    it('parses file events and artifact refs from nested agent output', () => {
        const refs = agentFileDownloads.parseAgentFileReferences({
            ev: {
                t: 'file',
                ref: 'attachments/session-1/report.pdf',
                name: 'report.pdf',
                mimeType: 'application/pdf',
                size: 1234,
            },
            text: 'See [draft](happy://artifact/artifact_123?name=Draft.md) and artifact:artifact_456',
        });

        expect(refs).toEqual([
            {
                kind: 'file',
                ref: 'attachments/session-1/report.pdf',
                name: 'report.pdf',
                mimeType: 'application/pdf',
                size: 1234,
                sessionId: undefined,
            },
            {
                kind: 'artifact',
                artifactId: 'artifact_123',
                name: 'Draft.md',
                mimeType: 'text/markdown; charset=utf-8',
            },
            {
                kind: 'artifact',
                artifactId: 'artifact_456',
                name: 'artifact-artifact_456.md',
                mimeType: 'text/markdown; charset=utf-8',
            },
        ]);
    });

    it('parses JSON strings and happy file URLs with session metadata', () => {
        const refs = agentFileDownloads.parseAgentFileReferences(JSON.stringify({
            type: 'file',
            ref: 'attachments/session-2/data.json',
            name: 'data.json',
            sessionId: 'session-2',
            mimeType: 'application/json',
            size: 42,
        }) + '\n' + 'happy://file?ref=attachments%2Fsession-3%2Fnotes.txt&name=notes.txt&sessionId=session-3&mimeType=text%2Fplain&size=9');

        expect(refs).toEqual([
            {
                kind: 'file',
                ref: 'attachments/session-2/data.json',
                name: 'data.json',
                sessionId: 'session-2',
                mimeType: 'application/json',
                size: 42,
            },
            {
                kind: 'file',
                ref: 'attachments/session-3/notes.txt',
                name: 'notes.txt',
                sessionId: 'session-3',
                mimeType: 'text/plain',
                size: 9,
            },
        ]);
    });
});

describe('downloadAndSaveAgentFileReference', () => {
    it('downloads a file ref through the attachment API and saves bytes locally', async () => {
        const fileSystem = createMemoryFileSystem();
        const downloadAttachment = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

        const saved = await agentFileDownloads.downloadAndSaveAgentFileReference({
            kind: 'file',
            ref: 'attachments/session-1/report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
        }, {
            credentials,
            defaultSessionId: 'session-1',
            downloadAttachment,
            fileSystem,
        });

        expect(downloadAttachment).toHaveBeenCalledWith(credentials, 'session-1', 'attachments/session-1/report.pdf');
        expect(saved).toEqual({
            reference: {
                kind: 'file',
                ref: 'attachments/session-1/report.pdf',
                name: 'report.pdf',
                mimeType: 'application/pdf',
            },
            uri: 'file:///documents/happy-agent-downloads/report.pdf',
            name: 'report.pdf',
            mimeType: 'application/pdf',
            size: 3,
        });
        expect(fileSystem.writes).toEqual([{
            uri: 'file:///documents/happy-agent-downloads/report.pdf',
            contents: 'AQID',
            options: { encoding: 'base64' },
        }]);
    });

    it('saves artifact body refs as markdown files', async () => {
        const fileSystem = createMemoryFileSystem();
        const saved = await agentFileDownloads.downloadAndSaveAgentFileReference({
            kind: 'artifact',
            artifactId: 'artifact-1',
            name: 'Plan',
        }, {
            credentials,
            fetchArtifactBody: vi.fn().mockResolvedValue({
                title: 'Plan',
                body: '# Plan\n\nShip it.',
            }),
            fileSystem,
        });

        expect(saved.uri).toBe('file:///documents/happy-agent-downloads/Plan.md');
        expect(saved.mimeType).toBe('text/markdown; charset=utf-8');
        expect(fileSystem.writes[0].contents).toBe(encodeBase64(new TextEncoder().encode('# Plan\n\nShip it.')));
    });

    it('uses a numbered filename when the target already exists', async () => {
        const fileSystem = createMemoryFileSystem([
            'file:///documents/happy-agent-downloads/report.pdf',
        ]);
        const downloaded: DownloadedAgentFile = {
            reference: {
                kind: 'file',
                ref: 'attachments/session-1/report.pdf',
                name: 'report.pdf',
            },
            name: 'report.pdf',
            mimeType: 'application/pdf',
            bytes: new Uint8Array([9]),
        };

        const saved = await agentFileDownloads.saveDownloadedAgentFile(downloaded, { fileSystem });

        expect(saved.uri).toBe('file:///documents/happy-agent-downloads/report%20(1).pdf');
        expect(saved.name).toBe('report (1).pdf');
    });
});

describe('sanitizeFileName', () => {
    it('removes path separators and illegal filename characters', () => {
        expect(agentFileDownloads.sanitizeFileName('../bad/report:final?.pdf')).toBe('.._bad_report_final_.pdf');
        expect(agentFileDownloads.sanitizeFileName('   ')).toBe('download');
    });
});

function createMemoryFileSystem(existingUris: string[] = []) {
    const existing = new Set(existingUris);
    const writes: Array<{ uri: string; contents: string; options: unknown }> = [];
    return {
        documentDirectory: 'file:///documents',
        base64Encoding: 'base64' as any,
        writes,
        getInfoAsync: vi.fn(async (uri: string) => ({ exists: existing.has(uri) })),
        makeDirectoryAsync: vi.fn(async (uri: string) => {
            existing.add(uri);
        }),
        writeAsStringAsync: vi.fn(async (uri: string, contents: string, options: unknown) => {
            writes.push({ uri, contents, options });
            existing.add(uri);
        }),
    };
}
