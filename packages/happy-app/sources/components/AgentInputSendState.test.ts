import { describe, expect, it } from 'vitest';
import { resolveAgentInputSendGlyph } from './AgentInputSendState';

describe('resolveAgentInputSendGlyph', () => {
    it('shows send for attachment-only messages even when voice input is available', () => {
        expect(resolveAgentInputSendGlyph({
            isSendBlocked: false,
            hasText: false,
            hasAttachments: true,
            hasMicPress: true,
            isMicActive: false,
        })).toBe('send');
    });

    it('shows voice only for empty messages without pending attachments', () => {
        expect(resolveAgentInputSendGlyph({
            isSendBlocked: false,
            hasText: false,
            hasAttachments: false,
            hasMicPress: true,
            isMicActive: false,
        })).toBe('voice');
    });

    it('keeps blocked and sending states ahead of sendable content', () => {
        expect(resolveAgentInputSendGlyph({
            isSending: true,
            isSendBlocked: false,
            hasText: true,
            hasAttachments: true,
            hasMicPress: true,
        })).toBe('spinner');

        expect(resolveAgentInputSendGlyph({
            isSendBlocked: true,
            hasText: true,
            hasAttachments: true,
            hasMicPress: true,
        })).toBe('locked');
    });
});
