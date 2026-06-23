# happy-droid 架构笔记（arch-notes）

> 通读 happy-wire / happy-app / happy-server / happy-cli + 只读参照 happy-telegram 后的架构笔记。
> 目的：为后续 P0（文件上传下载、服务端可配）、P1（自建 Session、对齐自定义指令、语音模式）打底。
> 所有 `file:line` 引用相对仓库根 `/Users/Hht/Documents/10.github/happy-droid`（telegram 部分相对 `/Users/Hht/Documents/10.github/happy-telegram`，**只读**）。
> 日期：2026-06-21。

---

## 0. 全局数据流（先看这张图）

```
                          E2E 加密（libsodium / TweetNaCl，密钥永不上服务器）
   ┌────────────┐  socket.io /v1/updates + REST /v1,/v2,/v3 ┌──────────────┐
   │  客户端     │ ────────────────────────────────────────► │ happy-server │
   │ (user-     │ ◄──────────────── update / ephemeral ───── │  (中转+存储)  │
   │  scoped)   │                                            └──────┬───────┘
   │ happy-app  │                                                   │  同一账号下
   │ happy-tg桥 │                                            machine-scoped socket
   └────────────┘                                                   │
                                                            ┌────────▼────────┐
                                                            │  Runner (machine)│
                                                            │ happy-cli daemon │ ──► Claude Code
                                                            │ 或 happy-telegram│      (claude 二进制 / ACP)
                                                            └─────────────────┘
```

- **三类 socket 角色**（服务端按 `clientType` 区分，`packages/happy-server/sources/app/api/socket.ts:35-99`）：
  - `user-scoped`：手机/网页客户端（happy-app、telegram 桥都用这个连），收该账号全部事件。
  - `session-scoped`：绑定单个 session 的客户端。
  - `machine-scoped`：runner/daemon（happy-cli），收 machine 相关更新 + 在线状态。
- **服务器只中转密文**：消息正文 `{ t:'encrypted', c: base64 }`，服务端看不到明文；密钥来自配对时拿到的账号主密钥。
- **谁跑 Claude**：不是服务器，而是注册为 machine 的 runner（happy-cli daemon 或 happy-telegram 桥）。**这是 P1「自建 Session 谁来跑」的关键** → 见 §6.3。

---

## 1. happy-wire —— 协议 / schema 层

包 `@slopus/happy-wire`，只依赖 `zod` + `cuid2`，定义所有跨端消息契约。被 app / server / cli 共同 import，防止 schema 漂移。

### 1.1 线级容器（加密外壳）
`SessionMessage`（`packages/happy-wire/src/messages.ts:12-20`）：
```
{ id, seq, localId?, content: { t:'encrypted', c: base64 }, createdAt, updatedAt }
```
`content.c` 是加密后的 base64 负载；`id/seq/createdAt` 等元信息明文。

### 1.2 两套内层协议（解密后的负载）
| | Legacy（**当前生产用**） | Session Protocol（冻结，未上生产） |
|---|---|---|
| 判别 | 外层 `role:'user'｜'agent'` | 外层 `role:'session'` |
| 文件 | `legacyProtocol.ts:4-27` | 结构化事件流 `sessionProtocol.ts` |
| 状态 | 简单 `{role,content,meta}` | `SessionEnvelope` + 9 种 `SessionEvent` |

- **Legacy User**：`{ role:'user', content:{type:'text',text}, meta? }`（`legacyProtocol.ts:4-12`）
- **Legacy Agent**：`{ role:'agent', content:{type, ...passthrough}, meta? }`（`legacyProtocol.ts:15-24`）
- **Session Protocol** 含 9 种事件：`text / service / tool-call-start / tool-call-end / file / turn-start / start / turn-end / stop`（`sessionProtocol.ts:18-92`）。其中 **`file` 事件** `{ t:'file', ref, name, size, mimeType?, image?{width,height,thumbhash} }`（`sessionProtocol.ts:46-59`）是 agent 产出文件的结构化表示——P0 文件下载会用到。
- 顶部有警告注释说 session protocol 尚未用于生产（`sessionProtocol.ts:1-12`）。**App 增量改造应沿用 Legacy**。

### 1.3 ⭐ `meta` 字段（语音模式的天然挂载点）
`MessageMetaSchema`（`packages/happy-wire/src/messageMeta.ts:3-14`，已亲自核对）：
```
{ sentFrom?, permissionMode?, model?, fallbackModel?,
  customSystemPrompt?, appendSystemPrompt?,        // ← 关键
  allowedTools?, disallowedTools?, displayText? }
```
- `meta` 随负载一起加密，但对持密钥方可见，是**客户端给消息打标的合法通道**。
- **重大发现**：`appendSystemPrompt` / `customSystemPrompt` **已存在**。语音模式「让生成端更精炼」无需新增协议字段——App 在语音模式下用 `meta.appendSystemPrompt` 注入「当前为语音模式，1–3 句口语化、省略代码块」，由 runner 透传给 Claude 即可。详见 §6.4。
- 若想要更显式的开关，也可给 schema 加 `voiceMode?: boolean`（happy-wire 是本 fork 内、可改）。

### 1.4 上层更新容器
`CoreUpdateContainer`（`messages.ts:88-94`）`{ id, seq, body, createdAt }`，`body` 判别联合：`new-message` / `update-session` / `update-machine`（`messages.ts:50-79`）。版本化加密值 `VersionedEncryptedValue`（乐观并发）用于 metadata / agentState。
入口 `src/index.ts` re-export messages / legacyProtocol / sessionProtocol / **voice**。

### 1.5 voice schema（已核对 `src/voice.ts`）
`VoiceConversationResponse`（granted/denied 判别联合）+ `VoiceUsageResponse`——这是 **ElevenLabs 实时语音**的授权/用量响应（付费墙、签名 URL），**不是**本任务要做的「客户端 TTS + 安卓 STT」。两者要区分：见 §6.4。

---

## 2. happy-app —— RN/Expo 客户端

技术栈：Expo SDK 55 / RN 0.83 / TS strict / Unistyles / expo-router v6 / socket.io / libsodium / LiveKit + ElevenLabs（实时语音）。源码根 `packages/happy-app/sources/`，路径别名 `@/* → sources/*`。

### 2.1 配对 / 鉴权（QR）
- 生成密钥对：`crypto_box_seed_keypair`（`sources/auth/authQRStart.ts:12-19`）。
- 发起：POST `${serverUrl}/v1/auth/account/request`（`authQRStart.ts:21-43`）；轮询：`authQRWait.ts:12-55`，收到 box 加密的 `response`，解出账号主密钥。
- 凭据存储：`expo-secure-store`（原生）/ localStorage（web），key `auth_credentials`（`sources/auth/tokenStorage.ts:14-60`）。
- 全局状态：`sources/auth/AuthContext.tsx`。

### 2.2 加密
- 库：`@more-tech/react-native-libsodium`（原生）+ `libsodium-wrappers`（web）。
- 主密钥 → `deriveKey(master,'Happy EnCoder',['content'])` 派生 content key（`sources/sync/encryption/encryption.ts:17`）。
- box（公钥，含 ephemeral pubkey+24B nonce+密文）/ secretbox（对称）：`sources/encryption/libsodium.ts:8-57`。
- 每 session 数据密钥 + 批量解密 + 缓存：`sources/sync/encryption/sessionEncryption.ts`。

### 2.3 同步层
- socket.io 单例 `apiSocket`（`sources/sync/apiSocket.ts:27-279`）：连 `${serverUrl}/v1/updates`，auth `{token, clientType:'user-scoped'}`，仅 websocket，自动重连。
- RPC：`sessionRPC(sid,method,params)` / `machineRPC`（`apiSocket.ts:115-150`，加密 params 后 `emitWithAck`）。
- REST：`request(path,opts)` 带 `Authorization: Bearer`（`apiSocket.ts:168-188`）。
- 发消息：`sync.sendMessage(sessionId, text)`（`sources/sync/sync.ts` 附近）。

### 2.4 ⭐ 服务端地址可配（P0，已亲自核对 `serverConfig.ts` 全文）
- **生效路径**：`getServerUrl()` 优先级 = MMKV `custom-server-url`（运行时可改，跨登出保留）→ `process.env.EXPO_PUBLIC_HAPPY_SERVER_URL` → 默认 `https://api.cluster-fluster.com`（`sources/sync/serverConfig.ts:10-14`）。socket 与 REST 都走它。
- `setServerUrl()` / `validateServerUrl()`（仅 http/https）已具备 → **运行时改服务器地址的能力已存在**。
- **与现有 Happy Telegram 桥对齐**：桥端只读核对结果为 `/Users/Hht/Documents/10.github/happy-telegram/src/config.ts` 中 `serverUrl = process.env.HAPPY_TG_SERVER_URL || fileEnv.HAPPY_TG_SERVER_URL || 'http://localhost:3005'`，`server-client.ts` 使用同一个 `config.serverUrl` 访问 `/v1/auth`、REST baseURL 与 socket.io `/v1/updates`，auth 同为 `{ token, clientType:'user-scoped' }`。因此 App 与桥共用后端的判定标准是：桥端运行时 `HAPPY_TG_SERVER_URL` 与 App 的 `EXPO_PUBLIC_HAPPY_SERVER_URL`（或应用内 Server Configuration 写入的 MMKV `custom-server-url`）必须是同一个 base URL。
- **本次实际对齐结论**：本机桥配置未发现未注释的 `HAPPY_TG_SERVER_URL`，因此桥端实际会落到默认 `http://localhost:3005`。本轮选择 App 侧对齐桥端：构建/验证时显式设置 `EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005`，并用单测覆盖 env 与 MMKV override 优先级。若后续桥端显式切到生产 `https://api.cluster-fluster.com`，App 侧也必须同步改为同一 URL。
- ⚠️ **不一致点（需留意）**：`sources/sync/appConfig.ts:87-89` 另读的是 `EXPO_PUBLIC_SERVER_URL`（少了 `HAPPY_`）。任务规定的变量名是 `EXPO_PUBLIC_HAPPY_SERVER_URL`（与 `serverConfig.ts` 一致）。P0「服务端可配」以 `getServerUrl()` 这条链为准；appConfig 的 `serverUrl` 用途不同，后续若发现冲突需对齐。

### 2.5 Session 模型与 App 自建/列出/切换（客户端）
- 类型 `sources/sync/storageTypes.ts:87-117`：`id, seq, metadata, agentState, active, presence, todos, draft, permissionMode/modelMode/effortLevel(本地)` 等。
- **当前 P1 结论**：App 不依赖 Bot/Telegram 桥即可自建、列出、切换 session；前置条件是同一 Happy 后端下有在线的本 fork `happy-cli daemon` machine。具体 UI 与同步链路见 `docs/happy-droid/session-ui-sync.md`。
- **新建**：`sources/app/(app)/new/index.tsx` 选择 machine/path/worktree/agent/permission/model 后，调用 `machineSpawnNewSession()`；`sources/sync/ops.ts` 通过 encrypted `apiSocket.machineRPC(machineId, 'spawn-happy-session', ...)` 请求 daemon 创建 session。
- **列出**：`sources/sync/sync.ts` 的 `fetchSessions()` 调用 `GET /v1/sessions`，解密 metadata/agentState 和 session data key 后 `applySessions()`；`storage.ts` 重建 `sessionListViewData`，供 `SessionsList`、active sessions、recent sessions 等 UI 消费。
- **切换**：列表、active group、recent 页面统一经 `useNavigateToSession()` / `navigateToSession(router, sessionId)` 进入 `/(app)/session/{id}`；不需要桥端 chat/session 绑定。
- **消息同步**：用户消息走 `POST /v3/sessions/{sessionId}/messages`；App 增量拉取走 `GET /v3/sessions/{sessionId}/messages?after_seq=...`；socket `/v1/updates` 的 `new-message`、`new-session`、`update-session` 负责触发刷新。

### 2.6 文件能力（P0 现状与缺口）
- 已有：会话内文件**查看/浏览 git 文件**（`sources/app/(app)/session/[id]/file.tsx`、`files.tsx`），artifacts CRUD（`sources/sync/apiArtifacts.ts`，REST `/v1/artifacts`）。
- **缺口**：没有 `expo-image-picker`/`expo-document-picker`；消息目前纯文本，**无附件上传**；artifact 系统未与「消息附件」打通。
- P0 落点建议：见 §6.1。

### 2.7 语音现状（要分清两条线）
- 已有 **ElevenLabs 实时语音**（WebRTC 对话）：`sources/realtime/RealtimeVoiceSession.tsx`、`voiceHooks.ts`、`voiceConfig.ts`；麦克风权限 `sources/utils/microphonePermissions.ts`（expo-audio）。
- **缺口（本任务的语音模式）**：没有「收到 agent 文字 → 安卓系统 **TTS 朗读**」、没有「安卓系统 **STT** 把说话转文字再发」。本任务的语音模式是**客户端本地 TTS/STT + 生成端精简**，与 ElevenLabs 实时语音是**两套东西**，不要混用。→ §6.4。

---

## 3. happy-server —— API 面（中转 + 存储）

源码 `packages/happy-server/sources/app/api/`。

### 3.1 socket.io
- 入口 `socket.ts:16-155`，path `/v1/updates`，握手 auth `{token, clientType, sessionId?, machineId?}`，`auth.verifyToken()`（`socket.ts:65`，token 由 privacy-kit 从 `HANDY_MASTER_SECRET` 派生）。
- 事件路由 `eventRouter.ts`：收件人过滤器 `all-interested-in-session / user-scoped-only / machine-scoped-only / all-user-authenticated`。
- 处理器：`sessionUpdateHandler`（message / update-metadata / update-state / session-alive / session-end）、`machineUpdateHandler`、`artifactUpdateHandler`、`rpcHandler`、`usageHandler`。
- 消息创建 `sessionUpdateHandler.ts:186-245`：分配 seq → 建 `SessionMessage` → 广播 `update`（`new-message`），不回发给发送者。

### 3.2 Session REST
- v1：`GET/POST /v1/sessions`（POST 按 `tag` 去重创建，返回含 `dataEncryptionKey`）、`GET /v1/sessions/{id}/messages`、`DELETE`（`sessionRoutes.ts:14-376`）。
- v2：`/v2/sessions/active`、游标分页 `/v2/sessions`。
- v3：`GET /v3/sessions/{id}/messages?after_seq=&limit=`、`POST /v3/sessions/{id}/messages`（批量、按 `localId` 幂等）（`v3SessionRoutes.ts:50-221`）。**runner 回写走 v3 批量。**

### 3.3 文件 / artifacts / 存储
- **artifacts**（加密内容直存 DB）：REST `/v1/artifacts`（GET/POST）、`/v1/artifacts/{id}`（GET/POST 更新带版本冲突/DELETE）（`artifactsRoutes.ts`），socket 亦可 CRUD。结构 `header/body`（bytes）各自版本化 + `dataEncryptionKey`（`schema.prisma` Artifact）。
- **静态文件**：`GET /files/*` 从本地目录服务，带路径穿越防护（`api.ts:59-75`）。
- **UploadedFile** 模型（`schema.prisma` 约 225-239）：`accountId, path, width/height/thumbhash, reuseKey`（去重用）。
- ⚠️ v1 路由里**没看到显式的文件上传 REST 端点**；S3/minio 在 server 脚本里有（`yarn s3`），但上传通道需进一步确认（→ §7 待验证）。`sessionFileEvent.ref`（§1.2）是 agent 侧文件引用的形态。

### 3.4 voiceRoutes（= ElevenLabs，不是本任务的 TTS/STT）
- `POST /v1/voice/conversations`（拿签名 URL + 查限额）、`GET /v1/voice/usage`（`voiceRoutes.ts:118-257`）。免费 1h/30天、硬顶 5h，走 RevenueCat 订阅校验。**与本任务语音模式无关**。

### 3.5 machine 注册（runner 入口）
- `POST /v1/machines`（注册/取回，`[accountId,id]` 幂等，emit `new-machine`）（`machinesRoutes.ts:11-108`）。
- socket：`machine-alive / machine-update-metadata / machine-update-state`（乐观并发）；上下线广播 ephemeral（`socket.ts:104-131`）。

### 3.6 鉴权
- 设备：`POST /v1/auth`，TweetNaCl Ed25519 签名挑战 → 验签 → `createToken`（`authRoutes.ts:8-242`）。
- 终端/CLI 配对：`/v1/auth/request` + `/v1/auth/request/status`（轮询）+ `/v1/auth/response`（手机批准）。
- HTTP 装饰器 `enableAuthentication.ts` 校验 `Bearer` → set `request.userId`。

---

## 4. happy-cli —— runner（machine 端执行器，P1 候选）

源码 `packages/happy-cli/src/`。它把 happy-server 的 session 接到本地 Claude 执行。

### 4.1 注册为 machine
- `authAndSetupMachineIfNeeded()`（`src/ui/auth.ts:17-281`，`src/index.ts:711-718`）：凭据存 `~/.happy`，ephemeral 挑战-应答；machine UUID 经 `ApiClient.getOrCreateMachine()`（`src/api/api.ts:180-195`）上报，metadata 含 host/platform/版本/能力。

### 4.2 收消息 → 跑 Claude
- 建 session：`ApiClient.getOrCreateSession()` → REST POST `/v1/sessions`（`src/claude/runClaude.ts:119`）。
- socket：`ApiSessionClient` 连服务器，listen `update`，`body.t==='new-message'` 解密后 `routeIncomingMessage()`（`src/api/apiSession.ts:173-215`），回调 `onUserMessage()`。
- 跑 Claude：`claudeRemote()` 经 SDK 起 claude 二进制（`src/claude/claudeRemote.ts`、`claudeRemoteLauncher.ts:27-200`）。

### 4.3 回写响应 / 工具调用
- Claude 日志 → `mapClaudeLogMessageToSessionEnvelopes()` 映射为 SessionEnvelope → 加密 + base64 入 outbox → `flushOutbox()` 批量 POST `/v3/sessions/{id}/messages`（`src/api/apiSession.ts:313-415`）。
- 权限：SDK `canCallTool()` 回调 → 生成权限请求发回 → 手机批准 → resolve（`src/claude/utils/permissionHandler.ts:116-164`）。RPC 处理 bash/read-file/write-file 等（`src/modules/common/registerCommonHandlers.ts:136-250`）。

### 4.4 ⭐ 能否当轻量 runner（P1 关键）
**能。** daemon 模式无需 TTY：`happy daemon start` 后连服务器，手机发 RPC `spawn-happy-session` → daemon 起 `happy claude --happy-starting-mode remote --started-by daemon`（`src/daemon/run.ts:42-478`，控制口绑 127.0.0.1）。只需凭据文件 + server URL，**不依赖 telegram 桥**。

### 4.5 ⭐ 语音/精简的注入点（P1 语音模式）
- `EnhancedMode`（`src/claude/loop.ts:16-24`）已含 `customSystemPrompt` / `appendSystemPrompt` / `model` / `allowedTools` 等字段（但注释说尚未全部接到 SDK）。
- **落地路径**：消息 `meta.appendSystemPrompt`（§1.3）→ loop 接收用户消息时透传 → `claudeRemoteLauncher` 应用到 SDK system prompt。这就是「生成端感知语音模式」的实现位，**全在本 fork 内、不碰线上桥**。

---

## 5. happy-telegram —— 线上桥（⚠️ 只读参照，禁改）

`/Users/Hht/Documents/10.github/happy-telegram/src/`。学它「怎么连后端 / 处理自定义指令」，App 要对齐。

### 5.1 连接 & 加密
- `server-client.ts`：REST `/v1/auth`（Ed25519 挑战签名 → JWT）→ socket.io `/v1/updates`（auth `{token, clientType:'user-scoped'}`）；消息走 `/v3/sessions/*`。收到 `{t:'encrypted',c}` 用 `decryptLegacy` 解（`server-client.ts:52-193`）。
- `encryption.ts`：TweetNaCl **secretbox**（24B 随机 nonce 前置 + 密文，整体 base64）；鉴权用 `sign.keyPair.fromSeed(secret)` 的 Ed25519 detached 签名。**与 happy-app 的 libsodium 兼容（同 NaCl 原语）**。

### 5.2 ⭐ 自定义指令枚举（App 要对齐，`bridge.ts`）
桥处理的斜杠命令（`BRIDGE_COMMANDS`，`bridge.ts:174-180`，分发 1496-1525）：

| 命令 | 语法 | 作用 |
|---|---|---|
| `/help` `/start` | — | 帮助 |
| `/new` | `/new [dir] [name] / -name <n>` | 新建 session 并切换 |
| `/connect` | `/connect <claude-sid前缀>` | 接管已有 Claude CLI 会话（≥8 字符） |
| `/sessions` | — | 列出活跃 session（状态/名/8位ID/cwd） |
| `/switch` | `/switch <名｜ID前缀>` | 切换当前 session（emit `session_switched`） |
| `/current` | — | 当前 session 详情 |
| `/history` | — | 拉最近 5 条消息 |
| `/cwd` | `/cwd <dir>` | 改工作目录（支持 `~`） |
| `/name` `/rename` | `<text>` | 重命名（重名追加 -2/-3） |
| `/model` | `[name]` | 看/设模型（sonnet/opus/haiku，verbatim 传 `--model`） |
| `/thinking` | `[on｜off]` | 扩展思考开关 |
| `/mode` | `[default｜acceptEdits｜bypassPermissions｜plan]` | 权限模式 |
| `/engine` | `[cccli｜ccacp｜codex]` | 执行引擎（cccli=每轮一进程；acp=持久会话） |
| `/system_prompt` | `[default｜mythos]` | 系统提示（mythos=Fable-5，仅 cccli） |
| `/lifecycle` | `[default｜cycle]` | 生命周期（cycle=空闲≥30min 重开） |
| `/stop` | — | 杀进程 + 清队列 |
| `/queue` | — | 看排队消息 |
| `/close` `/closeall` | — | 归档当前 / 全部 session |

其余 `/xxx` **原样转发给 Claude**（`/compact`、`/clear`、`/cost`、`/agents`、`/init` 等，`bridge.ts:1055-1063`）。

**消息前缀**（非斜杠，控制队列/执行，`bridge.ts:183-193`）：
- `>>`／`》》`／`＞＞` = **steer**（打断当轮、注入新消息，仅 cccli）
- `!!`／`！！` = **interrupt**（杀进程、清队列、立即跑）
- `--`／`——`／`––` = **unqueue**（丢最后一条排队）

### 5.3 ⭐ MCP 工具枚举（`mcp-server.ts`，stdio JSON-RPC）
| 工具 | 入参 | 作用 |
|---|---|---|
| `send_photo` | `{path(绝对), caption?}` | 发图到绑定 chat，≤10MB，路径须在允许根内 |
| `send_document` | `{path(绝对), caption?}` | 发任意文件，≤20MB |
| `ask_user_question` | `{questions:[{question,header?,multiSelect?,options:[{label,description?}]}]}` | 问用户（按钮/自由文本），POST 回环 `/ask`，5min 超时 |
| `submit_async_task` | `{command,cwd?,label?,timeout_seconds?}` | 提交长任务给八爪鱼异步队列，完成后 webhook 回桥 |

协议版本 `2024-11-05`，serverInfo `{name:'happy_tg'}`（`mcp-server.ts:456-481`）。

### 5.4 session 绑定 Bot（与 App 自建的差异）
- `SessionState`（`bridge.ts:262-290`）：`serverSessionId`（服务端持久）+ `claudeSessionId`/`acpSessionId`（本地引擎 resume）+ cwd/model/thinking/permissionMode/engine/systemPrompt/lifecycle/messageQueue…
- **绑定方式**：session 本身 channel 无关；适配器注册「MCP env resolver」把 `sessionId → {channel, env(bot 凭据)}`，Claude 启动时把 `TELEGRAM_BOT_TOKEN/CHAT_ID` 注入 MCP 子进程环境，由此把 `send_photo` 等路由回正确 chat（`bridge.ts:549-559, 1239-1256`）。`/switch` 只 emit 事件让适配器重绑。
- metadata 存服务端（NaCl secretbox 加密）：`{path, host:'happy-telegram', name, archived}`，乐观版本更新；重启从服务端重载。
- 文件：入站文件暂存 `~/.happy/tg-files/<sid>/`，prompt 里加 `[文件: <abs>]` 标记给 Claude；出站经 `send_photo/send_document` 校验路径+大小后发出。

---

## 6. 关键设计结论（对照交付物）

### 6.1 P0 文件上传/下载——落点
- **上传**：加 `expo-document-picker`/`expo-image-picker`（app 目前都没有）→ 选文件 → 用 **artifact 通道**（`/v1/artifacts`，已具加密+版本化）或新增上传端点，把文件 ref 作为附件挂到消息。需先确认 server 端正式上传通道（§7）。参照桥的「`[文件: abs]` prompt 标记 + send_document」模式。
- **下载**：监听 agent 消息里的 `file` 事件 `ref`（§1.2 `sessionFileEvent`）/ artifact → 经 `/files/*` 或 artifact GET 拉取 → 用 `expo-file-system` 存手机 + `expo-image` 预览。

### 6.2 P0 服务端可配——已基本就绪
- 运行时：app 设置里调 `setServerUrl()`（MMKV，§2.4）即可指向 dev/自建后端；构建时设 `EXPO_PUBLIC_HAPPY_SERVER_URL`。
- 待办：补一个设置 UI 入口（若没有）；对齐 `appConfig.ts` 的 `EXPO_PUBLIC_SERVER_URL` 命名不一致（§2.4 ⚠️）。

### 6.3 ⭐ P1 自建 Session——「谁跑 Claude」方案
问题：App 新建的 session 需要一个 machine 端 runner 执行 Claude；线上 telegram 桥绑定 Bot 且禁改，不能复用。

| 方案 | 做法 | 权衡 |
|---|---|---|
| **A（推荐）本 fork happy-cli daemon 当 runner** | 在一台机器（如本机/服务器）跑 `happy daemon start`（本 fork 内 §4.4），用独立凭据连同一后端；App 发 RPC spawn session | 复用成熟实现、支持权限/工具/v3 回写；需要一台常驻机器跑 daemon |
| B 自建轻量 runner | 仿 happy-cli 写最小执行器 | 可裁剪，但要重做鉴权/加密/回写，成本高、易踩坑 |
| C 复用桥 | —— | **禁止**（桥绑 Bot 且只读） |

**落地建议：A**。App 侧需实现/验收 session 列表/新建/切换 UI（§2.5 缺口），通过 machine RPC `spawn-happy-session` 让本 fork `happy-cli daemon` 创建并运行 session；runner 用本 fork happy-cli daemon。详细方案、对比和责任边界见 `docs/happy-droid/session-runner.md`。

### 6.4 ⭐ P1 语音模式——感知点在哪
**两条线分清**：
1. 客户端朗读/输入 = **安卓系统 TTS + STT**（如 `expo-speech` 朗读、`@react-native-voice/voice` 或系统 STT），纯客户端，App 内开关。**不是** ElevenLabs（§2.7/§3.4 那套是付费实时语音，别混）。
2. 生成端精简 = 让跑 Claude 的那端知道「现在是语音模式」。

**感知点 / 传递链**（全在本 fork 内，不碰线上桥）：
```
App 语音模式开 → 发消息时在 meta 打标:
   meta.appendSystemPrompt = "当前为语音模式：回复 1–3 句、口语化、不要代码块"
   (可选 meta.voiceMode=true，需给 happy-wire messageMeta 加字段)
        │  (随负载 E2E 加密)
        ▼
happy-server 原样中转（看不到明文，无需改）
        ▼
runner = 本 fork happy-cli：loop 收到 user 消息 → 读 meta.appendSystemPrompt
   → 经 EnhancedMode 注入 SDK system prompt (src/claude/loop.ts:16-24,
     claudeRemoteLauncher) → Claude 据此精简输出
```
- `appendSystemPrompt` / `customSystemPrompt` **已在 wire schema（§1.3）和 cli EnhancedMode（§4.5）中存在**，注入点现成，改动面小。
- 待写 `docs/happy-droid/voice-mode.md` 细化「感知点、传递、生效」。

---

## 7. 开放问题 / 待验证

1. **文件上传的正式 server 通道**：v1 路由未见显式上传端点；S3/minio 在 server 脚本存在。需确认是「artifact 直存 DB」还是「presigned S3 上传」，并据此定 P0 上传实现（§3.3/§6.1）。
2. **happy-cli EnhancedMode → SDK 接线完成度**：`loop.ts:16-24` 注释称 `customSystemPrompt/appendSystemPrompt` 「尚未全部接到 SDK」。语音模式落地前需确认/补全这条接线（§4.5）。
3. **env 变量命名不一致**：`serverConfig.ts` 用 `EXPO_PUBLIC_HAPPY_SERVER_URL`，`appConfig.ts` 用 `EXPO_PUBLIC_SERVER_URL`，需对齐（§2.4）。
4. **dev 后端搭建**：自测应起本 fork happy-server（`yarn env:up` / `packages/happy-server` 的 db/redis/s3 脚本），避免干扰线上桥；细节进 `build.md` / `e2e-report.md`。
5. **session protocol vs legacy**：当前生产用 legacy；若 agent 文件事件只在 session protocol 里结构化，需确认 legacy 下 agent 如何表达文件 ref（影响 P0 下载，§1.2/§6.1）。

---

## 附：关键路径速查

| 用途 | 路径 |
|---|---|
| 协议 schema | `packages/happy-wire/src/{messages,legacyProtocol,sessionProtocol,messageMeta,voice}.ts` |
| App 服务器地址 | `packages/happy-app/sources/sync/serverConfig.ts`（`getServerUrl/setServerUrl`） |
| App 同步/socket | `packages/happy-app/sources/sync/{apiSocket,sync}.ts` |
| App 加密 | `packages/happy-app/sources/{encryption/libsodium,sync/encryption/sessionEncryption}.ts` |
| App 配对 | `packages/happy-app/sources/auth/{authQRStart,authQRWait,tokenStorage,AuthContext}.ts(x)` |
| Server socket/路由 | `packages/happy-server/sources/app/api/{socket,eventRouter}.ts` + `routes/{session,v3Session,voice,machines,artifacts,auth}Routes.ts` |
| CLI runner | `packages/happy-cli/src/{daemon/run,api/apiSession,claude/{loop,claudeRemoteLauncher}}.ts` |
| 桥（只读参照） | `/Users/Hht/Documents/10.github/happy-telegram/src/{server-client,bridge,mcp-server,encryption}.ts` |
