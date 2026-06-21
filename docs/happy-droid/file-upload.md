# happy-droid 文件上传（P0）设计

> 对应交付物 P0.2：「App 内可选取本地文件（图片/文档/任意类型）上传，经 happy-server 存储路径，作为消息/附件发给当前 session」。
> 配套：picker 集成（DocumentPicker / ImagePicker）。下载（P0.3）另任务。
> 先读后写——本文基于 `arch-notes.md` 的结论。日期：2026-06-21。

## 1. 关键约束（来自通读）

- **happy-server 没有面向客户端的文件上传 HTTP 端点**。`storage/files.ts` 的 `putLocalFile`/S3 仅被 `githubConnect.ts`（服务端拉取 GitHub 头像）内部使用；`/files/*` 是**公开、明文、无鉴权**的本地文件 GET，不适合放用户文件。（已枚举全部 server POST 路由确认，见 arch-notes §3.3。）
- 唯一**现成且 E2E 加密**的客户端可写存储通道是 **artifacts**（`POST /v1/artifacts`），app 已有客户端 `sources/sync/apiArtifacts.ts`（此前只用于读，未用于写）。
- 硬性禁区：不碰线上 happy-telegram、不碰 upstream、不碰网络/代理。本任务**只改 happy-app**，不动 server 代码。

## 2. 方案选择：artifacts 通道（App-only，保持 E2E）

| 方案 | 取舍 | 结论 |
|---|---|---|
| **artifacts 通道**（采用） | 复用现有端点、文件 E2E 加密、纯 App 改动、与 P0.3「文件 ref / artifact」措辞一致 | ✅ |
| 新增 server 上传端点 | 更贴合「存储路径」字面，但要改 server、且默认明文落盘/公开可读，需额外加密+鉴权 | ✗（超出 App-only + E2E） |
| 消息内联 base64 | 最简单但撑大加密消息体 | ✗（仅极小文件） |

> 选择已在任务中向 supervisor 提出确认（默认推荐 artifacts），按推荐落地。

## 3. 数据编码

一个附件 = 一个 artifact：

- **header**（`ArtifactHeader`，AES-256 加密）：`{ title: <文件名>, sessions: [sessionId], draft: true }`
  - `draft: true` 使其从 artifact 列表 UI 隐藏，避免文件 blob 污染列表。
- **body**（`ArtifactBody = { body: string }`，AES-256 加密）：`body` 内放 JSON 字符串
  ```json
  { "v": 1, "kind": "file", "name": "...", "mimeType": "...", "size": 1234, "dataBase64": "..." }
  ```
  保持 artifact 既有 `{ body: string }` 形状不变（无需改 server / encryptor）。
- **dataEncryptionKey**：每个 artifact 随机 32B AES key，用账号 content 公钥经 `encryption.encryptEncryptionKey()` 加密后 base64。

## 4. 附件如何「随消息发给当前 session」

两条并行携带，互不依赖：

1. **文本标记（runner 无关）**：消息 `content.text` 末尾追加一行
   `[attachment: <name> (<mime>, <size>) artifact:<id>]`
   —— 对齐线上桥 `[文件: <path>]` 的 prompt 标记约定（arch-notes §5.6），**任何 runner（桥或未来 cli）读 text 即可见**。
   同时把用户原始输入设为 `meta.displayText`，UI 仍展示干净文本，标记只进真正下发的 text。
2. **结构化 meta（UI / 未来 runner 用）**：`meta.attachments: MessageAttachment[]`（`{ artifactId, name, mimeType, size }`），在 app 的 `typesMessageMeta.ts` 的 `MessageMetaSchema` 中**新增可选字段**（app 内 schema，非 happy-wire）。

## 5. 改动清单（happy-app）

| 文件 | 改动 |
|---|---|
| `sources/sync/typesMessageMeta.ts` | `MessageMetaSchema` 增 `attachments?`；导出 `MessageAttachment` 类型 |
| `sources/sync/attachments.ts`（新增） | 纯逻辑：`PickedFile` 类型、大小上限、附件 body 编/解码、文本标记格式化、字节格式化 |
| `sources/sync/attachments.spec.ts`（新增） | 编/解码 + 标记 + 字节格式化单测（vitest） |
| `sources/sync/sync.ts` | 新增 `uploadAttachment(sessionId, file)`（加密+createArtifact）；`sendMessage` 增 `attachments` 参数（追加标记 + 写 meta + displayText） |
| `sources/hooks/useAttachmentPicker.ts`（新增） | 封装 ImagePicker / DocumentPicker → `PickedFile`（经 `expo-file-system` File API 读字节 → base64） |
| `sources/components/AgentInput.tsx` | 新增可选 `onAttachPress` prop + 附件按钮（紧邻文件查看按钮） |
| `sources/-session/SessionView.tsx` | 待发附件状态 + chip 行 + 选择/上传/发送接线 |
| `sources/text/translations/*.ts` | 新增 `session.attach/attachPhoto/attachDocument/attachmentFailed/attachmentTooLarge`（全部 10 种语言） |

## 6. 限制与验证

- 大小上限 **10 MB**（base64 入库，超限报错提示）。
- 验证：`yarn typecheck` 通过；`attachments.spec.ts` 单测通过。真机/模拟器端到端（选文件→上传→消息携带）记入 `e2e-report.md`（后续）。

## 7. 明确延后（不属本任务）

- **agent 实际消费附件并回复** —— 需 P1 的本 fork runner（happy-cli daemon）落地后才打通；线上桥（绑 Bot、只读）不在范围。
- **文件下载/预览（P0.3）** —— 独立任务。
