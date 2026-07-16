const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const recorder = require('./happy-droid-e2e-record.cjs');

test('selectCommands resolves explicit command ids', () => {
  const selected = recorder.selectCommands({
    groups: ['quick'],
    only: ['app-typecheck', 'android-debug-apk'],
  });

  assert.deepEqual(selected.map((item) => item.id), ['app-typecheck', 'android-debug-apk']);
});

test('dry-run appends a markdown E2E record without running build commands', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'happy-droid-e2e-record-'));
  const reportPath = path.join(tempDir, 'e2e-report.md');

  execFileSync(process.execPath, [
    'scripts/happy-droid-e2e-record.cjs',
    '--dry-run',
    '--only',
    'android-debug-apk',
    '--report',
    reportPath,
    '--title',
    'Recorder Test',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  const report = fs.readFileSync(reportPath, 'utf8');
  assert.match(report, /Recorder Test/);
  assert.match(report, /SKIPPED: `\.\/gradlew "-Dorg\.gradle\.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1024m" :app:assembleDebug`/);
  assert.match(report, /APK artifacts:/);
  assert.match(report, /Constraint note: this recorder does not change Java/);
});
