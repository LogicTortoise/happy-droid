# happy-droid pnpm Baseline

Last rebuilt: 2026-07-03

## Scope

This document records the current pnpm baseline for the `happy-droid` fork work on `packages/happy-app`.

The requested pre-read files not present in this checkout are:

- `SUPERVISOR_TASK.md`
- `.supervisor/outline.md`

Available context files are:

- `CHANGELOG.md` (created by this happy-droid baseline change)
- `AGENTS.md`
- `packages/happy-app/CHANGELOG.md`
- `.agents/skills/dev/SKILL.md`

## Workspace

- Package manager: `pnpm@10.11.0`
- Node observed locally: `v22.19.0`
- Java observed locally: `1.8.0_381`
- Android Gradle wrapper observed locally: `Gradle 9.0.0`
- Workspace file: `pnpm-workspace.yaml`
- Lockfile: `pnpm-lock.yaml`
- Install mode: hoisted

Relevant `.npmrc` settings:

```ini
shamefully-hoist=true
node-linker=hoisted
strict-peer-dependencies=false
auto-install-peers=true
```

Workspace packages:

- `packages/happy-app`
- `packages/happy-agent`
- `packages/happy-cli`
- `packages/happy-server`
- `packages/happy-wire`
- `packages/happy-app-logs`
- `packages/codium`

## App Baseline

`packages/happy-app` is an Expo/RN app using:

- Expo `~55.0.8`
- React Native `0.83.1`
- React `19.2.0`
- TypeScript `5.9.3`
- Vitest `^3.2.4`
- Shared wire package: `@slopus/happy-wire` via `workspace:*`

Current app scripts relevant to P0:

```bash
pnpm --filter happy-app typecheck
pnpm --filter happy-app test
pnpm --filter happy-app web:test
pnpm --filter happy-app android:dev
pnpm --filter happy-app android:preview
pnpm --filter happy-app android:production
```

Android native project exists at `packages/happy-app/android`.

APK build entrypoints:

```bash
cd packages/happy-app/android
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
```

Expected APK outputs:

```text
packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
packages/happy-app/android/app/build/outputs/apk/release/app-release.apk
```

The current Android release build signs with the debug keystore in `android/app/build.gradle`, so release APK output is suitable as a local artifact baseline, not a production signing baseline.

Current local Java is not enough for Android APK rebuilds:

```text
Gradle requires JVM 17 or later to run. Current default JVM: 1.8.0_381.
```

Use a JDK 17+ `JAVA_HOME` for Android validation. Do not change system, proxy, VPN, Tailscale, or host network settings as part of this workflow.

## Server URL Baseline

The app already has a configurable server URL path in `packages/happy-app/sources/sync/serverConfig.ts`.

Resolution order:

1. Persisted MMKV value `custom-server-url`
2. `globalThis.__HAPPY_CONFIG__?.serverUrl`
3. `EXPO_PUBLIC_HAPPY_SERVER_URL`
4. Default `https://api.cluster-fluster.com`

Validation currently accepts only `http:` and `https:` URLs.

## Attachment Baseline

The app has current upload/download client support in `packages/happy-app/sources/sync/apiAttachments.ts`.

Current flow:

- `POST /v1/sessions/:sessionId/attachments/request-upload`
- upload encrypted blob via returned `PUT` or S3 presigned `POST`
- `POST /v1/sessions/:sessionId/attachments/request-download`
- download encrypted blob from returned URL

Current focused tests:

```bash
pnpm --filter happy-app exec vitest run sources/sync/attachmentSupport.test.ts
pnpm --filter happy-app exec vitest run sources/sync/attachmentDiagnostics.test.ts sources/sync/apiAttachments.test.ts
```

## Baseline Constraints

Do not touch these areas for happy-droid P0 work:

- proxy, VPN, Tailscale, or host network configuration
- `/happy-telegram`
- `/happy`

Use `/happy-telegram` and `/happy` only as read-only references if they exist outside this checkout.
