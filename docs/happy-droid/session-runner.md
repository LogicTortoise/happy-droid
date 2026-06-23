# P1 自建 Session Runner 设计

## 结论

App 新建 session 后，**跑 Claude 的执行者是本 fork 的 `happy-cli daemon`，不是 App、不是 happy-server，也不是线上 `happy-telegram` 桥**。

落地决策：

- App 负责：选择在线 machine、工作目录、agent、权限模式、模型/effort，调用 machine RPC `spawn-happy-session`，随后进入新 session 并发送首条消息。
- happy-server 负责：账号鉴权、session/machine 存储、E2E 加密数据转发、socket/RPC 路由、v3 消息持久化。
- 本 fork `happy-cli daemon` 负责：作为 `machine-scoped` runner 在线，收到 `spawn-happy-session` 后启动本地 agent 进程，调用 Claude/Codex/Gemini/OpenClaw，处理权限、工具、文件 RPC，并把 agent 输出回写到 session。
- `happy-telegram` 仅只读参考，不参与 App 自建 session，也不作为 App 新建 session 的 runner。

本轮 P1 设计选择：**复用本 fork `happy-cli daemon` 作为唯一主路径**。自建轻量 runner 不进入当前落地范围。

## 当前代码事实

### App 侧已有入口

`packages/happy-app/sources/app/(app)/new/index.tsx` 已有新建 session UI：

- 选择 machine、path/worktree、agent、权限模式、model/effort。
- 离线 machine 会禁用发送并展示 offline help。
- `handleSend()` 调用 `machineSpawnNewSession()`；成功后 `sync.refreshSessions()`，设置本地 session 权限/模型，再发送首条 prompt。

`packages/happy-app/sources/sync/ops.ts` 中 `machineSpawnNewSession()` 调用：

```text
apiSocket.machineRPC(machineId, 'spawn-happy-session', {
  type: 'spawn-in-directory',
  directory,
  approvedNewDirectoryCreation,
  token,
  agent
})
```

`packages/happy-app/sources/sync/apiSocket.ts` 的 `machineRPC()` 使用目标 machine 的加密上下文，发送 `${machineId}:${method}` 的 RPC call。App 因此不需要知道 daemon 本地 HTTP 控制口，也不需要直接访问 runner 所在机器。

### happy-cli daemon 侧已有能力

`packages/happy-cli/src/api/apiMachine.ts` 以 `clientType:'machine-scoped'` 连接 `/v1/updates`，注册：

- `spawn-happy-session`
- `resume-happy-session`
- `stop-session`
- `stop-daemon`
- 通用 `bash/readFile/writeFile/listDirectory/getDirectoryTree/ripgrep` 等 session/machine RPC handler

`spawn-happy-session` 会调用 daemon 内部 `spawnSession()`。`packages/happy-cli/src/daemon/run.ts` 负责：

- `authAndSetupMachineIfNeeded()`：登录并注册/更新 machine。
- `startDaemonControlServer()`：仅本机 `127.0.0.1` 控制口，用于本地 CLI 管理，不暴露给 App。
- `ApiMachineClient.connect()`：通过 happy-server 的 machine socket 接收远端 RPC。
- `spawnSession()`：校验/创建目录，按 agent 启动本地 `happy` 子进程，等待子进程回报 server session id。

`packages/happy-cli/src/api/api.ts` 的 `getOrCreateSession()` 通过 `POST /v1/sessions` 创建服务端 session，并生成/加密 session data key。runner 后续通过 session socket/v3 API 收发消息。

### 线上桥的限制

`/Users/Hht/Documents/10.github/happy-telegram` 是正在使用的线上桥，硬性只读。它的 session 与 Telegram/WeChat adapter 绑定：

- adapter 保存 chat/user 到 session 的绑定。
- 桥为每个 session 注入 Telegram/WeChat MCP 环境变量。
- `send_photo/send_document/ask_user_question` 等工具回到 IM chat。

App 自建 session 不应该复用这些绑定，也不能改桥来服务 App。桥只作为“命令语义、MCP 工具、文件提示格式”的参考。

## 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. 复用本 fork `happy-cli daemon` | 在一台自己的机器上运行本 fork `happy daemon start`，daemon 用同一 Happy 后端注册为 machine；App 通过 machine RPC `spawn-happy-session` 新建 session | 已有鉴权、machine 注册、E2E 加密、RPC、权限、文件读写、v3 回写、多 agent、offline/reconnect 基础；和 App 现有新建 UI/ops 对齐；改动集中在本 fork | 需要一台常驻 runner 机器；需要用户完成 CLI 登录和 agent 本地认证；P1 仍需补 App 端可用性验证与命令对齐 | **采用** |
| B. 自建轻量 runner | 新写一个最小 Node runner，只支持 App 所需的 Claude 调用和消息回写 | 理论上更小；可完全按 App 需求裁剪 | 要重做登录/凭证、machine 注册、加密、socket/RPC、session data key、v3 消息、权限流、文件 RPC、agent 生命周期、resume/offline；会复制 happy-cli 复杂逻辑，风险高 | 不采用 |
| C. 复用线上 `happy-telegram` 桥 | 让 App 新 session 交给桥跑 | 桥已跑通 Claude 和自定义指令 | 明确禁改；桥绑定 Bot/chat；MCP 输出回 IM，不是 App；会干扰线上会话 | 禁止 |

## 采用方案 A 的架构

```text
Android App
  │ user-scoped socket + REST
  ▼
happy-server
  │ routes machine RPC to selected machine
  ▼
happy-cli daemon (machine-scoped)
  │ spawns happy agent process in selected cwd
  ▼
Claude/Codex/Gemini/OpenClaw CLI
```

数据流：

1. daemon 登录同一后端并注册 machine，App 通过 `fetchMachines()` 看到在线 machine。
2. 用户在 App 新建页选择 machine、目录、agent、权限/模型并输入首条 prompt。
3. App 调用 `machineSpawnNewSession()`，通过 encrypted machine RPC 发送 `spawn-happy-session`。
4. daemon 在对应目录启动本地 agent。agent 进程通过 `POST /v1/sessions` 创建或加载 server session。
5. daemon 将创建出的 `sessionId` 返回给 App。
6. App 刷新 sessions，进入该 session，发送首条消息。
7. daemon 监听 session 新消息，运行 agent，把输出映射为 session protocol/legacy message，经 `/v3/sessions/{id}/messages` 回写。
8. App 收到 socket 更新后展示 agent 回复。

## 责任边界

### App

- 不保存 Claude/Codex/Gemini/OpenClaw 凭证。
- 不执行 shell、文件系统、Claude 二进制。
- 只通过 happy-server 调用 machine/session RPC。
- 只在本地保存 UI 状态：last used machine/path/agent/model/permission。
- 对自定义指令提供 App 入口或文本发送能力，但命令执行语义最终由 runner 支持。

### happy-server

- 不运行 Claude。
- 不解密用户消息内容。
- 只负责鉴权、存储加密 blob、RPC 转发和 session/machine 状态广播。

### happy-cli daemon

- 持有本机 agent 凭证与执行环境。
- 拥有 cwd 和文件系统访问边界。
- 执行 agent、处理权限请求、文件读写、bash、ripgrep、session abort/stop。
- 对 App 上传附件的文本标记和 `meta.attachments` 做实际消费，是 P0 文件能力真正闭环的 runner 侧落点。

## 自定义指令对齐策略

线上桥的斜杠命令分两类：

- **会话管理类**：`/new`、`/sessions`、`/switch`、`/current`、`/cwd`、`/name`、`/model`、`/mode`、`/engine`、`/stop`、`/queue`、`/close`。
- **agent 原生命令类**：未由桥处理的 `/compact`、`/clear`、`/cost`、`/agents`、`/init` 等，桥会原样转发给 Claude。

App 对齐不应照搬 Telegram 文本菜单，而应映射为原生 UI + 兼容文本：

- 会话管理类优先做 App UI：新建页、session info、machine selector、permission/model/agent controls。
- 文本输入中保留 slash command 兼容路径：用户发送 `/compact` 等 agent 原生命令时，直接作为普通消息进入 runner。
- `/stop`、权限切换、模型切换等已存在 session/machine RPC 或本地 session 状态的，优先走结构化操作，不依赖 bridge。
- `send_photo/send_document/ask_user_question` 的 IM 回传语义在 App 中应对应为：agent 产出 file/artifact、App 下载预览；agent 问题渲染成 App 内交互控件。不要复用 Telegram bot token/env。

## 后续落地步骤

1. **runner 启动前置条件文档化**：写清本 fork `happy-cli` 如何登录同一后端、启动 daemon、确认 machine 在线。
2. **App 新建页验收**：用同一后端和在线 daemon，从 App 新建 session，确认 `spawn-happy-session` 返回 sessionId，首条消息可进入 session。
3. **runner 侧附件消费**：确保 P0 上传的 `[attachment: ...]` 文本标记和 `meta.attachments` 能被本 fork runner 解析为可读文件上下文。
4. **自定义指令矩阵**：为桥命令建立 App 对齐表，标明 UI 实现、RPC 实现、原样转发或不适用。
5. **语音模式衔接**：App 在语音模式下写 `meta.appendSystemPrompt`，happy-cli runner 将其透传给 agent system prompt。

## 验证计划

本任务是关键设计交付，不改功能代码。验收标准：

- 文档明确回答“App 新建 session 由谁跑 Claude”。
- 文档包含 `happy-cli daemon` 与自建轻量 runner 的方案对比、权衡和决策。
- 文档明确线上 `happy-telegram` 不可复用的原因。
- 静态检查：`yarn workspace happy-app typecheck`。
- 构建检查：复用当前 Android 本地构建链路执行 `./gradlew :app:assembleDebug`，证明文档改动未破坏 App。
- E2E 记录：在 `docs/happy-droid/e2e-report.md` 记录本设计结论与验证命令；真正 App 新建 session 走通留到后续实现任务。
