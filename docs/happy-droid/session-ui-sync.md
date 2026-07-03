# P1 App 自建/列出/切换 Session UI 与同步逻辑

## 结论

App 已具备不依赖 Bot 的 session 管理主路径：用户在 App 内选择在线 machine、工作目录和 agent，App 通过 happy-server 的 machine RPC 请求本 fork `happy-cli daemon` 新建 session；随后 App 通过 `/v1/sessions` 列表同步、`/v3/sessions/{id}/messages` 消息同步和 socket `/v1/updates` 更新完成展示与切换。

本轮 P1 的实现边界：

- 不复用线上 `happy-telegram` 桥，不绑定 Bot/chat。
- 不让 App 本地运行 Claude，也不让 happy-server 运行 Claude。
- 复用已决策的 `happy-cli daemon` runner 架构。
- App 侧补强的重点是：确认 UI 入口、同步 API 与 machine/session RPC 链路完整，并用测试锁定关键 RPC contract。

## UI 入口

### 新建 Session

入口：`packages/happy-app/sources/app/(app)/new/index.tsx`

能力：

- 选择 machine：来自 `useAllMachines()`，只允许在线 machine 发送新建请求。
- 选择目录/path 与 worktree：目录最终解析为 daemon 机器上的绝对路径。
- 选择 agent：`claude`、`codex`、`openclaw`、`gemini`。
- 选择 permission/model/effort：保存在 App 本地 session 状态，随首条消息 meta 下发。
- 发送首条 prompt：session 创建成功并刷新列表后，通过 `/v3` 消息通道发送。

新建动作调用 `machineSpawnNewSession()`，RPC method 为 `spawn-happy-session`。

spawn 成功后，App 不直接假定本地 store 已立即拥有该 session。新建页会最多刷新 5 次 session 列表，直到 `GET /v1/sessions` 返回的新 session 完成解密并写入本地 `storage.sessions`，再设置 permission/model、发送首条 prompt 并跳转。这避免 daemon 已返回 `sessionId` 但 App 尚未初始化 session data key 时，首条消息发送被同步层静默跳过。

### 列出 Session

入口：

- `packages/happy-app/sources/components/MainView.tsx`
- `packages/happy-app/sources/components/SessionsListWrapper.tsx`
- `packages/happy-app/sources/components/SessionsList.tsx`
- `packages/happy-app/sources/components/ActiveSessionsGroup.tsx`
- `packages/happy-app/sources/app/(app)/session/recent.tsx`

数据源：

- `sync.fetchSessions()` 调用 `GET /v1/sessions`。
- `storage.applySessions()` 写入 `sessions`，并重建 `sessionListViewData`。
- `useSessions()` / `useVisibleSessionListViewData()` 供列表 UI 订阅。
- socket 收到 `new-session` / `update-session` 后触发 session refresh。

### 切换 Session

入口：

- session 列表 item 点击。
- active session 横向组点击。
- recent session 页面点击。
- command palette 选择。

统一通过 `useNavigateToSession()` / `navigateToSession(router, sessionId)` 跳转到 `/(app)/session/{id}`。切换不需要 Bot 绑定，也不需要桥端状态；App 只依赖 happy-server 中当前账号可见的 session id。

## 同步链路

### 新建

```text
App New Session UI
  -> machineSpawnNewSession({ machineId, directory, agent, approvedNewDirectoryCreation })
  -> apiSocket.machineRPC(machineId, 'spawn-happy-session', encrypted params)
  -> happy-server rpcHandler routes to selected machine
  -> happy-cli daemon spawnSession()
  -> daemon/agent creates server session through POST /v1/sessions
  -> daemon returns { type:'success', sessionId }
  -> App sync.refreshSessions() until local storage contains sessionId
  -> App navigateToSession(sessionId)
```

### 消息

```text
App sync.sendMessage(sessionId, text)
  -> encrypt legacy user message with session data key
  -> POST /v3/sessions/{sessionId}/messages
  -> daemon receives new-message update
  -> runner invokes agent
  -> runner encrypts agent output
  -> POST /v3/sessions/{sessionId}/messages
  -> App receives socket new-message and fetches via GET /v3/sessions/{sessionId}/messages
```

### 列表刷新

```text
App init / foreground / new-session socket event / manual refresh
  -> GET /v1/sessions
  -> decrypt session metadata + agentState
  -> initialize session encryption keys
  -> storage.applySessions()
  -> sessionListViewData rebuild
```

## Server Routes 对接

本任务涉及的 server API：

- `GET /v1/sessions`：App 列出与刷新 session。
- `POST /v1/sessions`：daemon/runner 创建 session，App 不直接调用。
- `GET /v3/sessions/{sessionId}/messages`：App 拉取增量消息。
- `POST /v3/sessions/{sessionId}/messages`：App 发送用户消息；runner 回写 agent 消息。
- socket `/v1/updates`：App user-scoped 更新流；daemon machine-scoped RPC/更新流。
- machine RPC `spawn-happy-session` / `resume-happy-session`：App 到 daemon 的创建/恢复控制面。

## 验收点

- 没有 Bot/chat 绑定前置条件；前置条件是同一后端下存在在线 `happy-cli daemon` machine。
- 新建 UI 不需要桥端参与，使用 machine RPC 到 runner。
- spawn 成功后必须等新 session 出现在 App 本地 store，再发送首条消息。
- 列表 UI 只从 server session 列表与 socket 更新派生。
- 切换 UI 只基于 session id 导航。
- 首条消息与后续消息都走 `/v3/sessions/{id}/messages`。
- 单测覆盖 `machineSpawnNewSession()` / `machineResumeSession()` 的 RPC method 与 payload，防止 App 与 daemon contract 漂移。

## 新建提交闭环状态与失败处理

本轮补强新建页提交闭环，不改变后端协议。目标是让用户能明确看到当前卡在哪一步，并且所有失败都停留在新建页，可修改配置后重试。

状态机：

```text
idle
  -> creating-worktree   （仅 new worktree）
  -> spawning-session    （machine RPC spawn-happy-session）
  -> syncing-session     （refresh /v1/sessions，直到本地 storage 有 sessionId）
  -> sending-message     （可选首条 prompt，走 /v3/sessions/{id}/messages）
  -> navigating
  -> idle
```

失败处理：

- machine 未选中 / 离线：不进入提交状态，直接展示错误。
- worktree 创建失败：状态回到 idle，保留输入和配置，展示错误。
- spawn 返回 `requestToApproveDirectoryCreation`：状态回到 idle，弹确认；用户确认后重新进入状态机。
- spawn 返回 `error` 或 RPC throw：状态回到 idle，展示 daemon/RPC 错误。
- session 已创建但同步超时：状态回到 idle，保留返回的 session id，提示可刷新列表或稍后打开。
- 首条消息发送失败：状态回到 idle，保留 session id 与 prompt，提示 session 已创建但首条消息未发送，可打开 session 后重试。

UI 约束：

- 提交期间禁用配置 picker、输入框和发送按钮，避免重复 spawn。
- 发送按钮显示 spinner；输入框下方显示当前步骤文案。
- 失败文案保留在 composer 下方，同时继续使用 Modal 作为显式提醒。
