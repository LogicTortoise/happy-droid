import { describe, expect, it } from 'vitest';
import {
    createPendingNewSessionSubmission,
    normalizePendingNewSessionSubmission,
    resolveNewSessionSubmissionPlan,
} from './newSessionSubmissionRecovery';

describe('newSessionSubmissionRecovery', () => {
    it('creates a trimmed pending submission record', () => {
        expect(createPendingNewSessionSubmission(' session-1 ', '  hello agent  ', {
            now: 123,
            lastError: 'not ready',
        })).toEqual({
            sessionId: 'session-1',
            prompt: 'hello agent',
            createdAt: 123,
            lastError: 'not ready',
        });
    });

    it('drops invalid pending submission records', () => {
        expect(createPendingNewSessionSubmission('', 'hello')).toBeNull();
        expect(createPendingNewSessionSubmission('session-1', '   ')).toBeNull();
        expect(normalizePendingNewSessionSubmission({ sessionId: 'session-1' })).toBeNull();
    });

    it('normalizes persisted pending submissions', () => {
        expect(normalizePendingNewSessionSubmission({
            sessionId: ' session-1 ',
            prompt: ' retry this ',
            createdAt: 456,
            lastError: 'failed',
        })).toEqual({
            sessionId: 'session-1',
            prompt: 'retry this',
            createdAt: 456,
            lastError: 'failed',
        });
    });

    it('retries an already-created session before spawning another one', () => {
        const pending = createPendingNewSessionSubmission('session-1', 'original prompt', { now: 1 });

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
            prompt: 'edited prompt',
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
