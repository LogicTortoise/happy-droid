import * as React from 'react';
// @ts-expect-error react-test-renderer is available in the app dev dependencies without bundled types.
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { AttachmentPreview } from '@/sync/attachmentTypes';

vi.mock('react-native', () => ({
    Pressable: ({ children, ...props }: Record<string, any>) => React.createElement('Pressable', props, children),
    ScrollView: ({ children, ...props }: Record<string, any>) => React.createElement('ScrollView', props, children),
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
            divider: '#333333',
            surfaceHigh: '#222222',
            text: '#ffffff',
            textSecondary: '#cccccc',
        },
    };
    return {
        StyleSheet: {
            create: (factory: any) => typeof factory === 'function' ? factory(theme) : factory,
        },
        useUnistyles: () => ({ theme }),
    };
});

vi.mock('@/utils/thumbhash', () => ({
    thumbhashToDataUri: (value: string) => `data:image/thumbhash,${value}`,
}));

const imageAttachment: AttachmentPreview = {
    id: 'image-1',
    uri: 'file:///tmp/photo.jpg',
    width: 640,
    height: 480,
    mimeType: 'image/jpeg',
    size: 1234,
    name: 'photo.jpg',
    thumbhash: 'thumbhash-value',
};

const fileAttachment: AttachmentPreview = {
    id: 'file-1',
    uri: 'file:///tmp/report.pdf',
    width: 0,
    height: 0,
    mimeType: 'application/pdf',
    size: 5678,
    name: 'report.pdf',
};

function textContent(node: any): string {
    return node.children.map((child: any) => {
        if (typeof child === 'string' || typeof child === 'number') {
            return String(child);
        }
        return textContent(child);
    }).join('');
}

describe('AgentInputAttachmentStrip', () => {
    it('renders image thumbnails and generic file tiles in the pending attachment strip', async () => {
        const { AgentInputAttachmentStrip } = await import('./AgentInputAttachmentStrip');
        let renderer: any;

        await act(async () => {
            renderer = TestRenderer.create(React.createElement(AgentInputAttachmentStrip, {
                attachments: [imageAttachment, fileAttachment],
                onRemove: vi.fn(),
            }));
        });

        const root = renderer!.root;
        const images = root.findAllByType('ExpoImage');
        expect(images).toHaveLength(1);
        expect(images[0].props.source).toEqual({ uri: 'file:///tmp/photo.jpg' });
        expect(images[0].props.placeholder).toEqual({ uri: 'data:image/thumbhash,thumbhash-value' });

        expect(textContent(root)).toContain('report.pdf');
        const fileIcons = root.findAllByType('Icon')
            .filter((node: any) => node.props.name === 'document-text-outline');
        expect(fileIcons).toHaveLength(1);
    });

    it('removes the selected attachment by id', async () => {
        const { AgentInputAttachmentStrip } = await import('./AgentInputAttachmentStrip');
        const onRemove = vi.fn();
        let renderer: any;

        await act(async () => {
            renderer = TestRenderer.create(React.createElement(AgentInputAttachmentStrip, {
                attachments: [imageAttachment, fileAttachment],
                onRemove,
            }));
        });

        const removeButtons = renderer!.root.findAllByType('Pressable');
        removeButtons[1].props.onPress();

        expect(onRemove).toHaveBeenCalledWith('file-1');
    });
});
