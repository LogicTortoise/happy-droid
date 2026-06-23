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

### 与生成端精简的关系

本轮只做客户端 TTS/STT 与开关入口。生成端感知“语音模式后更精炼”属于下一步 runner/protocol 任务：App 可在语音模式发送消息时通过 `meta.appendSystemPrompt` 注入精简提示，runner 侧需要确认透传并生效。

## 验证计划

- 单元测试：覆盖 markdown 到 TTS 文本清理、Android STT result 解析。
- 静态检查：`yarn workspace happy-app typecheck`。
- 构建检查：Android `./gradlew :app:assembleDebug`。
- 端到端记录：在 `docs/happy-droid/e2e-report.md` 记录开关、STT、TTS 的可验证状态；如无法实际打开系统语音识别 UI，记录替代验证和阻塞原因。
