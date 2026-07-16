import { describe, expect, it, vi } from 'vitest';

import { MessageQueue2 } from '@/utils/MessageQueue2';
import { enqueueCodexUserText } from './codexClearCommand';

describe('enqueueCodexUserText', () => {
    it('queues /clear in isolation instead of batching it into a model prompt', () => {
        const mode = { permissionMode: 'default' as const };
        const queue = {
            push: vi.fn(),
            pushIsolated: vi.fn(),
            pushIsolateAndClear: vi.fn(),
        };

        const result = enqueueCodexUserText({
            text: '  /clear  ',
            mode,
            queue,
        });

        expect(result).toBe('clear');
        expect(queue.pushIsolateAndClear).toHaveBeenCalledWith('  /clear  ', mode, undefined);
        expect(queue.push).not.toHaveBeenCalled();
    });

    it('passes attachments to normal queued messages', () => {
        const mode = { permissionMode: 'default' as const };
        const attachments = [{
            data: new Uint8Array([1, 2, 3]),
            mimeType: 'image/png',
            name: 'screen.png',
        }];
        const queue = {
            push: vi.fn(),
            pushIsolated: vi.fn(),
            pushIsolateAndClear: vi.fn(),
        };

        const result = enqueueCodexUserText({
            text: 'inspect this image',
            mode,
            queue,
            attachments,
        });

        expect(result).toBe('queued');
        expect(queue.push).toHaveBeenCalledWith('inspect this image', mode, attachments);
        expect(queue.pushIsolateAndClear).not.toHaveBeenCalled();
    });

    it('queues each voice message in isolation without clearing adjacent input', () => {
        const mode = { permissionMode: 'default' as const, voiceLocalId: 'voice-1' };
        const queue = {
            push: vi.fn(),
            pushIsolated: vi.fn(),
            pushIsolateAndClear: vi.fn(),
        };

        enqueueCodexUserText({ text: 'voice prompt', mode, queue, voiceMode: true });

        expect(queue.pushIsolated).toHaveBeenCalledWith('voice prompt', mode, undefined);
        expect(queue.push).not.toHaveBeenCalled();
        expect(queue.pushIsolateAndClear).not.toHaveBeenCalled();
    });

    it('drains normal -> voice -> voice -> normal as four provider batches', async () => {
        const queue = new MessageQueue2<{ voiceLocalId?: string }>(() => 'same-mode');
        enqueueCodexUserText({ text: 'normal before', mode: {}, queue });
        enqueueCodexUserText({ text: 'voice one', mode: { voiceLocalId: 'voice-1' }, queue, voiceMode: true });
        enqueueCodexUserText({ text: 'voice two', mode: { voiceLocalId: 'voice-2' }, queue, voiceMode: true });
        enqueueCodexUserText({ text: 'normal after', mode: {}, queue });

        const batches = [];
        while (queue.size() > 0) {
            batches.push(await queue.waitForMessagesAndGetAsString());
        }
        expect(batches).toEqual([
            expect.objectContaining({ message: 'normal before', isolate: false }),
            expect.objectContaining({ message: 'voice one', isolate: true, mode: { voiceLocalId: 'voice-1' } }),
            expect.objectContaining({ message: 'voice two', isolate: true, mode: { voiceLocalId: 'voice-2' } }),
            expect.objectContaining({ message: 'normal after', isolate: false }),
        ]);
    });

    it('passes attachments to isolated clear messages', () => {
        const mode = { permissionMode: 'default' as const };
        const attachments = [{
            data: new Uint8Array([4, 5, 6]),
            mimeType: 'image/jpeg',
            name: 'photo.jpg',
        }];
        const queue = {
            push: vi.fn(),
            pushIsolated: vi.fn(),
            pushIsolateAndClear: vi.fn(),
        };

        const result = enqueueCodexUserText({
            text: '/clear',
            mode,
            queue,
            attachments,
        });

        expect(result).toBe('clear');
        expect(queue.pushIsolateAndClear).toHaveBeenCalledWith('/clear', mode, attachments);
        expect(queue.push).not.toHaveBeenCalled();
    });
});
