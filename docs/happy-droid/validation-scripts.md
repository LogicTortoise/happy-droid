# happy-droid Validation Script Inventory

Last rebuilt: 2026-07-03

## Local Helper

This checkout now has a helper that prints and optionally runs the current validation command list:

```bash
node scripts/happy-droid-validate.cjs --list
node scripts/happy-droid-validate.cjs --run --group quick
node scripts/happy-droid-validate.cjs --run --group app
node scripts/happy-droid-validate.cjs --run --group android
node scripts/happy-droid-validate.cjs --run --group all
```

Default behavior is `--list`. Commands are intentionally explicit so the list can be reviewed before long Android builds run.

The checkout also has an Android/E2E report recorder:

```bash
node scripts/happy-droid-e2e-record.cjs --list
node scripts/happy-droid-e2e-record.cjs --dry-run --only android-debug-apk
node scripts/happy-droid-e2e-record.cjs --run --groups quick,app,android
```

The recorder appends a Markdown section to `docs/happy-droid/e2e-report.md` with command results, Java/Gradle environment probes, APK artifact state, and APK SHA-256 only when an artifact was produced by the current run.

## Quick Baseline

These commands validate the pnpm install, shared wire build, app typecheck, and focused attachment tests:

```bash
pnpm install --frozen-lockfile
pnpm --filter @slopus/happy-wire build
pnpm --filter happy-app typecheck
pnpm --filter happy-app exec vitest run sources/sync/attachmentSupport.test.ts sources/sync/attachmentDiagnostics.test.ts sources/sync/apiAttachments.test.ts
node --test scripts/happy-droid-e2e-record.test.cjs
```

## App Test Baseline

Run the full app Vitest suite when a change touches shared app behavior:

```bash
pnpm --filter happy-app test
```

For CI-style non-watch execution:

```bash
pnpm --filter happy-app exec vitest run
```

## Web Smoke Baseline

Use this when a change can affect Metro/Expo bundling:

```bash
pnpm --filter happy-app web:test
```

This starts a non-interactive web dev server. Stop it after confirming startup.

## Android APK Baseline

Debug APK:

```bash
cd packages/happy-app/android
./gradlew :app:assembleDebug
```

Release APK:

```bash
cd packages/happy-app/android
./gradlew :app:assembleRelease
```

Expected outputs:

```text
packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk
packages/happy-app/android/app/build/outputs/apk/release/app-release.apk
```

Android builds require JDK 17+ and the local Android SDK/NDK/Gradle toolchain to match the checked-in Expo/RN native project. The helper script does not change SDK, Java, proxy, VPN, Tailscale, or host network settings.

## Server Smoke Baseline

Use a local Happy server only when needed for app integration checks:

```bash
pnpm --filter happy-server-self-host standalone:dev
```

Point the app at it with:

```bash
EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 pnpm --filter happy-app start
```

On a physical Android device, replace `localhost` with a reachable LAN address. Do not modify network/proxy/VPN/Tailscale configuration as part of this project.

## E2E Report

Record each verification run in:

```text
docs/happy-droid/e2e-report.md
```

Minimum fields:

- date/time
- command
- result
- artifact path, if an APK or exported bundle was produced
- failure reason and next action, if any

The recorder fills these fields automatically for selected validation commands and marks pre-existing APK files separately from APKs produced by the current run.
