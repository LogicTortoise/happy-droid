import * as React from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isImageMimeType, sanitizeFileName } from '@/sync/attachments';
import { canDownloadFileItem, loadDownloadableFilePayload } from '@/sync/fileDownloads';
import type { DownloadableFileItem } from '@/sync/attachments';

export type ArtifactDownloadStatus = 'idle' | 'downloading' | 'saved' | 'error';

export interface ArtifactDownloadState {
    status: ArtifactDownloadStatus;
    uri: string | null;
    error: string | null;
    isImage: boolean;
}

export function useArtifactDownload(item: DownloadableFileItem, sessionId?: string | null) {
    const [state, setState] = React.useState<ArtifactDownloadState>({
        status: 'idle',
        uri: null,
        error: null,
        isImage: isImageMimeType(item.mimeType),
    });

    const download = React.useCallback(async () => {
        if (!canDownloadFileItem(item, sessionId)) {
            setState((current) => ({
                ...current,
                status: 'error',
                error: item.source === 'file-ref'
                    ? 'This file ref cannot be read from the current session.'
                    : 'Artifact id is missing.',
            }));
            return;
        }

        setState((current) => ({ ...current, status: 'downloading', error: null }));
        try {
            const payload = await loadDownloadableFilePayload(item, sessionId);

            const downloadsDir = new Directory(Paths.document, 'happy-downloads');
            downloadsDir.create({ idempotent: true, intermediates: true });

            const localName = buildLocalFileName(payload.sourceId, payload.name);
            const localFile = new File(downloadsDir, localName);
            localFile.create({ overwrite: true, intermediates: true });
            localFile.write(payload.bytes);

            setState({
                status: 'saved',
                uri: localFile.uri,
                error: null,
                isImage: isImageMimeType(payload.mimeType || item.mimeType),
            });
        } catch (error) {
            setState({
                status: 'error',
                uri: null,
                error: error instanceof Error ? error.message : 'Failed to download file.',
                isImage: isImageMimeType(item.mimeType),
            });
        }
    }, [item, sessionId]);

    const share = React.useCallback(async () => {
        if (!state.uri) {
            return;
        }
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(state.uri);
        }
    }, [state.uri]);

    return {
        state,
        download,
        share,
        canDownload: canDownloadFileItem(item, sessionId),
    };
}

function buildLocalFileName(artifactId: string, name: string): string {
    const safeName = sanitizeFileName(name);
    const prefix = artifactId.replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 8) || 'artifact';
    return `${prefix}-${safeName}`;
}
