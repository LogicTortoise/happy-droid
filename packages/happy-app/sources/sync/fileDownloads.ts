import { decodeBase64 } from '@/encryption/base64';
import { parseAttachmentBody } from './attachments';
import type { DecryptedArtifact } from './artifactTypes';
import type { DownloadableFileItem } from './attachments';

export interface DownloadableFilePayload {
    name: string;
    mimeType: string;
    size: number;
    bytes: Uint8Array;
    sourceId: string;
}

export interface FileDownloadDeps {
    fetchArtifactWithBody?: (artifactId: string) => Promise<Pick<DecryptedArtifact, 'body'> | null>;
    readSessionFile?: (sessionId: string, path: string) => Promise<{
        success: boolean;
        content?: string;
        error?: string;
    }>;
    decode?: (base64: string) => Uint8Array;
}

export async function loadDownloadableFilePayload(
    item: DownloadableFileItem,
    sessionId: string | null | undefined,
    deps: FileDownloadDeps = {}
): Promise<DownloadableFilePayload> {
    const decode = deps.decode ?? ((base64: string) => decodeBase64(base64, 'base64'));

    if (item.source === 'artifact') {
        if (!item.artifactId) {
            throw new Error('Artifact id is missing.');
        }
        const fetchArtifactWithBody = deps.fetchArtifactWithBody ?? defaultFetchArtifactWithBody;
        const artifact = await fetchArtifactWithBody(item.artifactId);
        const file = parseAttachmentBody({ body: artifact?.body ?? null });
        if (!file) {
            throw new Error('Artifact is not a downloadable file payload.');
        }
        const bytes = decode(file.base64);
        return {
            name: file.name || item.name,
            mimeType: file.mimeType || item.mimeType,
            size: file.size || bytes.length,
            bytes,
            sourceId: item.artifactId,
        };
    }

    if (!sessionId) {
        throw new Error('Session id is required to download this file ref.');
    }
    if (!item.ref) {
        throw new Error('File ref is missing.');
    }

    const readSessionFile = deps.readSessionFile ?? defaultReadSessionFile;
    const response = await readSessionFile(sessionId, item.ref);
    if (!response.success || !response.content) {
        throw new Error(response.error || 'Failed to read file ref from session.');
    }

    const bytes = decode(response.content);
    return {
        name: item.name,
        mimeType: item.mimeType || 'application/octet-stream',
        size: item.size > 0 ? item.size : bytes.length,
        bytes,
        sourceId: item.ref,
    };
}

export function canDownloadFileItem(item: DownloadableFileItem, sessionId: string | null | undefined): boolean {
    if (item.source === 'artifact') {
        return !!item.artifactId;
    }
    return !!sessionId && !!item.ref;
}

async function defaultFetchArtifactWithBody(artifactId: string): Promise<Pick<DecryptedArtifact, 'body'> | null> {
    const { sync } = await import('./sync');
    return sync.fetchArtifactWithBody(artifactId);
}

async function defaultReadSessionFile(sessionId: string, path: string): Promise<{
    success: boolean;
    content?: string;
    error?: string;
}> {
    const { sessionReadFile } = await import('./ops');
    return sessionReadFile(sessionId, path);
}
