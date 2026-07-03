# P1 语音模式客户端实现

## 本轮范围

本轮实现 **客户端本地语音模式**：

- Android 上收到 agent 文字回复后，用系统 TTS 朗读。
- Android 上点击会话输入区的麦克风按钮，走系统 STT 识别语音并填入输入框。
- 在 Settings > Voice Assistant 中提供可控开关入口。

这与现有 ElevenLabs Realtime Voice Assistant 是两条不同链路：

- Realtime Voice Assistant：远端实时对话，走 `/v1/voice/*`、LiveKit/ElevenLabs。
- 本地语音模式：App 本机 TTS/STT，只复用当前 session 的普通文本消息通道。

## 设计决策

### 开关

新增本地设备级设置 `voiceModeEnabled`，不随账号同步。理由：

- TTS/STT 依赖当前手机系统能力与权限。
- 不应在另一台设备上自动开启朗读。
- 与现有 `voiceAssistantLanguage` 等远端 voice assistant 设置分离。

设置入口放在 `packages/happy-app/sources/app/(app)/settings/voice.tsx`。

### TTS

使用 Expo SDK 55 bundled module `expo-speech`：

```text
new agent-text message
  -> sanitize markdown/code for speech
  -> Speech.stop()
  -> Speech.speak(text)
```

仅朗读当前 session 新到达的非 thinking `agent-text`，不会在打开旧 session 或切换开关时朗读历史消息。

### STT

Android 使用系统 `RecognizerIntent`，由已有 `expo-intent-launcher` 启动：

```text
mic button
  -> request RECORD_AUDIO permission
  -> android.speech.action.RECOGNIZE_SPEECH
  -> read android.speech.extra.RESULTS
  -> write recognized text to composer
```

当 `voiceModeEnabled=false` 时，mic button 保持现有 ElevenLabs realtime 行为。当 `voiceModeEnabled=true` 时，Android mic button 改为一次性系统语音输入。非 Android 平台暂不启用本地 STT。

### 生成端感知精简

语音模式开启后，App 在发送用户文本消息时同时写入两类 meta：

```text
meta.voiceMode = true
meta.appendSystemPrompt = <happy-app base system prompt> + <voice concise prompt>
```

精简提示由客户端统一生成，内容约束为：当前是语音模式，回复控制在 1-3 句，口语化，优先直接结论，避免代码块、长列表和冗长解释，除非用户明确要求。

传递与生效链路：

```text
Settings voiceModeEnabled=true
  -> sync.sendMessage()
  -> encrypted RawRecord meta.voiceMode + meta.appendSystemPrompt
  -> /v3/sessions/{id}/messages
  -> happy-cli ApiSessionClient decrypts UserMessage
  -> runner reads message.meta.voiceMode + message.meta.appendSystemPrompt
  -> Claude SDK --append-system-prompt or Codex turn input constrains this turn
```

`meta.voiceMode` 是协议层显式标记，供本 fork runner/后续 agent 适配器识别当前输入来自语音模式；`meta.appendSystemPrompt` 是向后兼容的实际约束通道。

当前 runner 生效方式：

- Claude：`runClaude.ts` 读取 `message.meta.voiceMode`，用 `appendVoiceModeSystemPrompt()` 去重合并精简提示，再通过 Claude SDK `--append-system-prompt` 生效。
- Codex：`runCodex.ts` 的 `CodexEnhancedMode` 和 `MessageQueue2` hash 纳入 `customSystemPrompt` / `appendSystemPrompt`；收到 `message.meta.voiceMode=true` 时同样用 `appendVoiceModeSystemPrompt()` 去重合并，并在每轮 `turn/start` 输入前拼入 prompt，使 Codex 输出受到同一精简约束。

线上 `happy-telegram` 不参与这条链路，也不需要改动。

## 验证计划

- 单元测试：覆盖 markdown 到 TTS 文本清理、Android STT result 解析。
- 静态检查：`yarn workspace happy-app typecheck`。
- 构建检查：Android `./gradlew :app:assembleDebug`。
- 端到端记录：在 `docs/happy-droid/e2e-report.md` 记录开关、STT、TTS 的可验证状态；如无法实际打开系统语音识别 UI，记录替代验证和阻塞原因。
