import * as React from 'react';
// @ts-expect-error react-test-renderer is available in app dev dependencies without bundled types.
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTextMessage } from '@/sync/typesMessage';

const syncMock = vi.hoisted(() => ({
    credentials: { token: 'token', secret: 'secret' },
    getCredentials: vi.fn(),
    fetchArtifactWithBody: vi.fn(),
}));

vi.mock('@/sync/sync', () => ({
    sync: syncMock,
}));

vi.mock('@/text', () => ({
    t: (key: string) => ({
        'common.save': 'Save',
        'common.success': 'Success',
        'common.error': 'Error',
    }[key] ?? key),
}));

vi.mock('react-native', () => ({
    ActivityIndicator: (props: Record<string, unknown>) => React.createElement('ActivityIndicator', props),
    Modal: ({ children, visible, ...props }: Record<string, any>) => (
        visible ? React.createElement('Modal', { ...props, visible }, children) : null
    ),
    Pressable: ({ children, ...props }: Record<string, any>) => React.createElement('Pressable', props, children),
    Text: ({ children, ...props }: Record<string, any>) => React.createElement('Text', props, children),
    View: ({ children, ...props }: Record<string, any>) => React.createElement('View', props, children),
}));

vi.mock('expo-image', () => ({
    Image: (props: Record<string, unknown>) => React.createElement('ExpoImage', props),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: (props: Record<string, unknown>) => React.createElement('Icon', props),
}));

vi.mock('react-native-unistyles', () => {
    const theme = {
        colors: {
            button: { secondary: { tint: '#dddddd' } },
            divider: '#333333',
            surfaceHigh: '#222222',
            text: '#ffffff',
            textSecondary: '#aaaaaa',
            warning: '#ffcc00',
        },
    };
    return {
        StyleSheet: {
            create: (factory: any) => typeof factory === 'function' ? factory(theme) : factory,
        },
        useUnistyles: () => ({ theme }),
    };
});

describe('AgentFileReferenceDownloads integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncMock.getCredentials.mockReturnValue(syncMock.credentials);
        syncMock.fetchArtifactWithBody.mockResolvedValue({
            title: 'Agent Notes',
            body: '# Agent Notes',
        });
    });

    it('saves a file ref parsed from a normalized agent message', async () => {
        const { AgentFileReferenceDownloads } = await import('./AgentFileReferenceDownloads');
        const fileSystem = createMemoryFileSystem();
        const downloadAttachment = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
        const message: AgentTextMessage = {
            kind: 'agent-text',
            id: 'agent-message-1',
            localId: null,
            createdAt: 1,
            text: 'Download happy://file?ref=attachments%2Fsession-1%2Freport.pdf&name=report.pdf&mimeType=application%2Fpdf',
        };
        let renderer: any;

        await act(async () => {
            renderer = TestRenderer.create(React.createElement(AgentFileReferenceDownloads, {
                source: message,
                sessionId: 'session-1',
                deps: { downloadAttachment, fileSystem },
            }));
        });

        const saveButton = renderer.root.findByType('Pressable');
        await act(async () => {
            await saveButton.props.onPress();
        });

        expect(syncMock.getCredentials).toHaveBeenCalled();
        expect(downloadAttachment).toHaveBeenCalledWith(syncMock.credentials, 'session-1', 'attachments/session-1/report.pdf');
        expect(fileSystem.writes).toEqual([{
            uri: 'file:///documents/happy-agent-downloads/report.pdf',
            contents: 'AQID',
            options: { encoding: 'base64' },
        }]);
        expect(textContent(renderer.root)).toContain('Success: file:///documents/happy-agent-downloads/report.pdf');
        expect(renderer.root.findAllByType('ExpoImage')).toHaveLength(0);
    });

    it('shows a saved image thumbnail and opens a full-screen preview', async () => {
        const { AgentFileReferenceDownloads } = await import('./AgentFileReferenceDownloads');
        const fileSystem = createMemoryFileSystem();
        const downloadAttachment = vi.fn().mockResolvedValue(new Uint8Array([255, 216, 255]));
        let renderer: any;

        await act(async () => {
            renderer = TestRenderer.create(React.createElement(AgentFileReferenceDownloads, {
                source: 'happy://file?ref=attachments%2Fsession-1%2Fphoto.jpg&name=photo.jpg&mimeType=image%2Fjpeg',
                sessionId: 'session-1',
                deps: { downloadAttachment, fileSystem },
            }));
        });

        const saveButton = renderer.root.findByType('Pressable');
        await act(async () => {
            await saveButton.props.onPress();
        });

        expect(fileSystem.writes[0]).toMatchObject({
            uri: 'file:///documents/happy-agent-downloads/photo.jpg',
        });
        const thumbnail = renderer.root.findByProps({ accessibilityLabel: 'Preview photo.jpg' });
        expect(renderer.root.findAllByType('ExpoImage')).toHaveLength(1);
        expect(renderer.root.findByType('ExpoImage').props).toMatchObject({
            source: { uri: 'file:///documents/happy-agent-downloads/photo.jpg' },
            contentFit: 'cover',
        });

        await act(async () => {
            thumbnail.props.onPress();
        });

        const images = renderer.root.findAllByType('ExpoImage');
        expect(images).toHaveLength(2);
        expect(images[1].props).toMatchObject({
            source: { uri: 'file:///documents/happy-agent-downloads/photo.jpg' },
            contentFit: 'contain',
        });
        expect(renderer.root.findByType('Modal').props.visible).toBe(true);

        const close = renderer.root.findByProps({ accessibilityLabel: 'Close preview' });
        await act(async () => {
            close.props.onPress();
        });

        expect(renderer.root.findAllByType('Modal')).toHaveLength(0);
    });

    it('saves an artifact ref through sync.fetchArtifactWithBody', async () => {
        const { AgentFileReferenceDownloads } = await import('./AgentFileReferenceDownloads');
        const fileSystem = createMemoryFileSystem();
        let renderer: any;

        await act(async () => {
            renderer = TestRenderer.create(React.createElement(AgentFileReferenceDownloads, {
                source: { type: 'artifact', artifactId: 'artifact-1', title: 'Agent Notes' },
                sessionId: 'session-1',
                deps: { fileSystem },
            }));
        });

        const saveButton = renderer.root.findByType('Pressable');
        await act(async () => {
            await saveButton.props.onPress();
        });

        expect(syncMock.fetchArtifactWithBody).toHaveBeenCalledWith('artifact-1');
        expect(fileSystem.writes[0]).toMatchObject({
            uri: 'file:///documents/happy-agent-downloads/Agent%20Notes.md',
        });
        expect(textContent(renderer.root)).toContain('Success: file:///documents/happy-agent-downloads/Agent%20Notes.md');
    });
});

function textContent(node: any): string {
    return node.children.map((child: any) => {
        if (typeof child === 'string' || typeof child === 'number') {
            return String(child);
        }
        return textContent(child);
    }).join('');
}

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
