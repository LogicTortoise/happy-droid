# happy-droid 构建与自测说明

> 本文件记录 happy-droid（slopus/happy fork）的依赖安装、静态检查（typecheck）与构建步骤。
> 每完成一项可验证的步骤，请在此追加结果与日期。

## 工具链基线

| 项 | 版本 |
|---|---|
| Node | v22.19.0 |
| Yarn | 1.22.22（classic，monorepo workspaces） |
| TypeScript（happy-app） | 5.9.3 |
| Expo | ~55.0.8 |
| React Native | 0.83.1 |
| 平台 | macOS (Darwin 25.x) |

## 1. 安装依赖

在仓库根目录执行：

```bash
yarn install
```

- 使用 Yarn 1 classic workspaces，会一次性安装 `packages/*` 下所有 workspace 依赖。
- `postinstall`（`scripts/postinstall.cjs`）会自动：
  - 给 `pglite-prisma-adapter` 打 patch（Bytes 列处理，2 个文件）；
  - 构建 `happy-wire`（`tsc --noEmit && pkgroll`）；
  - 各包自身的 postinstall（happy-app: `patch-package` + `setup-skia-web`；happy-server: `prisma generate`；happy-cli: `unpack-tools`）。
- 安装过程出现的 peer dependency / "Workspaces can only be enabled in private projects" 等 **warning 均为已知噪声，不影响安装成功**（root package.json 标记了 `private: true`，warning 来自各子 workspace 的 package.json 未标 private，属上游既有现象）。

**结果（2026-06-21，HEAD=20f312c5）**：`yarn install` 成功，`success Saved lockfile.`，postinstall 全部完成（`Done in 189.81s.`）。

## 2. 静态检查 typecheck 基线

各包均提供 `typecheck`（happy-server 为 `build`，本质同为 `tsc --noEmit`）。逐包执行：

```bash
# 单包
yarn workspace happy-wire typecheck
yarn workspace happy-app   typecheck

# 或进入包目录
cd packages/<pkg> && yarn typecheck
```

| 包 | 命令 | 结果（2026-06-21，HEAD=20f312c5，改动前基线） |
|---|---|---|
| happy-wire | `tsc --noEmit` | ✅ Pass（Done in 1.34s） |
| happy-app | `tsc --noEmit` | ✅ Pass（Done in 8.10s） |
| happy-cli | `tsc --noEmit` | ✅ Pass（Done in 3.50s） |
| happy-agent | `tsc --noEmit` | ✅ Pass（Done in 1.52s） |
| happy-server | `tsc --noEmit`（`build`） | ✅ Pass（Done in 3.54s） |

**基线结论**：fork 当前状态下全部 6 个 workspace（含未单独列出、由 happy-app 间接覆盖的部分）typecheck **零报错**。后续改动 happy-app / happy-wire 等包时，以本基线为对照——改完应保持 typecheck 仍为 0 报错。

### 改动后回归检查（建议命令）

改动 happy-app 与/或 happy-wire 后，至少跑：

```bash
yarn workspace happy-wire typecheck && yarn workspace happy-app typecheck
```

## 3. 安卓 APK 构建（待办，P0 后续步骤）

> 本阶段仅完成依赖安装 + typecheck 基线；APK 构建步骤将在后续任务补充到此处。
> 预期路线：`yarn workspace happy-app prebuild`（`expo prebuild`）→ 本地 gradle `assembleDebug`，
> 或 `eas build --platform android`。届时记录命令、产物路径与日志。
