import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';

import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import type { PendingAttachment } from '@/utils/MessageQueue2';

import type { InputItem } from '../codexAppServerTypes';

export type SupportedImageType = {
    mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    extension: 'png' | 'jpg' | 'gif' | 'webp';
};

export type PreparedCodexImageInputs = {
    inputItems: InputItem[];
    skipped: number;
};

export type PreparedCodexAttachmentInputs = PreparedCodexImageInputs;

const TEXT_ATTACHMENT_CHAR_LIMIT = 200_000;
const BINARY_ATTACHMENT_BASE64_CHAR_LIMIT = 200_000;

const TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/xml',
    'application/yaml',
    'application/x-yaml',
    'application/x-sh',
    'application/sql',
]);

const TEXT_FILE_EXTENSIONS = [
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.csv',
    '.tsv',
    '.xml',
    '.yaml',
    '.yml',
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.css',
    '.scss',
    '.html',
    '.log',
    '.sql',
    '.sh',
];

export function detectSupportedImageType(data: Uint8Array): SupportedImageType | null {
    if (
        data.length >= 8
        && data[0] === 0x89
        && data[1] === 0x50
        && data[2] === 0x4e
        && data[3] === 0x47
        && data[4] === 0x0d
        && data[5] === 0x0a
        && data[6] === 0x1a
        && data[7] === 0x0a
    ) {
        return { mimeType: 'image/png', extension: 'png' };
    }

    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return { mimeType: 'image/jpeg', extension: 'jpg' };
    }

    if (data.length >= 6) {
        const header = new TextDecoder().decode(data.slice(0, 6));
        if (header === 'GIF87a' || header === 'GIF89a') {
            return { mimeType: 'image/gif', extension: 'gif' };
        }
    }

    if (
        data.length >= 12
        && data[0] === 0x52
        && data[1] === 0x49
        && data[2] === 0x46
        && data[3] === 0x46
        && data[8] === 0x57
        && data[9] === 0x45
        && data[10] === 0x42
        && data[11] === 0x50
    ) {
        return { mimeType: 'image/webp', extension: 'webp' };
    }

    return null;
}

export function isTextLikeAttachment(attachment: Pick<PendingAttachment, 'mimeType' | 'name'>): boolean {
    const mimeType = attachment.mimeType.toLowerCase().split(';', 1)[0].trim();
    if (mimeType.startsWith('text/') || TEXT_MIME_TYPES.has(mimeType)) {
        return true;
    }
    const name = attachment.name.toLowerCase();
    return TEXT_FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

type TextInputItem = Extract<InputItem, { type: 'text' }>;

export function formatTextAttachmentInputItem(attachment: PendingAttachment): TextInputItem {
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(attachment.data);
    return formatAttachmentTextBlock({
        attachment,
        label: 'Attached text file',
        text: decoded,
    });
}

function formatAttachmentTextBlock(opts: {
    attachment: PendingAttachment;
    label: string;
    text: string;
}): TextInputItem {
    const truncated = opts.text.length > TEXT_ATTACHMENT_CHAR_LIMIT;
    const text = truncated
        ? opts.text.slice(0, TEXT_ATTACHMENT_CHAR_LIMIT)
        : opts.text;

    return {
        type: 'text',
        text: [
            `${opts.label} "${opts.attachment.name}" (${opts.attachment.mimeType}, ${opts.attachment.data.length} bytes):`,
            '',
            '```',
            text,
            '```',
            truncated ? `\n[Attachment content truncated to ${TEXT_ATTACHMENT_CHAR_LIMIT} characters.]` : '',
        ].filter((part) => part.length > 0).join('\n'),
    };
}

export function formatDocumentAttachmentInputItem(attachment: PendingAttachment): TextInputItem | null {
    const extracted = extractDocumentText(attachment);
    if (!extracted) {
        return null;
    }
    return formatAttachmentTextBlock({
        attachment,
        label: `Extracted ${extracted.kind} content from attached file`,
        text: extracted.text,
    });
}

export function formatBinaryAttachmentInputItem(attachment: PendingAttachment): TextInputItem {
    const encoded = Buffer.from(attachment.data).toString('base64');
    const truncated = encoded.length > BINARY_ATTACHMENT_BASE64_CHAR_LIMIT;
    const base64 = truncated
        ? encoded.slice(0, BINARY_ATTACHMENT_BASE64_CHAR_LIMIT)
        : encoded;

    return {
        type: 'text',
        text: [
            `Attached binary file "${attachment.name}" (${attachment.mimeType}, ${attachment.data.length} bytes) content as base64:`,
            '',
            '```base64',
            base64,
            '```',
            truncated ? `\n[Binary attachment base64 truncated to ${BINARY_ATTACHMENT_BASE64_CHAR_LIMIT} characters.]` : '',
        ].filter((part) => part.length > 0).join('\n'),
    };
}

type DocumentExtraction = {
    kind: 'PDF' | 'Office document';
    text: string;
};

export function extractDocumentText(attachment: PendingAttachment): DocumentExtraction | null {
    if (isPdfAttachment(attachment)) {
        const text = normalizeExtractedText(extractPdfText(attachment.data));
        return text ? { kind: 'PDF', text } : null;
    }

    if (isOfficeOpenXmlAttachment(attachment)) {
        const text = normalizeExtractedText(extractOfficeOpenXmlText(attachment));
        return text ? { kind: 'Office document', text } : null;
    }

    return null;
}

function isPdfAttachment(attachment: Pick<PendingAttachment, 'data' | 'mimeType' | 'name'>): boolean {
    const mimeType = attachment.mimeType.toLowerCase().split(';', 1)[0].trim();
    return mimeType === 'application/pdf'
        || attachment.name.toLowerCase().endsWith('.pdf')
        || startsWithAscii(attachment.data, '%PDF-');
}

function isOfficeOpenXmlAttachment(attachment: Pick<PendingAttachment, 'data' | 'mimeType' | 'name'>): boolean {
    const mimeType = attachment.mimeType.toLowerCase().split(';', 1)[0].trim();
    const name = attachment.name.toLowerCase();
    return startsWithAscii(attachment.data, 'PK')
        && (
            name.endsWith('.docx')
            || name.endsWith('.pptx')
            || name.endsWith('.xlsx')
            || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            || mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
}

function startsWithAscii(data: Uint8Array, prefix: string): boolean {
    if (data.length < prefix.length) {
        return false;
    }
    for (let i = 0; i < prefix.length; i++) {
        if (data[i] !== prefix.charCodeAt(i)) {
            return false;
        }
    }
    return true;
}

function extractPdfText(data: Uint8Array): string {
    const source = Buffer.from(data).toString('latin1');
    const chunks: string[] = [];
    const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    for (const match of source.matchAll(streamPattern)) {
        const raw = Buffer.from(match[1], 'latin1');
        const inflated = tryInflate(raw);
        chunks.push(extractPdfTextOperators(inflated ?? raw.toString('latin1')));
    }
    chunks.push(extractPdfTextOperators(source));
    return chunks.join('\n');
}

function tryInflate(data: Buffer): string | null {
    try {
        return inflateSync(data).toString('latin1');
    } catch {
        try {
            return inflateRawSync(data).toString('latin1');
        } catch {
            return null;
        }
    }
}

function extractPdfTextOperators(content: string): string {
    const pieces: string[] = [];
    const literalPattern = /\((?:\\.|[^\\()])*\)/g;
    for (const match of content.matchAll(literalPattern)) {
        pieces.push(decodePdfLiteralString(match[0].slice(1, -1)));
    }
    const hexPattern = /<([0-9A-Fa-f\s]{2,})>/g;
    for (const match of content.matchAll(hexPattern)) {
        const hex = match[1].replace(/\s+/g, '');
        if (hex.length >= 2 && hex.length % 2 === 0) {
            pieces.push(Buffer.from(hex, 'hex').toString('utf8'));
        }
    }
    return pieces.join(' ');
}

function decodePdfLiteralString(value: string): string {
    return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escaped: string) => {
        switch (escaped) {
            case 'n': return '\n';
            case 'r': return '\r';
            case 't': return '\t';
            case 'b': return '\b';
            case 'f': return '\f';
            case '(':
            case ')':
            case '\\':
                return escaped;
            default:
                return String.fromCharCode(Number.parseInt(escaped, 8));
        }
    });
}

function extractOfficeOpenXmlText(attachment: PendingAttachment): string {
    const lowerName = attachment.name.toLowerCase();
    const entries = readZipTextEntries(attachment.data, (name) => {
        if (lowerName.endsWith('.docx')) {
            return /^word\/(document|footnotes|endnotes|comments|header\d+|footer\d+)\.xml$/.test(name);
        }
        if (lowerName.endsWith('.pptx')) {
            return /^ppt\/slides\/slide\d+\.xml$/.test(name) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name);
        }
        if (lowerName.endsWith('.xlsx')) {
            return name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
        }
        return /^(word|ppt|xl)\//.test(name) && name.endsWith('.xml');
    });
    return entries
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((entry) => xmlTextContent(entry.text))
        .filter(Boolean)
        .join('\n\n');
}

function readZipTextEntries(data: Uint8Array, include: (name: string) => boolean): Array<{ name: string; text: string }> {
    const buffer = Buffer.from(data);
    const eocdOffset = findEndOfCentralDirectory(buffer);
    if (eocdOffset < 0) {
        return [];
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    const entries: Array<{ name: string; text: string }> = [];
    let offset = centralDirectoryOffset;

    for (let i = 0; i < totalEntries && offset + 46 <= buffer.length; i++) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            break;
        }
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

        if (include(name)) {
            const content = readZipEntry(buffer, localHeaderOffset, compressedSize, method);
            if (content) {
                entries.push({ name, text: content.toString('utf8') });
            }
        }

        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
    const minOffset = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            return offset;
        }
    }
    return -1;
}

function readZipEntry(buffer: Buffer, localHeaderOffset: number, compressedSize: number, method: number): Buffer | null {
    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        return null;
    }
    const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart < 0 || dataEnd > buffer.length) {
        return null;
    }
    const compressed = buffer.subarray(dataStart, dataEnd);
    if (method === 0) {
        return Buffer.from(compressed);
    }
    if (method === 8) {
        return inflateRawSync(compressed);
    }
    return null;
}

function xmlTextContent(xml: string): string {
    return decodeXmlEntities(xml
        .replace(/<\/(?:w:p|a:p|row|sheetData|si)>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n'))
        .trim();
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function normalizeExtractedText(text: string): string {
    return text
        .replace(/\u0000/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function resolveCodexImageCacheDir(opts: {
    sessionId: string;
    cacheRootDir?: string;
}): string {
    const cacheRoot = resolve(opts.cacheRootDir ?? join(configuration.happyHomeDir, 'codex-image-cache'));
    const sessionKey = sanitizeCachePathSegment(opts.sessionId);
    const cacheDir = resolve(cacheRoot, sessionKey);
    const relativePath = relative(cacheRoot, cacheDir);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        return join(cacheRoot, 'invalid-session');
    }
    return cacheDir;
}

function sanitizeCachePathSegment(value: string): string {
    const sanitized = value
        .trim()
        .replace(/[\\/]+/g, '_')
        .replace(/\.+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/^_+|_+$/g, '');
    return sanitized.length > 0 ? sanitized : 'unknown-session';
}

export async function prepareCodexImageInputItems(
    attachments: PendingAttachment[] | undefined,
    opts: {
        sessionId: string;
        cacheRootDir?: string;
    },
): Promise<PreparedCodexImageInputs> {
    if (!attachments || attachments.length === 0) {
        return { inputItems: [], skipped: 0 };
    }

    const cacheDir = resolveCodexImageCacheDir(opts);
    const inputItems: InputItem[] = [];
    let skipped = 0;

    for (const attachment of attachments) {
        const detected = detectSupportedImageType(attachment.data);
        if (!detected) {
            logger.debug('[Codex] Skipping unsupported image attachment', {
                mimeType: attachment.mimeType,
                size: attachment.data.length,
            });
            skipped += 1;
            continue;
        }

        try {
            await mkdir(cacheDir, { recursive: true, mode: 0o700 });
            await chmod(cacheDir, 0o700);
            const filePath = join(cacheDir, `${randomUUID()}.${detected.extension}`);
            await writeFile(filePath, Buffer.from(attachment.data), { mode: 0o600 });
            inputItems.push({ type: 'localImage', path: filePath });
        } catch (error) {
            logger.debug('[Codex] Failed to cache image attachment for localImage input', {
                mimeType: detected.mimeType,
                size: attachment.data.length,
                errorName: error instanceof Error ? error.name : typeof error,
            });
            skipped += 1;
        }
    }

    return { inputItems, skipped };
}

export async function prepareCodexAttachmentInputItems(
    attachments: PendingAttachment[] | undefined,
    opts: {
        sessionId: string;
        cacheRootDir?: string;
    },
): Promise<PreparedCodexAttachmentInputs> {
    if (!attachments || attachments.length === 0) {
        return { inputItems: [], skipped: 0 };
    }

    const cacheDir = resolveCodexImageCacheDir(opts);
    const inputItems: InputItem[] = [];
    let skipped = 0;

    for (const attachment of attachments) {
        const detected = detectSupportedImageType(attachment.data);
        if (detected) {
            try {
                await mkdir(cacheDir, { recursive: true, mode: 0o700 });
                await chmod(cacheDir, 0o700);
                const filePath = join(cacheDir, `${randomUUID()}.${detected.extension}`);
                await writeFile(filePath, Buffer.from(attachment.data), { mode: 0o600 });
                inputItems.push({ type: 'localImage', path: filePath });
            } catch (error) {
                logger.debug('[Codex] Failed to cache image attachment for localImage input', {
                    mimeType: detected.mimeType,
                    size: attachment.data.length,
                    errorName: error instanceof Error ? error.name : typeof error,
                });
                skipped += 1;
            }
            continue;
        }

        if (isTextLikeAttachment(attachment)) {
            inputItems.push(formatTextAttachmentInputItem(attachment));
            continue;
        }

        inputItems.push(formatDocumentAttachmentInputItem(attachment) ?? formatBinaryAttachmentInputItem(attachment));
    }

    return { inputItems, skipped };
}
