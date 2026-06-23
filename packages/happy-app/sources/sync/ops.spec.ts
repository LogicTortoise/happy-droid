import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiSocketMock = vi.hoisted(() => ({
    machineRPC: vi.fn(),
    sessionRPC: vi.fn(),
    emitWithAck: vi.fn(),
}));

vi.mock('./apiSocket', () => ({
    apiSocket: apiSocketMock,
}));

vi.mock('./sync', () => ({
    sync: {
        encryption: {
            getMachineEncryption: vi.fn(),
        },
    },
}));

describe('session machine operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('spawns a daemon-backed session through machine RPC', async () => {
        apiSocketMock.machineRPC.mockResolvedValueOnce({
            type: 'success',
            sessionId: 'session-123',
        });
        const { machineSpawnNewSession } = await import('./ops');

        const result = await machineSpawnNewSession({
            machineId: 'machine-1',
            directory: '/Users/me/project',
            approvedNewDirectoryCreation: true,
            token: 'token-abc',
            agent: 'claude',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'session-123' });
        expect(apiSocketMock.machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'spawn-happy-session',
            {
                type: 'spawn-in-directory',
                directory: '/Users/me/project',
                approvedNewDirectoryCreation: true,
                token: 'token-abc',
                agent: 'claude',
            },
        );
    });

    it('uses safe spawn defaults when optional fields are omitted', async () => {
        apiSocketMock.machineRPC.mockResolvedValueOnce({
            type: 'success',
            sessionId: 'session-defaults',
        });
        const { machineSpawnNewSession } = await import('./ops');

        await machineSpawnNewSession({
            machineId: 'machine-2',
            directory: '~/repo',
        });

        expect(apiSocketMock.machineRPC).toHaveBeenCalledWith(
            'machine-2',
            'spawn-happy-session',
            {
                type: 'spawn-in-directory',
                directory: '~/repo',
                approvedNewDirectoryCreation: false,
                token: undefined,
                agent: undefined,
            },
        );
    });

    it('returns an error result when spawn RPC fails', async () => {
        apiSocketMock.machineRPC.mockRejectedValueOnce(new Error('daemon offline'));
        const { machineSpawnNewSession } = await import('./ops');

        await expect(machineSpawnNewSession({
            machineId: 'machine-3',
            directory: '/tmp/project',
        })).resolves.toEqual({
            type: 'error',
            errorMessage: 'daemon offline',
        });
    });

    it('resumes a session through the daemon machine RPC', async () => {
        apiSocketMock.machineRPC.mockResolvedValueOnce({
            type: 'success',
            sessionId: 'session-123',
        });
        const { machineResumeSession } = await import('./ops');

        const result = await machineResumeSession({
            machineId: 'machine-1',
            sessionId: 'session-123',
        });

        expect(result).toEqual({ type: 'success', sessionId: 'session-123' });
        expect(apiSocketMock.machineRPC).toHaveBeenCalledWith(
            'machine-1',
            'resume-happy-session',
            { sessionId: 'session-123' },
        );
    });
});
