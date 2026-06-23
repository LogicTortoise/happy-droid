import { beforeEach, describe, expect, it, vi } from 'vitest';

const mmkvMock = vi.hoisted(() => ({
    stores: new Map<string, Map<string, string>>(),
}));

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        private store: Map<string, string>;

        constructor(options: { id?: string } = {}) {
            const id = options.id || 'default';
            let store = mmkvMock.stores.get(id);
            if (!store) {
                store = new Map<string, string>();
                mmkvMock.stores.set(id, store);
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
        mmkvMock.stores.clear();
        delete process.env.EXPO_PUBLIC_HAPPY_SERVER_URL;
        delete process.env.EXPO_PUBLIC_LOG_SERVER_URL;
    });

    it('falls back to the default Happy production server', async () => {
        const { getServerUrl, getServerInfo, isUsingCustomServer } = await loadServerConfig();

        expect(getServerUrl()).toBe('https://api.cluster-fluster.com');
        expect(isUsingCustomServer()).toBe(false);
        expect(getServerInfo()).toEqual({
            hostname: 'api.cluster-fluster.com',
            port: undefined,
            isCustom: false,
        });
    });

    it('uses EXPO_PUBLIC_HAPPY_SERVER_URL when no runtime override exists', async () => {
        process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'http://localhost:3005';

        const { getServerUrl, getServerInfo, isUsingCustomServer } = await loadServerConfig();

        expect(getServerUrl()).toBe('http://localhost:3005');
        expect(isUsingCustomServer()).toBe(true);
        expect(getServerInfo()).toEqual({
            hostname: 'localhost',
            port: 3005,
            isCustom: true,
        });
    });

    it('prefers MMKV runtime override over EXPO_PUBLIC_HAPPY_SERVER_URL', async () => {
        process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'http://localhost:3005';

        const { getServerUrl, setServerUrl } = await loadServerConfig();

        setServerUrl(' https://device.example.test ');
        expect(getServerUrl()).toBe('https://device.example.test');

        setServerUrl(null);
        expect(getServerUrl()).toBe('http://localhost:3005');
    });

    it('uses the configured log server with the same env/MMKV pattern', async () => {
        process.env.EXPO_PUBLIC_LOG_SERVER_URL = 'http://localhost:3999';

        const { getLogServerUrl, setLogServerUrl } = await loadServerConfig();

        expect(getLogServerUrl()).toBe('http://localhost:3999');
        setLogServerUrl(' http://device.example.test/logs ');
        expect(getLogServerUrl()).toBe('http://device.example.test/logs');
        setLogServerUrl(null);
        expect(getLogServerUrl()).toBe('http://localhost:3999');
    });

    it('validates only non-empty HTTP(S) server URLs', async () => {
        const { validateServerUrl } = await loadServerConfig();

        expect(validateServerUrl('https://api.cluster-fluster.com')).toEqual({ valid: true });
        expect(validateServerUrl('http://localhost:3005')).toEqual({ valid: true });
        expect(validateServerUrl('')).toEqual({
            valid: false,
            error: 'Server URL cannot be empty',
        });
        expect(validateServerUrl('ftp://localhost:3005')).toEqual({
            valid: false,
            error: 'Server URL must use HTTP or HTTPS protocol',
        });
        expect(validateServerUrl('not a url')).toEqual({
            valid: false,
            error: 'Invalid URL format',
        });
    });
});
