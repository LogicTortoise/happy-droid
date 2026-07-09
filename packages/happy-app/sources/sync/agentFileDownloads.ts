import { AuthCredentials } from '@/auth/tokenStorage';
import { encodeBase64 } from '@/encryption/base64';

declare const require: (id: string) => any;

export type AgentFileReference =
    | {
        kind: 'file';
        ref: string;
        name: string;
        sessionId?: string;
        mimeType?: string;
        size?: number;
    }
    | {
        kind: 'artifact';
        artifactId: string;
        name: string;
        mimeType?: string;
    };

export type DownloadedAgentFile = {
    reference: AgentFileReference;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
};

export type SavedAgentFile = {
    reference: AgentFileReference;
    uri: string;
    name: string;
    mimeType: string;
    size: number;
};

export type AgentFileDownloadDeps = {
    credentials: AuthCredentials;
    defaultSessionId?: string;
    downloadAttachment?: (credentials: AuthCredentials, sessionId: string, ref: string) => Promise<Uint8Array>;
    fetchArtifactBody?: (artifactId: string) => Promise<{ title?: string | null; body: string | null } | null>;
};

type LocalFileSystem = {
    documentDirectory?: string | null;
    getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
    makeDirectoryAsync: (uri: string, options: { intermediates: boolean }) => Promise<void>;
    writeAsStringAsync: (uri: string, contents: string, options: { encoding: any }) => Promise<void>;
    base64Encoding: any;
};

export type SaveAgentFileDeps = {
    fileSystem?: LocalFileSystem;
    directoryUri?: string;
};

type UnknownRecord = Record<string, unknown>;

const DEFAULT_DOWNLOAD_DIR = 'happy-agent-downloads';
const DEFAULT_FILE_MIME = 'application/octet-stream';
const DEFAULT_ARTIFACT_MIME = 'text/markdown; charset=utf-8';

export function parseAgentFileReferences(input: unknown): AgentFileReference[] {
    const refs: AgentFileReference[] = [];
    const seen = new Set<string>();

    const add = (ref: AgentFileReference) => {
        const key = ref.kind === 'file'
            ? `file:${ref.sessionId ?? ''}:${ref.ref}`
            : `artifact:${ref.artifactId}`;
        if (seen.has(key)) return;
        seen.add(key);
        refs.push(ref);
    };

    const visit = (value: unknown) => {
        if (typeof value === 'string') {
            for (const ref of parseReferencesFromString(value)) {
                add(ref);
            }
            const trimmed = value.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    visit(JSON.parse(trimmed));
                } catch {
                    // Plain text may contain braces; ignore non-JSON strings.
                }
            }
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) visit(item);
            return;
        }

        if (!isRecord(value)) return;

        const directFile = parseFileReferenceObject(value);
        if (directFile) add(directFile);

        const directArtifact = parseArtifactReferenceObject(value);
        if (directArtifact) add(directArtifact);

        for (const child of Object.values(value)) {
            visit(child);
        }
    };

    visit(input);
    return refs;
}

export async function downloadAgentFileReference(
    reference: AgentFileReference,
    deps: AgentFileDownloadDeps,
): Promise<DownloadedAgentFile> {
    if (reference.kind === 'file') {
        const sessionId = reference.sessionId ?? deps.defaultSessionId;
        if (!sessionId) {
            throw new Error('Cannot download file reference without a session id');
        }
        const download = deps.downloadAttachment ?? defaultDownloadEncryptedAttachment;
        const bytes = await download(deps.credentials, sessionId, reference.ref);
        return {
            reference,
            name: sanitizeFileName(reference.name || fileNameFromRef(reference.ref)),
            mimeType: reference.mimeType ?? DEFAULT_FILE_MIME,
            bytes,
        };
    }

    if (!deps.fetchArtifactBody) {
        throw new Error('Cannot download artifact reference without an artifact body fetcher');
    }

    const artifact = await deps.fetchArtifactBody(reference.artifactId);
    if (!artifact) {
        throw new Error('Artifact not found');
    }
    const title = reference.name || artifact.title || `artifact-${reference.artifactId}.md`;
    const name = ensureExtension(sanitizeFileName(title), '.md');
    const body = artifact.body ?? '';
    return {
        reference,
        name,
        mimeType: reference.mimeType ?? DEFAULT_ARTIFACT_MIME,
        bytes: new TextEncoder().encode(body),
    };
}

export async function saveDownloadedAgentFile(
    downloaded: DownloadedAgentFile,
    deps: SaveAgentFileDeps = {},
): Promise<SavedAgentFile> {
    const fs = deps.fileSystem ?? defaultFileSystem();
    const baseDirectory = deps.directoryUri ?? fs.documentDirectory;
    if (!baseDirectory) {
        throw new Error('documentDirectory unavailable on this platform');
    }

    const directoryUri = joinUri(baseDirectory, DEFAULT_DOWNLOAD_DIR);
    await fs.makeDirectoryAsync(directoryUri, { intermediates: true });

    const name = sanitizeFileName(downloaded.name);
    const uri = await nextAvailableUri(fs, directoryUri, name);
    await fs.writeAsStringAsync(uri, encodeBase64(downloaded.bytes), { encoding: fs.base64Encoding });

    return {
        reference: downloaded.reference,
        uri,
        name: fileNameFromUri(uri),
        mimeType: downloaded.mimeType,
        size: downloaded.bytes.length,
    };
}

export async function downloadAndSaveAgentFileReference(
    reference: AgentFileReference,
    deps: AgentFileDownloadDeps & SaveAgentFileDeps,
): Promise<SavedAgentFile> {
    const downloaded = await downloadAgentFileReference(reference, deps);
    return saveDownloadedAgentFile(downloaded, deps);
}

function parseFileReferenceObject(record: UnknownRecord): AgentFileReference | null {
    const marker = stringValue(record.t) ?? stringValue(record.type) ?? stringValue(record.kind);
    const nested = record.fileRef ?? record.file_ref ?? record.file;
    if (isRecord(nested)) {
        return parseFileReferenceObject(nested);
    }

    if (marker !== 'file' && marker !== 'file-ref' && marker !== 'file_ref') {
        return null;
    }

    const ref = stringValue(record.ref);
    if (!ref) return null;

    return {
        kind: 'file',
        ref,
        name: sanitizeFileName(stringValue(record.name) ?? fileNameFromRef(ref)),
        sessionId: stringValue(record.sessionId) ?? stringValue(record.session_id),
        mimeType: stringValue(record.mimeType) ?? stringValue(record.mime_type),
        size: numberValue(record.size),
    };
}

function parseArtifactReferenceObject(record: UnknownRecord): AgentFileReference | null {
    const nested = record.artifactRef ?? record.artifact_ref ?? record.artifact;
    if (isRecord(nested)) {
        return parseArtifactReferenceObject(nested);
    }

    const marker = stringValue(record.t) ?? stringValue(record.type) ?? stringValue(record.kind);
    const artifactId = stringValue(record.artifactId) ?? stringValue(record.artifact_id);
    if (!artifactId && marker !== 'artifact' && marker !== 'artifact-ref' && marker !== 'artifact_ref') {
        return null;
    }
    const id = artifactId ?? stringValue(record.id);
    if (!id) return null;

    return {
        kind: 'artifact',
        artifactId: id,
        name: sanitizeFileName(stringValue(record.name) ?? stringValue(record.title) ?? `artifact-${id}.md`),
        mimeType: stringValue(record.mimeType) ?? DEFAULT_ARTIFACT_MIME,
    };
}

function parseReferencesFromString(text: string): AgentFileReference[] {
    const refs: AgentFileReference[] = [];
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                refs.push(...parseAgentFileReferences(JSON.parse(trimmed)));
            } catch {
                // Keep scanning the surrounding text for URL-style refs.
            }
        }
    }

    const urlPattern = /\bhappy:\/\/(?:file|artifact)[^\s)\]}>"']*/gi;
    for (const match of text.matchAll(urlPattern)) {
        const parsed = parseHappyReferenceUrl(match[0]);
        if (parsed) refs.push(parsed);
    }

    const artifactPattern = /\bartifact:([A-Za-z0-9_-]{6,})\b/g;
    for (const match of text.matchAll(artifactPattern)) {
        refs.push({
            kind: 'artifact',
            artifactId: match[1],
            name: `artifact-${match[1]}.md`,
            mimeType: DEFAULT_ARTIFACT_MIME,
        });
    }

    return refs;
}

function parseHappyReferenceUrl(rawUrl: string): AgentFileReference | null {
    try {
        const url = new URL(rawUrl);
        const kind = url.hostname;
        if (kind === 'artifact') {
            const artifactId = url.pathname.replace(/^\/+/, '') || url.searchParams.get('id') || '';
            if (!artifactId) return null;
            return {
                kind: 'artifact',
                artifactId,
                name: sanitizeFileName(url.searchParams.get('name') ?? `artifact-${artifactId}.md`),
                mimeType: url.searchParams.get('mimeType') ?? DEFAULT_ARTIFACT_MIME,
            };
        }
        if (kind === 'file') {
            const ref = url.searchParams.get('ref') ?? decodeURIComponent(url.pathname.replace(/^\/+/, ''));
            if (!ref) return null;
            return {
                kind: 'file',
                ref,
                name: sanitizeFileName(url.searchParams.get('name') ?? fileNameFromRef(ref)),
                sessionId: url.searchParams.get('sessionId') ?? undefined,
                mimeType: url.searchParams.get('mimeType') ?? undefined,
                size: parseOptionalNumber(url.searchParams.get('size')),
            };
        }
    } catch {
        return null;
    }
    return null;
}

function defaultFileSystem(): LocalFileSystem {
    // Keep expo-file-system out of module load so node-based unit tests and
    // web contexts can exercise parsing/download orchestration with injected
    // storage adapters without parsing Expo's native legacy entrypoint.
    const fs = require('expo-file-system/legacy');
    return {
        documentDirectory: fs.documentDirectory,
        getInfoAsync: fs.getInfoAsync,
        makeDirectoryAsync: fs.makeDirectoryAsync,
        writeAsStringAsync: fs.writeAsStringAsync,
        base64Encoding: fs.EncodingType.Base64,
    };
}

async function defaultDownloadEncryptedAttachment(
    credentials: AuthCredentials,
    sessionId: string,
    ref: string,
): Promise<Uint8Array> {
    const apiAttachments = require('./apiAttachments') as typeof import('./apiAttachments');
    return apiAttachments.downloadEncryptedAttachment(credentials, sessionId, ref);
}

async function nextAvailableUri(fs: LocalFileSystem, directoryUri: string, name: string): Promise<string> {
    const safeName = sanitizeFileName(name);
    let candidate = joinUri(directoryUri, safeName);
    if (!(await fs.getInfoAsync(candidate)).exists) {
        return candidate;
    }

    const { stem, extension } = splitExtension(safeName);
    for (let index = 1; index < 1000; index += 1) {
        candidate = joinUri(directoryUri, `${stem} (${index})${extension}`);
        if (!(await fs.getInfoAsync(candidate)).exists) {
            return candidate;
        }
    }
    throw new Error('Unable to allocate a unique local filename');
}

export function sanitizeFileName(input: string): string {
    const trimmed = input.trim();
    const sanitized = trimmed
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
        .replace(/\s+/g, ' ')
        .replace(/^\.+$/, '')
        .slice(0, 160);
    return sanitized || 'download';
}

function ensureExtension(name: string, extension: string): string {
    return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

function fileNameFromRef(ref: string): string {
    const last = ref.split('/').filter(Boolean).at(-1);
    return sanitizeFileName(last ?? 'download');
}

function fileNameFromUri(uri: string): string {
    return decodeURIComponent(uri.split('/').filter(Boolean).at(-1) ?? 'download');
}

function splitExtension(name: string): { stem: string; extension: string } {
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) {
        return { stem: name, extension: '' };
    }
    return { stem: name.slice(0, dot), extension: name.slice(dot) };
}

function joinUri(base: string, child: string): string {
    return `${base.replace(/\/+$/, '')}/${encodeURI(child)}`;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseOptionalNumber(value: string | null): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
