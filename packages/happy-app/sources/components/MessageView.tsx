import * as React from "react";
import { ActivityIndicator, Modal, Pressable, Image as RNImage, View, Text } from "react-native";
import { StyleSheet } from 'react-native-unistyles';
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import type { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { layout } from "./layout";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { Ionicons } from '@expo/vector-icons';
import { collectMessageDownloads, formatBytes, isImageMimeType } from '@/sync/attachments';
import type { DownloadableFileItem } from '@/sync/attachments';
import { useArtifactDownload } from '@/hooks/useArtifactDownload';


export const MessageView = (props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) => {
  return (
    <View style={styles.messageContainer} renderToHardwareTextureAndroid={true}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
        />
      </View>
    </View>
  );
};

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return <UserTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'agent-text':
      return <AgentTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  return (
    <View style={styles.userMessageContainer}>
      <View style={styles.userMessageBubble}>
        <MarkdownView markdown={props.message.displayText || props.message.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
        <MessageDownloadList message={props.message} align="right" sessionId={props.sessionId} />
        {/* {__DEV__ && (
          <Text style={styles.debugText}>{JSON.stringify(props.message.meta)}</Text>
        )} */}
      </View>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  // Hide thinking messages
  if (props.message.isThinking) {
    return null;
  }

  return (
    <View style={styles.agentMessageContainer}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} sessionId={props.sessionId} />
      <MessageDownloadList message={props.message} align="left" sessionId={props.sessionId} />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  if (props.message.tool.name === 'file') {
    return (
      <View style={styles.toolContainer}>
        <MessageDownloadList message={props.message} align="left" sessionId={props.sessionId} />
      </View>
    );
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

function MessageDownloadList(props: {
  message: Message;
  align: 'left' | 'right';
  sessionId: string;
}) {
  const items = React.useMemo(() => collectMessageDownloads(props.message), [props.message]);
  if (items.length === 0) {
    return null;
  }
  return (
    <View style={[styles.downloadList, props.align === 'right' && styles.downloadListRight]}>
      {items.map((item) => (
        <DownloadCard item={item} key={item.id} sessionId={props.sessionId} />
      ))}
    </View>
  );
}

function DownloadCard(props: { item: DownloadableFileItem; sessionId: string }) {
  const { item } = props;
  const { state, download, share, canDownload } = useArtifactDownload(item, props.sessionId);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const isImage = state.isImage || isImageMimeType(item.mimeType);
  const isBusy = state.status === 'downloading';
  const isSaved = state.status === 'saved' && !!state.uri;

  return (
    <View style={styles.downloadCard}>
      <View style={styles.downloadIconBox}>
        <Ionicons name={isImage ? 'image-outline' : 'document-outline'} size={20} color="#656D76" />
      </View>
      <View style={styles.downloadContent}>
        <Text style={styles.downloadTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.downloadMeta} numberOfLines={1}>
          {item.mimeType} - {formatBytes(item.size)}
        </Text>
        {!canDownload && (
          <Text style={styles.downloadError} numberOfLines={2}>
            File ref: {item.ref || 'unavailable'}
          </Text>
        )}
        {state.error && (
          <Text style={styles.downloadError} numberOfLines={2}>{state.error}</Text>
        )}
        {isSaved && state.uri && (
          <Text style={styles.downloadSaved} numberOfLines={1}>{state.uri}</Text>
        )}
        {isSaved && isImage && state.uri && (
          <Pressable onPress={() => setPreviewOpen(true)} style={styles.previewThumbWrap}>
            <RNImage source={{ uri: state.uri }} style={styles.previewThumb} resizeMode="cover" />
          </Pressable>
        )}
      </View>
      <View style={styles.downloadActions}>
        {!isSaved ? (
          <Pressable
            onPress={download}
            disabled={!canDownload || isBusy}
            style={[styles.downloadButton, (!canDownload || isBusy) && styles.downloadButtonDisabled]}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#656D76" />
            ) : (
              <Ionicons name="download-outline" size={18} color={canDownload ? "#11181C" : "#8B949E"} />
            )}
          </Pressable>
        ) : (
          <Pressable onPress={share} style={styles.downloadButton}>
            <Ionicons name="share-outline" size={18} color="#11181C" />
          </Pressable>
        )}
      </View>
      {isSaved && isImage && state.uri && (
        <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <Pressable style={styles.previewModal} onPress={() => setPreviewOpen(false)}>
            <RNImage source={{ uri: state.uri }} style={styles.previewImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: layout.maxWidth,
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  toolContainer: {
    marginHorizontal: 8,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
  downloadList: {
    gap: 8,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  downloadListRight: {
    alignItems: 'flex-end',
  },
  downloadCard: {
    alignSelf: 'stretch',
    maxWidth: 360,
    minWidth: 240,
    flexDirection: 'row',
    gap: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
    padding: 10,
  },
  downloadIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceHigh,
  },
  downloadContent: {
    flex: 1,
    minWidth: 0,
  },
  downloadTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  downloadMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  downloadError: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },
  downloadSaved: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 6,
  },
  downloadActions: {
    justifyContent: 'flex-start',
  },
  downloadButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceHigh,
  },
  downloadButtonDisabled: {
    opacity: 0.55,
  },
  previewThumbWrap: {
    marginTop: 8,
    width: 160,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceHigh,
  },
  previewThumb: {
    width: '100%',
    height: '100%',
  },
  previewModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
}));
