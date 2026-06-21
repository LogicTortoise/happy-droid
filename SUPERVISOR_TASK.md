# SUPERVISOR_TASK — happy-droid（Happy 安卓客户端 fork）

> 本文件是 Supervisor（worker = claude-code）的**权威任务说明**。动手前**必读全文**。
> 本仓库是 `slopus/happy` monorepo 的 fork（`upstream` = 本机 `/Users/Hht/Documents/10.github/happy`）。

---

## 0. 一句话目标

把本 fork 里的 **`packages/happy-app`（Expo / React Native）** 改造成一个**独立的安卓 App**，
接入和现有 Happy Telegram 桥**同一个 Happy 后端**，核心能力是**文件上传/下载**，并支持**语音模式**与**自建 Session**。
最终产物：一个能在安卓手机上自测运行的 APK（不上架商店，自用）。

> 「原生安卓」= 跑在安卓手机上，**不要求**重写成 Kotlin。直接复用 Expo/RN 的 happy-app 是首选路线。

---

## 1. 硬性禁区（违反即判失败，最重要）

1. **绝对不要碰任何代理 / 网络 / proxy / VPN / Tailscale 配置。** 不改本机网络设置、不改任何 `proxy`/`http_proxy`/代理相关配置文件、不装/不配 Tailscale。网络与代理冲突由人工另行处理，**不属于你的工作范围**。
2. **绝对不要修改 `/Users/Hht/Documents/10.github/happy-telegram`**（那是我们正在使用的**线上桥**，改了会断我们的对话通道）。它只能**只读参考**。
3. **绝对不要修改 `upstream` 原仓库 `/Users/Hht/Documents/10.github/happy`**，以及本机其它任何仓库。所有改动只发生在本 fork（`happy-droid`）内。
4. 你的工作只有两件事：**App 的编写** 和 **测试**。不做运维、不做部署到生产、不动他人凭证。

---

## 2. 背景架构（先读懂再动手）

Happy 生态：客户端 ←(socket.io WebSocket + REST, E2E 加密)→ `happy-server` ←→ 运行 Claude 的 runner（happy-cli / 桥）。

**先读这些**（带着问题读，产出一份架构笔记到 `docs/happy-droid/arch-notes.md`）：

- `packages/happy-wire/`（README + `src/messages.ts` / `src/sessionProtocol.ts` / `src/legacyProtocol.ts`）：消息协议 / schema。
- `packages/happy-app/sources/`：现有客户端实现——`auth/`（QR 配对）、`encryption/`（libsodium/NaCl）、`sync/`（apiSocket、sync.ts）、聊天/会话 UI。
- `packages/happy-server/sources/app/api/`：`socket.ts`、`routes/`（`authRoutes`、`sessionRoutes`、`v3SessionRoutes`、`voiceRoutes`、文件/artifacts 相关）。
- `packages/happy-cli/`：machine 上如何把 session 接到 Claude 执行。
- **只读参考** `/Users/Hht/Documents/10.github/happy-telegram/src/`：
  - `server-client.ts`：一个 Node 客户端怎么连 happy-server（最佳参照）。
  - `bridge.ts`：**自定义指令**的处理逻辑、session 管理、消息队列。**枚举它支持的所有自定义指令**，App 要对齐。
  - `mcp-server.ts`：桥暴露的工具/指令（ask_user_question / send_photo / send_document 等）。
  - `encryption.ts`：TweetNaCl 用法。

**核心复用原则**：happy-app 已实现 QR 配对、E2E 加密、socket.io 同步、聊天 UI、图片处理。**在它之上增量改造，不要重写。**

---

## 3. 交付物（按优先级）

### P0 — 跑起来 + 文件能力（核心）
1. fork 能装依赖、能 typecheck、能用 Expo/EAS 出一个安卓 APK。在 `docs/happy-droid/build.md` 写清构建与自测步骤。
2. **文件上传**：App 内可选取本地文件（图片/文档/任意类型）上传，经现有 happy-server 存储路径，作为消息/附件发给当前 session。
3. **文件下载**：App 能把 session 中 agent 产出的文件 ref / artifact **下载保存到手机本地**，并能预览图片。
4. App 服务端地址可配（`EXPO_PUBLIC_HAPPY_SERVER_URL`），指向与现有桥相同的 Happy 后端。

### P1 — 自建 Session
5. App 能**自己新建 Session**（不依赖绑定 Bot——这点与 happy-telegram 的「多 Bot 绑定多 Session」模式不同）。App 内可列出、切换、新建会话。
6. **关键设计问题（discovery 必须回答并在 docs 记录）**：App 新建的 session 由谁来跑 Claude？现有 happy-telegram 桥不可改且绑定了 Bot。方案候选：用本 fork 的 `happy-cli` / 自建一个轻量 runner 作为 machine 端执行器。给出方案、权衡、落地。
7. 对齐 `bridge.ts` 里枚举出的**自定义指令**，让 App 内同样可用（能发这些指令并正确渲染结果）。

### P1 — 语音模式
8. **客户端朗读**：App 收到 agent 文字回复后，用安卓 TTS 朗读出来（语音模式开关可控）。语音**输入**用安卓系统 STT（说话转文字再发送）。
9. **生成端感知精简**：语音模式下，agent 的文字输出要**更精炼**（不像现在这么啰嗦）。这需要「生成 Claude 回复的那一端」感知到语音模式。
   - 不可改线上 happy-telegram 实现这一点。
   - 候选实现：App 在语音模式下，于消息 `meta` 打 voice 标记 / 注入简短的 system 提示（如「当前为语音模式，回复控制在 1–3 句、口语化、省略代码块」），由本 fork 内的 runner / 协议层识别并据此约束输出。
   - 在 `docs/happy-droid/voice-mode.md` 写清「感知点在哪、怎么传递、怎么生效」。

---

## 4. 方法论（怎么干）

- **先读后写**：每个 P 级任务先产出/更新 `docs/happy-droid/*.md` 设计说明，再改代码。概念分层清晰：区分「对外能力名」「架构/数据流」「具体实现」。
- **小步提交**：每个可验证的小改动一个 commit，更新 `docs/happy-droid/changelog.md`。
- **不破坏现有**：改造 happy-app 时保持它原有能力可编译可运行；新功能尽量加在可开关的入口后。
- **凭证/后端**：开发自测时**优先自起一个 dev 用的 happy-server 实例**（来自本 fork），避免干扰线上桥的真实会话；不要把测试数据灌进生产。绝不动代理。
- **遇到需要人工决策**：通过 Supervisor 的通知机制汇报，不要擅自改禁区内的东西。

---

## 5. 验证方式（每个交付都要验，缺一不可）

1. **静态**：`packages/happy-app` 与改动到的包 `tsc --noEmit` 通过；`lint`（若有）通过。
2. **构建**：happy-app 能完成 Expo/EAS 安卓构建，产出可安装 APK（或至少 `expo prebuild` + 本地 gradle assembleDebug 成功），日志留痕到 `docs/happy-droid/build.md`。
3. **单元/集成**：能加的单测加上（协议解析、加解密、文件上传下载的纯逻辑层）。
4. **端到端自测**：起本 fork 的 happy-server（dev），App（模拟器或 dev client）走通：配对 → 新建 session → 发消息 → **上传一个文件** → agent 回 → **下载一个文件** → 切到语音模式 → 看到回复被朗读且更精炼。把每步结果（截图/日志）记到 `docs/happy-droid/e2e-report.md`。无法在真机/模拟器完成的步骤，写清原因和替代验证。
5. 验证不通过的交付不算完成。

---

## 6. 参考路径速查

| 用途 | 路径 | 权限 |
|---|---|---|
| 本项目（改这里） | `/Users/Hht/Documents/10.github/happy-droid` | 读写 |
| 上游原仓库 | `/Users/Hht/Documents/10.github/happy` | 只读参考 |
| 线上桥（学它怎么连后端/处理指令） | `/Users/Hht/Documents/10.github/happy-telegram` | **只读，禁改** |
| 代理 / 网络 / Tailscale | 任何相关配置 | **禁碰** |
