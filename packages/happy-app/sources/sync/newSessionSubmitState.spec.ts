import { describe, expect, it } from 'vitest';
import { getNewSessionSubmitStatusText, isNewSessionSubmitting, type NewSessionSubmitStep } from './newSessionSubmitState';

describe('new session submit state', () => {
    it('marks only idle as not submitting', () => {
        const busySteps: NewSessionSubmitStep[] = [
            'creating-worktree',
            'spawning-session',
            'syncing-session',
            'sending-message',
            'navigating',
        ];

        expect(isNewSessionSubmitting('idle')).toBe(false);
        for (const step of busySteps) {
            expect(isNewSessionSubmitting(step)).toBe(true);
        }
    });

    it('returns concise status text for visible submit phases', () => {
        expect(getNewSessionSubmitStatusText('idle')).toBeNull();
        expect(getNewSessionSubmitStatusText('creating-worktree')).toBe('Creating worktree...');
        expect(getNewSessionSubmitStatusText('spawning-session')).toBe('Starting session on machine...');
        expect(getNewSessionSubmitStatusText('syncing-session')).toBe('Syncing session to this app...');
        expect(getNewSessionSubmitStatusText('sending-message')).toBe('Sending first message...');
        expect(getNewSessionSubmitStatusText('navigating')).toBe('Opening session...');
    });
});
