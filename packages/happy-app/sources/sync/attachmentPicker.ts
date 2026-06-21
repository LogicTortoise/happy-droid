import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { encodeBase64 } from '@/encryption/base64';
import { PickedFile } from './attachments';

/**
 * Read a local file URI into a base64 PickedFile. Uses the SDK 55 File API
 * (arrayBuffer) so any picked URI — image or document — is handled uniformly.
 */
async function readUri(uri: string, name: string, mimeType: string | undefined, size: number | undefined): Promise<PickedFile> {
    const buffer = await new File(uri).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return {
        name: name || 'file',
        mimeType: mimeType || 'application/octet-stream',
        size: typeof size === 'number' ? size : bytes.byteLength,
        base64: encodeBase64(bytes, 'base64'),
    };
}

/**
 * Pick an image from the photo library. Returns null if the user cancels or
 * denies the media-library permission.
 */
export async function pickImageAttachment(): Promise<PickedFile | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
    });
    if (result.canceled || result.assets.length === 0) {
        return null;
    }
    const asset = result.assets[0];
    const name = asset.fileName || asset.uri.split('/').pop() || 'image';
    return readUri(asset.uri, name, asset.mimeType, asset.fileSize);
}

/**
 * Pick an arbitrary document/file. Returns null if the user cancels.
 */
export async function pickDocumentAttachment(): Promise<PickedFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) {
        return null;
    }
    const asset = result.assets[0];
    return readUri(asset.uri, asset.name, asset.mimeType, asset.size);
}
