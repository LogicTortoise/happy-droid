import { describe, expect, it } from 'vitest';
import { MessageMetaSchema } from './typesMessageMeta';

describe('MessageMetaSchema', () => {
    it('accepts arbitrary permission mode keys', () => {
        const parsed = MessageMetaSchema.parse({
            permissionMode: 'team-custom-mode',
            model: 'custom-model',
            voiceMode: true,
        });

        expect(parsed.permissionMode).toBe('team-custom-mode');
        expect(parsed.model).toBe('custom-model');
        expect(parsed.voiceMode).toBe(true);
    });
});
