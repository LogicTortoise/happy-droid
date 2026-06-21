import { ArtifactBody } from './artifactTypes';
import { MessageAttachment } from './typesMessageMeta';

/**
 * Maximum attachment size. Files are base64-encoded into an artifact body that
 * is stored (encrypted) in the server DB, so we keep a conservative cap.
 */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Marker version for the JSON we stash inside the artifact body. */
const ATTACHMENT_BODY_VERSION = 1;

/**
 * A file picked locally, ready to be uploaded as an attachment.
 */
export interface PickedFile {
    name: string;
    mimeType: string;
    size: number;
    /** Raw file bytes, base64 (standard, not url-safe). */
    base64: string;
}

/**
 * Shape of the JSON we stash (as a string) inside an artifact's `body` field.
 * Keeping it inside the existing `{ body: string }` shape means no server or
 * encryptor changes are needed.
 */
interface AttachmentBodyPayload {
    v: number;
    kind: 'file';
    name: string;
    mimeType: string;
    size: number;
    dataBase64: string;
}

/**
 * Build the (decrypted) artifact body for an attachment. The file bytes live in
 * `dataBase64`; the whole payload is JSON-stringified into `ArtifactBody.body`.
 */
export function buildAttachmentBody(file: PickedFile): ArtifactBody {
    const payload: AttachmentBodyPayload = {
        v: ATTACHMENT_BODY_VERSION,
        kind: 'file',
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        dataBase64: file.base64,
    };
    return { body: JSON.stringify(payload) };
}

/**
 * Parse an attachment back out of a decrypted artifact body. Returns null when
 * the body is not a recognizable attachment payload.
 */
export function parseAttachmentBody(body: ArtifactBody | null): PickedFile | null {
    if (!body || typeof body.body !== 'string') {
        return null;
    }
    try {
        const parsed = JSON.parse(body.body) as Partial<AttachmentBodyPayload>;
        if (parsed.kind !== 'file' || typeof parsed.dataBase64 !== 'string') {
            return null;
        }
        return {
            name: typeof parsed.name === 'string' ? parsed.name : 'file',
            mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : 'application/octet-stream',
            size: typeof parsed.size === 'number' ? parsed.size : 0,
            base64: parsed.dataBase64,
        };
    } catch {
        return null;
    }
}

/**
 * Human-readable byte size, e.g. 1536 -> "1.5 KB".
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return '0 B';
    }
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    const rounded = value >= 10 ? Math.round(value).toString() : value.toFixed(1);
    return `${rounded} ${units[unitIndex]}`;
}

/**
 * Build the text marker appended to a message so any runner that reads the
 * message text (e.g. the telegram bridge, or a future happy-cli runner) can see
 * the attachment. Mirrors the bridge's `[文件: <path>]` prompt-marker convention.
 */
export function formatAttachmentMarker(attachment: MessageAttachment): string {
    return `[attachment: ${attachment.name} (${attachment.mimeType}, ${formatBytes(attachment.size)}) artifact:${attachment.artifactId}]`;
}

/**
 * Append attachment markers to a message body, keeping a clean separation from
 * any user-typed text.
 */
export function appendAttachmentMarkers(text: string, attachments: MessageAttachment[]): string {
    if (attachments.length === 0) {
        return text;
    }
    const markers = attachments.map(formatAttachmentMarker).join('\n');
    return text.trim().length > 0 ? `${text}\n\n${markers}` : markers;
}
