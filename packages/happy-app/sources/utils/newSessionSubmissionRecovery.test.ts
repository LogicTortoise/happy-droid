import { describe, expect, it } from 'vitest';
import {
    createPendingNewSessionSubmission,
    normalizePendingNewSessionSubmission,
    resolveNewSessionSubmissionPlan,
} from './newSessionSubmissionRecovery';

describe('newSessionSubmissionRecovery', () => {
    it('creates a trimmed pending submission record', () => {
        expect(createPendingNewSessionSubmission(' session-1 ', '  hello agent  ', {
            localId: ' local-1 ',
            now: 123,
            lastError: 'not ready',
        })).toEqual({
            sessionId: 'session-1',
            prompt: 'hello agent',
            localId: 'local-1',
            status: 'failed',
            createdAt: 123,
            lastError: 'not ready',
        });
    });

    it('drops invalid pending submission records', () => {
        expect(createPendingNewSessionSubmission('', 'hello', { localId: 'local-1' })).toBeNull();
        expect(createPendingNewSessionSubmission('session-1', '   ', { localId: 'local-1' })).toBeNull();
        expect(createPendingNewSessionSubmission('session-1', 'hello', { localId: '   ' })).toBeNull();
        expect(normalizePendingNewSessionSubmission({ sessionId: 'session-1', prompt: 'hello' })).toBeNull();
    });

    it('normalizes persisted pending submissions', () => {
        expect(normalizePendingNewSessionSubmission({
            sessionId: ' session-1 ',
            prompt: ' retry this ',
            localId: ' local-2 ',
            status: 'pending',
            createdAt: 456,
            lastError: 'failed',
        })).toEqual({
            sessionId: 'session-1',
            prompt: 'retry this',
            localId: 'local-2',
            status: 'failed',
            createdAt: 456,
            lastError: 'failed',
        });
    });

    it('requires a persisted localId before a pending submission can be retried', () => {
        expect(normalizePendingNewSessionSubmission({
            sessionId: 'session-1',
            prompt: 'already sent maybe',
            createdAt: 789,
        })).toBeNull();
    });

    it('retries an already-created session before spawning another one', () => {
        const pending = createPendingNewSessionSubmission('session-1', 'original prompt', {
            localId: 'local-3',
            now: 1,
        });

        expect(resolveNewSessionSubmissionPlan({
            pendingSubmission: pending,
            currentInput: '',
        })).toEqual({
            type: 'retry-pending',
            sessionId: 'session-1',
            prompt: 'original prompt',
        });

        expect(resolveNewSessionSubmissionPlan({
            pendingSubmission: pending,
            currentInput: ' edited prompt ',
        })).toEqual({
            type: 'retry-pending',
            sessionId: 'session-1',
            prompt: 'original prompt',
        });
    });

    it('keeps retry idempotent by preserving the original pending prompt identity', () => {
        const pending = normalizePendingNewSessionSubmission({
            sessionId: 'session-1',
            prompt: 'first prompt',
            localId: 'local-idempotent',
            status: 'failed',
            createdAt: 1,
            lastError: 'timeout',
        });

        expect(pending?.localId).toBe('local-idempotent');
        expect(resolveNewSessionSubmissionPlan({
            pendingSubmission: pending,
            currentInput: 'different text typed after restart',
        })).toEqual({
            type: 'retry-pending',
            sessionId: 'session-1',
            prompt: 'first prompt',
        });
    });

    it('spawns a new session when no recovery submission exists', () => {
        expect(resolveNewSessionSubmissionPlan({
            pendingSubmission: null,
            currentInput: ' hello ',
        })).toEqual({
            type: 'spawn-new',
            prompt: 'hello',
        });
    });
});
