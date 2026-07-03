import { beforeEach, describe, expect, it, vi } from 'vitest';

const mmkvState = vi.hoisted(() => ({
    stores: new Map<string, Map<string, string>>(),
}));

vi.mock('react-native-mmkv', () => ({
    MMKV: class MockMMKV {
        private store: Map<string, string>;

        constructor(options?: { id?: string }) {
            const id = options?.id ?? 'default';
            let store = mmkvState.stores.get(id);
            if (!store) {
                store = new Map<string, string>();
                mmkvState.stores.set(id, store);
            }
            this.store = store;
        }

        getString(key: string): string | undefined {
            return this.store.get(key);
        }

        set(key: string, value: string): void {
            this.store.set(key, value);
        }

        delete(key: string): void {
            this.store.delete(key);
        }
    },
}));

async function loadServerConfig() {
    vi.resetModules();
    return import('./serverConfig');
}

describe('serverConfig', () => {
    beforeEach(() => {
        mmkvState.stores.clear();
        delete process.env.EXPO_PUBLIC_HAPPY_SERVER_URL;
        delete process.env.EXPO_PUBLIC_LOG_SERVER_URL;
        delete (globalThis as any).__HAPPY_CONFIG__;
    });

    describe('getServerUrl', () => {
        it('uses the production default when no override is configured', async () => {
            const { getServerUrl, isUsingCustomServer } = await loadServerConfig();

            expect(getServerUrl()).toBe('https://api.cluster-fluster.com');
            expect(isUsingCustomServer()).toBe(false);
        });

        it('uses EXPO_PUBLIC_HAPPY_SERVER_URL when no persisted or global override exists', async () => {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'https://env.example.com';
            const { getServerUrl, isUsingCustomServer } = await loadServerConfig();

            expect(getServerUrl()).toBe('https://env.example.com');
            expect(isUsingCustomServer()).toBe(true);
        });

        it('uses global config before EXPO_PUBLIC_HAPPY_SERVER_URL', async () => {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'https://env.example.com';
            (globalThis as any).__HAPPY_CONFIG__ = { serverUrl: 'https://global.example.com' };
            const { getServerUrl } = await loadServerConfig();

            expect(getServerUrl()).toBe('https://global.example.com');
        });

        it('uses persisted custom server URL before global and env config', async () => {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'https://env.example.com';
            (globalThis as any).__HAPPY_CONFIG__ = { serverUrl: 'https://global.example.com' };
            const { getServerUrl, setServerUrl } = await loadServerConfig();

            setServerUrl('  http://192.168.1.5:3005  ');

            expect(getServerUrl()).toBe('http://192.168.1.5:3005');
        });

        it('clears the persisted custom server URL and falls back to env config', async () => {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'https://env.example.com';
            const { getServerUrl, setServerUrl } = await loadServerConfig();

            setServerUrl('https://custom.example.com');
            expect(getServerUrl()).toBe('https://custom.example.com');

            setServerUrl(null);
            expect(getServerUrl()).toBe('https://env.example.com');

            setServerUrl('   ');
            expect(getServerUrl()).toBe('https://env.example.com');
        });
    });

    describe('getServerInfo', () => {
        it('returns hostname, port, and custom status for the resolved server URL', async () => {
            const { getServerInfo, setServerUrl } = await loadServerConfig();

            setServerUrl('http://192.168.1.5:3005');

            expect(getServerInfo()).toEqual({
                hostname: '192.168.1.5',
                port: 3005,
                isCustom: true,
            });
        });

        it('omits default ports from server info', async () => {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'https://happy.example.com';
            const { getServerInfo } = await loadServerConfig();

            expect(getServerInfo()).toEqual({
                hostname: 'happy.example.com',
                port: undefined,
                isCustom: true,
            });
        });
    });

    describe('validateServerUrl', () => {
        it('accepts http and https URLs', async () => {
            const { validateServerUrl } = await loadServerConfig();

            expect(validateServerUrl('http://localhost:3005')).toEqual({ valid: true });
            expect(validateServerUrl('https://api.example.com')).toEqual({ valid: true });
        });

        it('rejects empty, malformed, and non-http URLs', async () => {
            const { validateServerUrl } = await loadServerConfig();

            expect(validateServerUrl('')).toEqual({ valid: false, error: 'Server URL cannot be empty' });
            expect(validateServerUrl('   ')).toEqual({ valid: false, error: 'Server URL cannot be empty' });
            expect(validateServerUrl('not-a-url')).toEqual({ valid: false, error: 'Invalid URL format' });
            expect(validateServerUrl('ftp://example.com')).toEqual({
                valid: false,
                error: 'Server URL must use HTTP or HTTPS protocol',
            });
        });
    });

    describe('getLogServerUrl', () => {
        it('uses persisted log server URL before EXPO_PUBLIC_LOG_SERVER_URL', async () => {
            process.env.EXPO_PUBLIC_LOG_SERVER_URL = 'http://env-log.example.com';
            const { getLogServerUrl, setLogServerUrl } = await loadServerConfig();

            expect(getLogServerUrl()).toBe('http://env-log.example.com');

            setLogServerUrl('  http://192.168.1.5:8787  ');
            expect(getLogServerUrl()).toBe('http://192.168.1.5:8787');

            setLogServerUrl(null);
            expect(getLogServerUrl()).toBe('http://env-log.example.com');
        });
    });
});
