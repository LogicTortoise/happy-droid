import { describe, expect, it } from 'vitest';

import {
    getAttachmentSendPlan,
    getImageAttachmentSendPlan,
    supportsAttachmentsForFlavor,
    supportsImageAttachmentsForFlavor,
} from './attachmentSupport';

describe('supportsAttachmentsForFlavor', () => {
    it('supports legacy sessions, Claude, and Codex', () => {
        expect(supportsAttachmentsForFlavor(undefined)).toBe(true);
        expect(supportsAttachmentsForFlavor(null)).toBe(true);
        expect(supportsAttachmentsForFlavor('claude')).toBe(true);
        expect(supportsAttachmentsForFlavor('codex')).toBe(true);
    });

    it('rejects Gemini, OpenClaw, and unknown explicit flavors', () => {
        expect(supportsAttachmentsForFlavor('gemini')).toBe(false);
        expect(supportsAttachmentsForFlavor('openclaw')).toBe(false);
        expect(supportsAttachmentsForFlavor('custom-agent')).toBe(false);
    });

    it('keeps legacy image-named exports as aliases', () => {
        expect(supportsImageAttachmentsForFlavor).toBe(supportsAttachmentsForFlavor);
        expect(getImageAttachmentSendPlan).toBe(getAttachmentSendPlan);
    });
});

describe('getAttachmentSendPlan', () => {
    it('uses attachments and sends text for Codex', () => {
        expect(getAttachmentSendPlan({
            flavor: 'codex',
            text: '',
            attachmentCount: 1,
        })).toEqual({
            supportsAttachments: true,
            shouldUseAttachments: true,
            shouldShowUnsupportedAlert: false,
            shouldSendText: true,
        });
    });

    it('warns but still sends non-empty text for unsupported agents', () => {
        expect(getAttachmentSendPlan({
            flavor: 'gemini',
            text: 'describe this',
            attachmentCount: 1,
        })).toEqual({
            supportsAttachments: false,
            shouldUseAttachments: false,
            shouldShowUnsupportedAlert: true,
            shouldSendText: true,
        });
    });

    it('warns and sends nothing for unsupported image-only messages', () => {
        expect(getAttachmentSendPlan({
            flavor: 'openclaw',
            text: '   ',
            attachmentCount: 2,
        })).toEqual({
            supportsAttachments: false,
            shouldUseAttachments: false,
            shouldShowUnsupportedAlert: true,
            shouldSendText: false,
        });
    });
});
