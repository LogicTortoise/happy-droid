/**
 * Horizontal scrollable strip showing selected attachment previews.
 * Images render as thumbnails; generic files render as compact file tiles.
 */
import * as React from 'react';
import { ScrollView, View, Pressable, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { isImageAttachment, type AttachmentPreview } from '@/sync/attachmentTypes';
import { thumbhashToDataUri } from '@/utils/thumbhash';

const THUMB_SIZE = 64;
const BORDER_RADIUS = 8;

interface AgentInputAttachmentStripProps {
    attachments: AttachmentPreview[];
    onRemove: (id: string) => void;
}

export function AgentInputAttachmentStrip({ attachments, onRemove }: AgentInputAttachmentStripProps) {
    const { theme } = useUnistyles();

    if (attachments.length === 0) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.strip}
            contentContainerStyle={styles.stripContent}
            keyboardShouldPersistTaps="always"
        >
            {attachments.map((attachment) => (
                <AttachmentThumbnail
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={onRemove}
                    theme={theme}
                />
            ))}
        </ScrollView>
    );
}

function AttachmentThumbnail({
    attachment,
    onRemove,
    theme,
}: {
    attachment: AttachmentPreview;
    onRemove: (id: string) => void;
    theme: any;
}) {
    const isImage = isImageAttachment(attachment);
    // Build placeholder from thumbhash if available
    const placeholder = React.useMemo(() => {
        if (!attachment.thumbhash) return undefined;
        const uri = thumbhashToDataUri(attachment.thumbhash);
        return uri ? { uri } : undefined;
    }, [attachment.thumbhash]);

    return (
        <View style={[
            styles.thumbContainer,
            { borderColor: theme.colors.divider }
        ]}>
            {isImage ? (
                <Image
                    source={{ uri: attachment.uri }}
                    placeholder={placeholder}
                    style={[{ width: THUMB_SIZE, height: THUMB_SIZE }, styles.thumb]}
                    contentFit="cover"
                    transition={150}
                />
            ) : (
                <View style={[styles.fileTile, { backgroundColor: theme.colors.surfaceHigh }]}>
                    <Ionicons name="document-text-outline" size={22} color={theme.colors.textSecondary} />
                    <Text
                        style={[styles.fileName, { color: theme.colors.textSecondary }]}
                        numberOfLines={2}
                    >
                        {attachment.name}
                    </Text>
                </View>
            )}
            {/* Remove button */}
            <Pressable
                onPress={() => onRemove(attachment.id)}
                hitSlop={4}
                style={(p) => [
                    styles.removeButton,
                    { backgroundColor: theme.colors.surfaceHigh, opacity: p.pressed ? 0.7 : 1 }
                ]}
            >
                <Ionicons name="close" size={10} color={theme.colors.text} />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create(() => ({
    strip: {
        marginBottom: 8,
        marginHorizontal: 8,
    },
    stripContent: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 4,
    },
    thumbContainer: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: BORDER_RADIUS,
        overflow: 'visible',
        borderWidth: 1,
        position: 'relative',
    },
    thumb: {
        borderRadius: BORDER_RADIUS,
    },
    fileTile: {
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: BORDER_RADIUS,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        gap: 4,
    },
    fileName: {
        fontSize: 9,
        lineHeight: 11,
        textAlign: 'center',
        fontWeight: '500',
    },
    removeButton: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
}));
