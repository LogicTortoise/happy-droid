# happy-droid 文件下载（P0）设计

> 对应交付物 P0.3：「App 能把 session 中 agent 产出的文件 ref / artifact 下载保存到手机本地，并能预览图片」。
> 日期：2026-06-23。动手前记录设计，后续实现只改 `packages/happy-app` 与本目录文档。

## 1. 范围与约束

- 不改 happy-server、happy-telegram、upstream，也不碰任何网络/代理配置。
- 优先消费本 fork 已落地的 E2E artifact 附件格式：artifact body JSON `{ v:1, kind:'file', name, mimeType, size, dataBase64 }`。
- 同时识别 agent 消息中的结构化 Session Protocol `file` 事件，展示 `ref/name/size/mimeType`。如果 `ref` 指向可读 artifact，则走 artifact 下载；普通 `file-ref` 走已有 session RPC `readFile`，以 `ref` 作为 session 文件路径读取 base64 字节后保存到本地。
- 手机本地保存使用 Expo FileSystem document/cache 目录；图片预览使用本地 file URI，不把明文文件上传到服务器。

## 2. UI 落点

- 在消息气泡下方渲染文件卡片：
  - 来自 `meta.attachments` 的 artifact 附件；
  - 来自 agent 的 `file` 事件；
  - 兼容文本里的 `[attachment: ... artifact:<id>]` 标记作为兜底解析。
- 文件卡片显示文件名、类型/大小、下载按钮；图片下载后显示预览图，点击可打开本地预览。
- 非 artifact 的 agent `file ref` 需要当前 session runner/machine 在线并支持 `readFile` RPC；失败时显示 runner 返回的错误，不伪造下载成功。

## 3. 逻辑层

- 新增纯逻辑模块：
  - `isImageMimeType()`；
  - `sanitizeFileName()`；
  - `decodeBase64ToBytes()` / `buildLocalFileUri()`；
  - `extractArtifactRefsFromText()`；
  - `collectMessageDownloads()`：从 message/meta/text/session event 汇总可渲染下载项。
- 新增下载逻辑：
  - `loadDownloadableFilePayload(item, sessionId)`：artifact 拉取并解密 artifact body；`file-ref` 调用 `sessionReadFile(sessionId, ref)` 获取 base64 字节。
  - `useArtifactDownload(item, sessionId)`：把 payload 写入本地文件，返回 `{ uri, isImage }`。
- 复用 `sync.fetchArtifactWithBody()` 与 `parseAttachmentBody()`，保持 E2E 加密边界不变。
- 复用现有 `sessionReadFile()` RPC，不新增服务端 REST 路由；普通 `file-ref` 的真实读取由当前 session runner/machine 完成。

## 4. 验证

- 单测覆盖 artifact 标记解析、文件名清洗、图片 MIME 判断、message download item 汇总，以及普通 `file-ref` 通过 `readFile` RPC 读取 base64 字节的集成逻辑。
- 静态检查：`yarn workspace happy-app typecheck`。
- 构建：沿用 `docs/happy-droid/build.md` 的本地 APK 链路；如本阶段耗时无法重跑完整 APK，需在 `e2e-report.md` 写清替代验证。
- 端到端记录：在 `docs/happy-droid/e2e-report.md` 追加「agent artifact 下载保存 + 图片预览」验证结果。
