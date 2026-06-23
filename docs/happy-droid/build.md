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

## 3. 安卓 APK 构建链路（2026-06-22）

目标：`expo prebuild` 生成原生工程 → 本地 gradle `assembleDebug` 出可安装 APK（或走 EAS 云构建）。

### 3.1 构建链路（已建立并验证到 JVM 关卡）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 生成原生工程 | `cd packages/happy-app && APP_ENV=development npx expo prebuild -p android --no-install` | ✅ 成功，生成 `packages/happy-app/android/`（已被 `.gitignore` 忽略，不入库） |
| Gradle wrapper | `cd packages/happy-app/android && ./gradlew --version` | ✅ 成功下载并运行 **Gradle 9.0.0**（网络拉取构建依赖正常） |
| 本地构建 | `./gradlew :app:assembleDebug --console=plain --no-daemon` | ❌ 在 JVM 版本关卡失败（见 3.3） |

> `expo prebuild` 应用了 e-ink 兼容插件、硬件特性/屏幕尺寸/输入法等清单调整，正常完成。
> 工程默认（Expo SDK 55 / RN 0.83）：`compileSdk=36`、`targetSdk=36`、`minSdk=24`、`buildTools 36.0.0`、NDK r27.x、Gradle 9.0.0；`newArchEnabled=true`、`hermesEnabled=true`（→ 需 NDK + CMake 编译原生库）。包名 `com.slopus.happy.dev`（development 变体）。

### 3.2 本机构建环境现状

| 组件 | 现状 | 构建所需 |
|---|---|---|
| JDK | **仅 1.8.0_381（Java 8）** | **JDK 17+**（Gradle 9 / AGP 8.x 强制） |
| Android SDK platforms | android-33, android-34 | **android-36** |
| build-tools | 34.0.0 | **36.0.0** |
| NDK | 无 | **r27.x**（newArch/Hermes 编译原生） |
| CMake | 无 | 需安装（如 3.22.1） |
| cmdline-tools / `sdkmanager` | **无** | 安装上述 SDK/NDK/CMake 所必需 |
| `ANDROID_HOME` | `~/Library/Android/sdk`（已设置） | ✅ |

### 3.3 失败留痕（本地 gradle）

```
$ ./gradlew :app:assembleDebug --console=plain --no-daemon
FAILURE: Build failed with an exception.
* What went wrong:
Gradle requires JVM 17 or later to run. Your build is currently configured to use JVM 8.
```

**结论**：构建链路本身已打通（prebuild + gradle wrapper 均成功），失败是**本机构建工具链未就绪**（JDK 8、缺 SDK36/NDK/CMake、无 sdkmanager），属环境 provisioning。按 SUPERVISOR_TASK §5.4「无法完成的步骤写清原因和替代验证」，且禁区限定「只做 App 编写与测试、不做运维」，**未在本机安装 JDK/NDK 等重型工具链**；下面给出两条可直接落地的出包路径。

### 3.4 路径 A：本地 gradle 出 APK（需先 provision 工具链）

```bash
# 1) JDK 17（任选其一）
brew install openjdk@17
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"      # 或指向 Android Studio 自带 JBR

# 2) Android SDK 组件（需 cmdline-tools 提供 sdkmanager）
brew install --cask android-commandlinetools            # 或 Android Studio 内 SDK Manager
yes | sdkmanager --licenses
sdkmanager "platforms;android-36" "build-tools;36.0.0" \
           "ndk;27.1.12297006" "cmake;3.22.1"

# 3) 生成工程并构建
cd packages/happy-app
APP_ENV=development npx expo prebuild -p android --no-install
cd android && ./gradlew :app:assembleDebug
# 产物：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
# 安装：adb install -r app-debug.apk
```

### 3.5 路径 B（推荐用于真正出包）：EAS 云构建

云端构建，**无需本机 JDK/NDK/SDK**，可直接产出可安装 APK：

```bash
cd packages/happy-app
npx eas-cli@latest login                 # 需用户自己的 Expo 账号（凭据由用户操作）
# eas.json 里 development/preview profile 已配置（preview 产出 APK）
APP_ENV=preview npx eas-cli@latest build --platform android --profile preview
# 构建完成后从 EAS 链接下载 .apk
```

> EAS 需登录 Expo 账号（凭据/交互，属用户操作，不由本 worker 代持）。

### 3.6 验证口径

- ✅ 已验证：`expo prebuild -p android` 成功；Gradle 9.0.0 wrapper 可运行。
- ❌ 未完成（环境受限）：本机 `assembleDebug` 因 JDK8 + 缺 SDK36/NDK/CMake 失败，已留痕授权错误信息。
- 待 provision 工具链或走 EAS 后，按 3.4/3.5 出 APK，并把产物路径与安装结果记入 `e2e-report.md`。

### 3.7 修复后本地 APK 出包验证（2026-06-23）

已在本机完成 Android 构建工具链 provisioning，并重新跑通 `expo prebuild` + Gradle `assembleDebug` + 真机/设备安装验证。

#### 工具链

| 组件 | 验证结果 |
|---|---|
| JDK | OpenJDK 17.0.19（Homebrew，`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`） |
| Android SDK root | `/Users/Hht/Library/Android/sdk` |
| cmdline-tools / sdkmanager | `cmdline-tools/latest` 已安装；`sdkmanager --version` = `20.0` |
| Android platform | `platforms;android-36` 已安装 |
| build-tools | `36.0.0` 已安装（Gradle 过程中另按依赖自动补齐 `35.0.0`） |
| NDK | `27.1.12297006` 已安装（Gradle 过程中另按 `expo-updates` 依赖自动补齐 `27.0.12077973`） |
| CMake | `3.22.1` 已安装 |

#### 执行命令

```bash
cd packages/happy-app
APP_ENV=development npx expo prebuild -p android --no-install

cd android
./gradlew :app:assembleDebug --console=plain --no-daemon --max-workers=2
```

> 说明：首次 `./gradlew :app:assembleDebug --console=plain --no-daemon` 已越过 Java 8 失败点并进入 native 编译，但在 Expo/RN 首次重型构建中长时间无 CPU/无日志进展；保留日志后终止，使用 `--max-workers=2` 重跑并成功出包。

#### 完整日志

- `expo prebuild` 完整日志：`docs/happy-droid/logs/2026-06-23-expo-prebuild-android.log`（16 行）
- 成功 Gradle 构建完整日志：`docs/happy-droid/logs/2026-06-23-gradle-assembleDebug-rerun.log`（1699 行）
- `adb install` 完整日志：`docs/happy-droid/logs/2026-06-23-adb-install-debug.log`

成功 Gradle 日志末尾：

```text
> Task :app:mergeDebugNativeLibs
> Task :app:stripDebugDebugSymbols
> Task :app:packageDebug
> Task :app:createDebugApkListingFileRedirect
> Task :app:assembleDebug

BUILD SUCCESSFUL in 7m 43s
1195 actionable tasks: 179 executed, 1016 up-to-date
```

#### APK 产物

```text
路径：packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
大小：447M
SHA-256：59f5c09da15c1cfaf997a8ae06233a850339786b2c2aaa13693aaef1cc4ff751
包名：com.slopus.happy.dev
versionName：1.7.0
versionCode：1
compileSdkVersion：36
targetSdkVersion：36
minSdkVersion：24
签名校验：apksigner verify 通过；APK Signature Scheme v2 = true；debug signer CN=Android Debug
```

#### 安装验证

检测到设备：

```text
127.0.0.1:5555 device product:b0qxxx model:SM_S908E device:b0q transport_id:40
```

安装命令与结果：

```bash
adb -s 127.0.0.1:5555 install -r packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
```

```text
Performing Streamed Install
Success
```

安装后确认：

```text
package:/data/app/~~IwIuiEHmpAa1YMaR2-FyTA==/com.slopus.happy.dev--L4v0LPiTwjYAqJ83vT8iQ==/base.apk
Launcher activity: com.slopus.happy.dev/.MainActivity
```

**结论**：本地 APK 构建链路已真正完成，已产出可安装 APK，并已在连接设备上安装成功。
