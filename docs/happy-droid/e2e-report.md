# happy-droid 端到端验证记录

## 2026-06-23 - P0 文件下载与图片预览

### 范围

- 任务：将 session 中 agent 产出的 artifact/file ref 下载保存到手机本地，并支持图片预览。
- 改动范围：仅 `packages/happy-app` 客户端与 `docs/happy-droid` 文档/日志；未修改 `happy-telegram`、上游 `happy`、代理/网络/VPN/Tailscale 配置。

### 功能验证

- 识别来源：
  - `message.meta.attachments` 中的 artifact attachment。
  - 消息文本里的 `[attachment: ... artifact:<id>]` marker。
  - Session Protocol `file` tool-call 事件中的 `ref/name/size/image/mimeType`。
- 下载行为：
  - 对可归一化为 artifact id 的 ref，通过现有 `sync.fetchArtifactWithBody` 拉取并解析 E2E 加密 artifact body。
  - 将附件 base64 bytes 写入 App document 目录下的 `happy-downloads/`。
  - 图片 MIME 类型保存后显示缩略图，点击进入全屏预览；已保存文件可调起系统分享。
  - 对当前后端尚未提供可读 artifact 的普通 file ref，显示不可下载状态，不伪造下载。

### 静态检查与单测

```text
yarn workspace happy-app test sources/sync/attachments.spec.ts --run
结果：15 tests passed
日志：docs/happy-droid/logs/2026-06-23-file-download-vitest.log
```

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-file-download-typecheck.log
```

### Android 构建与安装验证

```text
APP_ENV=development npx expo prebuild -p android --no-install
结果：成功
日志：docs/happy-droid/logs/2026-06-23-file-download-expo-prebuild.log
```

```text
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 45s
日志：docs/happy-droid/logs/2026-06-23-file-download-gradle-assembleDebug.log
```

APK 产物：

```text
路径：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
大小：447M
SHA-256：1f2fb08886494f0eda95aa874030ed983b619a7946dc52418d285a1d4e9770d5
```

安装验证：

```text
设备：127.0.0.1:5555 device product:b0qxxx model:SM_S908E
命令：adb -s 127.0.0.1:5555 install -r packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
结果：Performing Streamed Install / Success
确认：pm path com.slopus.happy.dev 返回 base.apk 路径
日志：docs/happy-droid/logs/2026-06-23-file-download-adb-install.log
```

### 结论

本轮初版 P0 文件下载与图片预览实现已通过 helper 单测、happy-app typecheck、Android `prebuild + assembleDebug` 出包和连接设备安装验证。后续验证指出普通非 artifact file ref 仍不可下载；见下一节修复记录。

## 2026-06-23 - P0 普通 session file-ref 下载修复

### 修复范围

- 普通 `source=file-ref` 不再直接报错；App 下载时通过现有 session RPC `readFile` 读取当前 runner/machine 上的文件字节。
- `Session Protocol` 的 `file` event 现在保留 `mimeType`，图片 file ref 可在保存后继续使用本地 URI 缩略图与全屏预览。
- artifact 附件路径不变，仍通过 E2E artifact body 解析。

### 静态检查与集成测试

```text
yarn workspace happy-app test sources/sync/attachments.spec.ts sources/sync/fileDownloads.spec.ts sources/sync/typesRaw.spec.ts --run --reporter verbose
结果：79 tests passed
日志：docs/happy-droid/logs/2026-06-23-file-download-rpc-vitest.log
```

覆盖点：

- `collectMessageDownloads` 将普通 session file ref 保留为 `source=file-ref`，并保留 `ref/name/size/mimeType/image`。
- `loadDownloadableFilePayload` 对 artifact 调用 artifact body 解析。
- `loadDownloadableFilePayload` 对普通 file ref 调用 `readSessionFile(sessionId, ref)`，将返回的 base64 内容解码为字节。
- `canDownloadFileItem` 要求普通 file ref 同时具备 `sessionId` 和 `ref`。
- 集成测试覆盖普通 file ref 从 message 解析、读取字节、写入本地临时文件，并确认 `image/png` 可进入图片预览路径。

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-file-download-rpc-typecheck.log
```

### Android 构建与安装验证

```text
APP_ENV=development npx expo prebuild -p android --no-install
日志：docs/happy-droid/logs/2026-06-23-file-download-rpc-expo-prebuild.log
```

```text
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

日志：docs/happy-droid/logs/2026-06-23-file-download-rpc-gradle-assembleDebug.log
```

APK 产物：

```text
路径：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
大小：447M
SHA-256：352ed55aa4a91663275861264fb02bb969262d32730c1cbc6e621ee65918c256
```

安装验证日志：

```text
docs/happy-droid/logs/2026-06-23-file-download-rpc-adb-install.log
```

安装结果：

```text
设备：127.0.0.1:5555 product:b0qxxx model:SM_S908E
结果：Performing Streamed Install / Success
确认：pm path com.slopus.happy.dev 返回 base.apk 路径
```

## 2026-06-23 - P0 服务端地址可配核验

### 核验范围

- App 端：`packages/happy-app/sources/sync/serverConfig.ts` 的 `getServerUrl()` 链路，以及认证、REST、socket、artifact/API helper 对它的引用。
- 运行时配置：`packages/happy-app/sources/app/(app)/server.tsx` 的 Server Configuration 保存到 MMKV `custom-server-url`。
- 桥端只读参考：`/Users/Hht/Documents/10.github/happy-telegram/src/config.ts` 与 `src/server-client.ts`。

### 结果

```text
App 配置优先级：
MMKV custom-server-url -> EXPO_PUBLIC_HAPPY_SERVER_URL -> https://api.cluster-fluster.com

Happy Telegram 桥配置优先级：
HAPPY_TG_SERVER_URL -> ~/.happy-telegram/config.env:HAPPY_TG_SERVER_URL -> http://localhost:3005

本次已验证的相同 base URL：
http://localhost:3005

对齐方式：
桥端本机配置未发现未注释的 HAPPY_TG_SERVER_URL，因此桥端实际落到默认 http://localhost:3005。
App 侧本次通过 EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 对齐同一 URL。
```

未改动桥端配置，也未触碰任何代理/网络/VPN/Tailscale 设置。

### 单元测试

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 yarn workspace happy-app test sources/sync/serverConfig.spec.ts --run --reporter verbose
结果：5 tests passed
覆盖：默认 https://api.cluster-fluster.com、EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005、MMKV custom-server-url override、log server env/MMKV、validateServerUrl
日志：docs/happy-droid/logs/2026-06-23-server-config-vitest.log
```

### 静态检查

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-server-config-typecheck.log
```

### Android 构建验证

```text
cd packages/happy-app
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 APP_ENV=development npx expo prebuild -p android --no-install

结果：Finished prebuild
日志：docs/happy-droid/logs/2026-06-23-server-config-expo-prebuild-localhost.log
```

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 37s
日志：docs/happy-droid/logs/2026-06-23-server-config-gradle-assembleDebug.log
APK：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## 2026-06-23 - P1 自建 Session Runner 关键设计

### 设计结论

App 新建 session 后，跑 Claude 的执行者是本 fork 的 `happy-cli daemon`：

```text
Android App -> happy-server -> selected machine RPC -> happy-cli daemon -> Claude/Codex/Gemini/OpenClaw
```

本任务没有改功能代码；新增设计文档 `docs/happy-droid/session-runner.md`，明确：

- 不复用线上 `happy-telegram` 桥，桥只读且绑定 Bot/chat。
- 不自建轻量 runner 作为主路径，避免重做鉴权、machine 注册、E2E 加密、RPC、v3 回写、权限和文件能力。
- App 通过现有 `machineSpawnNewSession()` / `spawn-happy-session` 让在线 machine 上的本 fork `happy-cli daemon` 创建并运行 session。

### 静态检查

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-session-runner-typecheck.log
```

### Android 构建验证

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 34s
日志：docs/happy-droid/logs/2026-06-23-session-runner-gradle-assembleDebug.log
```

## 2026-06-23 - P1 App 自建/列出/切换 Session UI 与同步逻辑

### 范围

- 任务：App 自建/列出/切换 Session 的 UI 与同步逻辑，不依赖绑定 Bot，对接 `sessionRoutes` / `v3SessionRoutes`。
- 改动范围：`packages/happy-app` 新建 session UI 同步加固、`sync/ops` machine RPC contract 测试、`docs/happy-droid` 文档与验证记录。
- 未修改线上 `happy-telegram`、上游 `happy`、代理/网络/VPN/Tailscale 配置。

### 实现结论

App 自建 session 的主路径为：

```text
Android App -> happy-server machine RPC -> selected happy-cli daemon -> agent/Claude
```

App 列表/切换路径为：

```text
GET /v1/sessions -> storage.applySessions() -> session list UI -> navigateToSession(sessionId)
```

App 消息同步路径为：

```text
POST /v3/sessions/{sessionId}/messages
GET  /v3/sessions/{sessionId}/messages?after_seq=...
socket /v1/updates
```

本轮补强：`spawn-happy-session` 成功返回 `sessionId` 后，新建页最多刷新 5 次 session 列表，确认该 session 已完成本地解密并进入 `storage.sessions`，再设置本地 permission/model、发送首条 prompt 和跳转。这样避免 daemon 已创建 session 但 App 尚未初始化 session data key 时首条消息被跳过。

设计与入口记录：`docs/happy-droid/session-ui-sync.md`。

### 单元/集成测试

```text
yarn workspace happy-app test sources/sync/ops.spec.ts --run --reporter verbose
结果：4 tests passed
日志：docs/happy-droid/logs/2026-06-23-session-ui-sync-vitest.log
```

覆盖点：

- `machineSpawnNewSession()` 使用 machine RPC `spawn-happy-session`。
- spawn payload 包含 `type:'spawn-in-directory'`、目录、审批标记、token、agent。
- optional 字段省略时使用安全默认值。
- spawn RPC 失败时返回 `{ type:'error' }`。
- `machineResumeSession()` 使用 machine RPC `resume-happy-session`。

### 静态检查

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-session-ui-sync-typecheck.log
```

### Android 构建验证

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 33s
日志：docs/happy-droid/logs/2026-06-23-session-ui-sync-gradle-assembleDebug.log
APK：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
```

### 端到端状态

本轮完成代码级闭环与 Android 构建验证：App 新建 UI -> machine RPC contract -> session 列表刷新等待 -> `/v1/sessions` 本地可见后再发送 `/v3` 首条消息。当前未在本轮启动真实 `happy-cli daemon` 进行人工 App 点击流；真实设备联调的前置条件是同一后端下存在在线 daemon machine。

## 2026-06-23 - P1 语音模式客户端实现

### 范围

- 任务：收到 agent 文字回复用 Android TTS 朗读，语音输入用系统 STT，并提供可控开关入口。
- 改动范围：`packages/happy-app` 客户端、`docs/happy-droid/voice-mode.md`、验证日志。
- 未修改线上 `happy-telegram`、上游 `happy`、代理/网络/VPN/Tailscale 配置。

### 实现结论

新增本地设备级 `voiceModeEnabled` 开关，入口在 Settings > Voice Assistant：

```text
Voice Assistant settings -> Android Voice Mode -> Voice Mode switch
```

启用后：

- 会话页收到新的非 thinking `agent-text` 后，使用 `expo-speech` 调用系统 TTS 朗读。
- 打开旧 session 或刚打开开关时不会朗读历史消息，只朗读之后新到达的 agent 文本。
- 会话输入区 mic 按钮在 Android 上改为系统 STT：请求麦克风权限，启动 `android.speech.action.RECOGNIZE_SPEECH`，读取 `android.speech.extra.RESULTS`，并把识别文本填入 composer。
- 未启用时，mic 按钮保持原有 ElevenLabs realtime voice assistant 行为。

设计说明：`docs/happy-droid/voice-mode.md`。

### 单元测试

```text
yarn workspace happy-app test sources/voice/voiceMode.spec.ts --run --reporter verbose
结果：3 tests passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-vitest.log
```

覆盖点：

- Markdown/code/link 文本清理为适合 TTS 的纯文本。
- Android `RecognizerIntent` 标准返回 key `android.speech.extra.RESULTS` 可解析为识别文本。
- 空/无效识别结果返回 `null`。

### 静态检查

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-typecheck.log
```

### Android 构建验证

```text
APP_ENV=development npx expo prebuild -p android --no-install
结果：Finished prebuild
日志：docs/happy-droid/logs/2026-06-23-voice-mode-expo-prebuild.log
```

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 9m 41s
日志：docs/happy-droid/logs/2026-06-23-voice-mode-gradle-assembleDebug.log
APK：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
大小：452M
SHA-256：a0d0850147c6ffc002dfd2393fd63023ec7949d56ae76d718f65a0f40aaa8818
```

构建日志确认 `expo-speech (55.0.14)` 已进入 Expo autolinking 列表。

### 设备端验证状态

```text
adb devices
结果：List of devices attached 为空
```

当前没有在线 Android 设备/模拟器，因此本轮无法自动执行 APK 安装、打开系统 STT UI、或实听 TTS。已完成可自动化验证：helper 单测、TypeScript 静态检查、Android prebuild、Gradle debug APK 构建。真实设备上的手工验收步骤：

```text
1. 安装 app-debug.apk。
2. 打开 Settings > Voice Assistant > Android Voice Mode > Voice Mode。
3. 进入一个 session，点击输入区 mic，确认系统语音识别 UI 弹出，识别结果填入 composer。
4. 发送消息并等待 agent 文本回复，确认系统 TTS 朗读新回复。
5. 关闭 Voice Mode，确认 mic 按钮恢复原 ElevenLabs realtime voice assistant 行为。
```

## 2026-06-23 - P1 语音模式生成端感知精简

### 范围

- 任务：语音模式下在消息 meta 打 voice 标记/注入简短 system 提示，由本 fork runner/协议层识别并约束输出。
- 改动范围：`packages/happy-app` 发送 meta、`packages/happy-wire` message meta schema、`packages/happy-cli` Claude runner、`docs/happy-droid/voice-mode.md`。
- 未修改线上 `happy-telegram`、上游 `happy`、代理/网络/VPN/Tailscale 配置。

### 实现结论

当 App 本地 `voiceModeEnabled=true` 时，`sync.sendMessage()` 会在用户消息 meta 中写入：

```text
voiceMode: true
appendSystemPrompt: <base happy-app system prompt> + <voice concise prompt>
```

本 fork `happy-cli` Claude runner 识别 `message.meta.voiceMode === true`，并兜底把同一条精简提示合并到 `appendSystemPrompt`；如果客户端已注入同一提示，则 runner helper 会去重。实际约束通过 Claude SDK `--append-system-prompt` 生效。

### 单元/协议测试

```text
yarn workspace happy-app test sources/voice/voiceMode.spec.ts --run --reporter verbose
结果：4 tests passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-app-vitest.log
```

```text
yarn workspace @slopus/happy-wire exec vitest run src/messages.test.ts --reporter verbose
结果：10 tests passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-wire-vitest.log
```

```text
yarn workspace happy exec vitest run src/voice/voiceModePrompt.test.ts --reporter verbose
结果：3 tests passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-cli-vitest.log
```

覆盖点：

- App voice prompt helper 会把精简提示追加到 base prompt。
- wire `UserMessageSchema` 接受 `meta.voiceMode=true` 与 `appendSystemPrompt`。
- CLI runner helper 会追加语音模式精简提示，并避免重复追加。

### 静态检查

```text
yarn workspace happy-app typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-app-typecheck.log
```

```text
yarn workspace @slopus/happy-wire typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-wire-typecheck.log
```

```text
yarn workspace happy typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-cli-typecheck.log
```

### Android 构建验证

```text
APP_ENV=development npx expo prebuild -p android --no-install
结果：Finished prebuild
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-expo-prebuild.log
```

```text
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/Hht/Library/Android/sdk \
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2

结果：BUILD SUCCESSFUL in 36s
日志：docs/happy-droid/logs/2026-06-23-voice-mode-meta-gradle-assembleDebug.log
APK：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
大小：452M
SHA-256：1151f9e209f4b1c727b73733dcbf8d151b2b93ff29d5ee0b9983dfc5ba75f01e
```

### 设备端验证状态

```text
adb devices
结果：List of devices attached 为空
```

当前没有在线 Android 设备/模拟器，因此未能在真机上发送一条语音模式消息并观察模型回复风格。已完成可自动化验证：App meta helper、wire schema、CLI runner helper、三个 workspace typecheck、Android prebuild、Gradle debug APK 构建。

## 2026-06-24 - P1 语音模式生成端感知 Codex 修复

### 范围

- 任务：修复 Codex runner 未识别 `voiceMode` / `appendSystemPrompt`，导致 App 创建 Codex 会话时语音模式精简约束不生效。
- 改动范围：`packages/happy-cli/src/codex/runCodex.ts`、Codex runner 单测、`docs/happy-droid/voice-mode.md`。
- 未修改线上 `happy-telegram`、上游 `happy`、代理/网络/VPN/Tailscale 配置。

### 实现结论

Codex runner 现在：

- `CodexEnhancedMode` 纳入 `customSystemPrompt` / `appendSystemPrompt`。
- `MessageQueue2` hash 纳入 prompt 字段，避免默认消息与语音提示消息被错误合批。
- `onUserMessage` 读取 `message.meta.appendSystemPrompt` / `customSystemPrompt`。
- `message.meta.voiceMode===true` 时调用与 Claude 相同的 `appendVoiceModeSystemPrompt()`，重复提示不会二次追加。
- `buildCodexTurnPrompt()` 在每轮 Codex `turn/start` 输入前拼入 prompt，确保 Codex 输出被同一语音精简提示约束。

### 单元测试

```text
yarn workspace happy exec vitest run src/codex/__tests__/voiceModePrompt.test.ts --reporter verbose
结果：3 tests passed
日志：docs/happy-droid/logs/2026-06-24-codex-voice-mode-vitest.log
```

覆盖点：

- `voiceMode=true` 时 `appendSystemPrompt` 和 Codex turn input 都包含精简提示。
- 已包含精简提示时不重复追加。
- prompt-bearing mode 与 default mode 的 hash 不同。

### 静态检查

```text
yarn workspace happy typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-06-24-codex-voice-mode-typecheck.log
```

### 设备端验证状态

本轮修复的是 happy-cli Codex runner 的生成端约束路径，未改 App native 代码；当前仍无在线 Android 设备/模拟器可做真实 Codex 会话风格验收。已完成可自动化验证：Codex runner 单测与 happy-cli typecheck。

### 2026-07-03 复验

```text
yarn workspace happy exec vitest run src/codex/__tests__/voiceModePrompt.test.ts src/voice/voiceModePrompt.test.ts --reporter verbose
结果：2 test files passed, 6 tests passed
日志：docs/happy-droid/logs/2026-07-03-voice-mode-runner-vitest.log
```

```text
yarn workspace happy typecheck
结果：tsc --noEmit passed
日志：docs/happy-droid/logs/2026-07-03-voice-mode-runner-typecheck.log
```
