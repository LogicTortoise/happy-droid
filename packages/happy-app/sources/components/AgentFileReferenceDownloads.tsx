import * as React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import {
    downloadAndSaveAgentFileReference,
    parseAgentFileReferences,
    type AgentFileDownloadDeps,
    type AgentFileReference,
    type SaveAgentFileDeps,
    type SavedAgentFile,
} from '@/sync/agentFileDownloads';

type DownloadState =
    | { status: 'idle' }
    | { status: 'saving' }
    | { status: 'saved'; file: SavedAgentFile }
    | { status: 'error'; message: string };

type AgentFileReferenceDownloadsProps = {
    source: unknown;
    sessionId: string;
    deps?: Partial<AgentFileDownloadDeps & SaveAgentFileDeps>;
};

export function AgentFileReferenceDownloads({ source, sessionId, deps }: AgentFileReferenceDownloadsProps) {
    const { theme } = useUnistyles();
    const refs = React.useMemo(() => parseAgentFileReferences(source), [source]);
    const [states, setStates] = React.useState<Record<string, DownloadState>>({});

    if (refs.length === 0) {
        return null;
    }

    const saveReference = async (reference: AgentFileReference) => {
        const key = referenceKey(reference);
        setStates((prev) => ({ ...prev, [key]: { status: 'saving' } }));
        try {
            const credentials = deps?.credentials ?? sync.getCredentials();
            if (!credentials) {
                throw new Error('Not authenticated');
            }
            const saved = await downloadAndSaveAgentFileReference(reference, {
                ...deps,
                credentials,
                defaultSessionId: reference.kind === 'file'
                    ? reference.sessionId ?? deps?.defaultSessionId ?? sessionId
                    : deps?.defaultSessionId ?? sessionId,
                fetchArtifactBody: deps?.fetchArtifactBody ?? (async (artifactId) => {
                    const artifact = await sync.fetchArtifactWithBody(artifactId);
                    return artifact ? { title: artifact.title, body: artifact.body ?? '' } : null;
                }),
            });
            setStates((prev) => ({ ...prev, [key]: { status: 'saved', file: saved } }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setStates((prev) => ({ ...prev, [key]: { status: 'error', message } }));
        }
    };

    return (
        <View style={styles.container}>
            {refs.map((reference) => {
                const key = referenceKey(reference);
                const state = states[key] ?? { status: 'idle' as const };
                const name = reference.kind === 'file' ? reference.name : reference.name;
                return (
                    <View
                        key={key}
                        style={[styles.row, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceHigh }]}
                    >
                        <Ionicons
                            name={reference.kind === 'artifact' ? 'document-text-outline' : 'download-outline'}
                            size={18}
                            color={theme.colors.textSecondary}
                        />
                        <View style={styles.textColumn}>
                            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                                {name}
                            </Text>
                            {state.status === 'saved' && (
                                <Text style={[styles.status, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                                    {t('common.success')}: {state.file.uri}
                                </Text>
                            )}
                            {state.status === 'error' && (
                                <Text style={[styles.status, { color: theme.colors.warning }]} numberOfLines={2}>
                                    {t('common.error')}: {state.message}
                                </Text>
                            )}
                        </View>
                        <Pressable
                            onPress={() => saveReference(reference)}
                            disabled={state.status === 'saving'}
                            style={(pressed) => [
                                styles.saveButton,
                                { opacity: pressed.pressed || state.status === 'saving' ? 0.65 : 1 },
                            ]}
                        >
                            {state.status === 'saving' ? (
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                                <Text style={[styles.saveText, { color: theme.colors.button.secondary.tint }]}>
                                    {t('common.save')}
                                </Text>
                            )}
                        </Pressable>
                    </View>
                );
            })}
        </View>
    );
}

function referenceKey(reference: AgentFileReference): string {
    return reference.kind === 'file'
        ? `file:${reference.sessionId ?? ''}:${reference.ref}`
        : `artifact:${reference.artifactId}`;
}

const styles = StyleSheet.create(() => ({
    container: {
        gap: 6,
        marginTop: 8,
    },
    row: {
        borderRadius: 8,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    textColumn: {
        flex: 1,
        minWidth: 0,
    },
    name: {
        fontSize: 13,
        fontWeight: '600',
    },
    status: {
        fontSize: 11,
        marginTop: 2,
    },
    saveButton: {
        minWidth: 48,
        minHeight: 28,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    saveText: {
        fontSize: 13,
        fontWeight: '600',
    },
}));
