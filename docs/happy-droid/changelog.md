# happy-droid 变更日志

> 本 fork（happy-droid）相对上游的改造记录。遵循 Keep a Changelog 风格。
> 注：`packages/happy-app/CHANGELOG.md` 是 App 面向用户的发行说明（Version N 格式，驱动应用内更新页），与此文件用途不同。

## [Unreleased]

### Added
- **文件下载（P0）**：App 可识别 session 中的 agent artifact/file ref；artifact 走 E2E artifact 读取，普通 file ref 走 session `readFile` RPC 保存到本地，并对图片提供缩略图与全屏预览。设计与验证见 `docs/happy-droid/file-download.md`、`docs/happy-droid/e2e-report.md`。
- **文件上传（P0）**：App 聊天输入框新增附件按钮，可选取相册图片（ImagePicker）或任意文档（DocumentPicker），文件经 E2E 加密后通过现有 artifacts 通道（`/v1/artifacts`）上传，并作为附件随消息发给当前 session。携带方式为「runner 无关的文本标记 `[attachment: …]` + 结构化 `meta.attachments`」。10MB 上限。设计见 `docs/happy-droid/file-upload.md`。
- **架构笔记**：`docs/happy-droid/arch-notes.md`，通读 wire/app/server/cli + 只读 telegram 桥后的数据流、协议、自定义指令/MCP 工具枚举与各交付物设计结论。
- **构建与 typecheck 基线**：`docs/happy-droid/build.md`，记录 `yarn install` 与各 workspace `tsc --noEmit` 基线（全 0 报错）。

### Notes
- 上述改动仅在本 fork 的 `packages/happy-app`（及 happy-droid 文档）内，未改动 happy-server、线上 happy-telegram 桥或 upstream。
- 附件被 agent 实际消费并回复，依赖 P1 的本 fork runner；文件下载/预览为 P0.3，均为后续任务。
