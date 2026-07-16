#!/usr/bin/env node

const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  androidCommandEnv,
  androidGradleArgs,
  resolveAndroidJava,
} = require('./happy-droid-java.cjs');

const repoRoot = path.resolve(__dirname, '..');
const defaultReportPath = 'docs/happy-droid/e2e-report.md';

const commands = [
  {
    id: 'install',
    group: 'quick',
    cwd: '.',
    command: 'pnpm',
    args: ['install', '--frozen-lockfile'],
    description: 'Install workspace dependencies from the lockfile.',
  },
  {
    id: 'wire-build',
    group: 'quick',
    cwd: '.',
    command: 'pnpm',
    args: ['--filter', '@slopus/happy-wire', 'build'],
    description: 'Build shared wire schemas/types used by the app.',
  },
  {
    id: 'app-typecheck',
    group: 'quick',
    cwd: '.',
    command: 'pnpm',
    args: ['--filter', 'happy-app', 'typecheck'],
    description: 'Run TypeScript checks for packages/happy-app.',
  },
  {
    id: 'attachment-tests',
    group: 'quick',
    cwd: '.',
    command: 'pnpm',
    args: [
      '--filter',
      'happy-app',
      'exec',
      'vitest',
      'run',
      'sources/sync/attachmentSupport.test.ts',
      'sources/sync/attachmentDiagnostics.test.ts',
      'sources/sync/apiAttachments.test.ts',
    ],
    description: 'Run focused attachment upload/download support tests.',
  },
  {
    id: 'app-tests',
    group: 'app',
    cwd: '.',
    command: 'pnpm',
    args: ['--filter', 'happy-app', 'exec', 'vitest', 'run'],
    description: 'Run the full happy-app Vitest suite in non-watch mode.',
  },
  {
    id: 'android-debug-apk',
    group: 'android',
    cwd: 'packages/happy-app/android',
    command: './gradlew',
    args: androidGradleArgs([':app:assembleDebug']),
    description: 'Build a local debug APK.',
  },
  {
    id: 'android-release-apk',
    group: 'android',
    cwd: 'packages/happy-app/android',
    command: './gradlew',
    args: androidGradleArgs([':app:assembleRelease']),
    description: 'Build a local release APK signed with the current local Gradle config.',
  },
];

const apkArtifacts = [
  {
    id: 'debug',
    path: 'packages/happy-app/android/app/build/outputs/apk/debug/app-debug.apk',
    producerCommandId: 'android-debug-apk',
  },
  {
    id: 'release',
    path: 'packages/happy-app/android/app/build/outputs/apk/release/app-release.apk',
    producerCommandId: 'android-release-apk',
  },
];

function usage() {
  console.log(`happy-droid Android/E2E record helper

Usage:
  node scripts/happy-droid-e2e-record.cjs --list
  node scripts/happy-droid-e2e-record.cjs --dry-run --only app-typecheck
  node scripts/happy-droid-e2e-record.cjs --run --groups quick,app,android

Options:
  --list            Print selected commands without running or writing a report.
  --run             Execute selected commands and append a report.
  --dry-run         Append a report with selected commands marked SKIPPED.
  --groups <names>  Comma-separated groups: quick, app, android, all. Default: quick,app,android.
  --only <id>       Select one command by id. Can be passed more than once.
  --report <path>   Report path. Default: ${defaultReportPath}
  --title <text>    Report section title. Default: P0 Android Build and E2E Record Loop.
`);
}

function parseArgs(argv) {
  const result = {
    mode: 'list',
    groups: ['quick', 'app', 'android'],
    only: [],
    reportPath: defaultReportPath,
    title: 'P0 Android Build and E2E Record Loop',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') {
      result.mode = 'list';
    } else if (arg === '--run') {
      result.mode = 'run';
    } else if (arg === '--dry-run') {
      result.mode = 'dry-run';
    } else if (arg === '--groups') {
      result.groups = requireValue(argv, i, arg).split(',').map((item) => item.trim()).filter(Boolean);
      i += 1;
    } else if (arg === '--only') {
      result.only.push(requireValue(argv, i, arg));
      i += 1;
    } else if (arg === '--report') {
      result.reportPath = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--title') {
      result.title = requireValue(argv, i, arg);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function requireValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function selectCommands(options) {
  if (options.only.length > 0) {
    const selected = [];
    for (const id of options.only) {
      const command = commands.find((item) => item.id === id);
      if (!command) {
        throw new Error(`No command found for --only ${id}`);
      }
      selected.push(command);
    }
    return selected;
  }

  const groups = new Set(options.groups);
  if (groups.has('all')) {
    return commands;
  }
  const selected = commands.filter((item) => groups.has(item.group));
  if (selected.length === 0) {
    throw new Error(`No commands found for --groups ${options.groups.join(',')}`);
  }
  return selected;
}

function formatCommand(item) {
  const args = item.args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg));
  return [item.command, ...args].join(' ');
}

function listCommands(selected) {
  for (const item of selected) {
    console.log(`[${item.group}] ${item.id}`);
    console.log(`  cwd: ${item.cwd}`);
    console.log(`  cmd: ${formatCommand(item)}`);
    console.log(`  why: ${item.description}`);
  }
}

function runCommand(item, androidJava) {
  const startedAt = Date.now();
  const cwd = path.resolve(repoRoot, item.cwd);
  console.log(`\n==> ${item.id}`);
  console.log(`cwd: ${item.cwd}`);
  console.log(`cmd: ${formatCommand(item)}`);

  const result = spawnSync(item.command, item.args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: item.group === 'android' ? androidCommandEnv(process.env, androidJava) : process.env,
    maxBuffer: 1024 * 1024 * 40,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }

  const endedAt = Date.now();
  return {
    id: item.id,
    group: item.group,
    cwd: item.cwd,
    command: formatCommand(item),
    description: item.description,
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status === null ? 1 : result.status,
    signal: result.signal,
    durationMs: endedAt - startedAt,
    stdout: result.stdout || '',
    stderr: `${result.stderr || ''}${result.error ? `\n${result.error.message}` : ''}`,
  };
}

function skippedCommand(item) {
  return {
    id: item.id,
    group: item.group,
    cwd: item.cwd,
    command: formatCommand(item),
    description: item.description,
    status: 'skipped',
    exitCode: null,
    signal: null,
    durationMs: 0,
    stdout: '',
    stderr: '',
  };
}

function collectEnvironment(androidJava = resolveAndroidJava()) {
  const gradleEnv = androidCommandEnv(process.env, androidJava);
  return {
    node: process.version,
    pnpm: runProbe('pnpm', ['-v'], '.'),
    java: runProbe('java', ['-version'], '.'),
    javaHome: process.env.JAVA_HOME || '(unset)',
    androidJavaHome: androidJava?.javaHome || '(no JDK 17+ found)',
    androidJava: androidJava?.version || '(no JDK 17+ found)',
    gradle: runProbe('./gradlew', ['--version'], 'packages/happy-app/android', gradleEnv),
    platform: `${os.platform()} ${os.arch()}`,
  };
}

function runProbe(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(repoRoot, cwd),
    encoding: 'utf8',
    shell: false,
    env,
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status === 0) {
    return firstLine(output) || '(no output)';
  }
  return `failed (${result.status === null ? 1 : result.status}): ${firstLine(output) || 'no output'}`;
}

function firstLine(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^-+$/.test(line)) || '';
}

function collectArtifactStates() {
  return Object.fromEntries(apkArtifacts.map((artifact) => [artifact.id, readArtifactState(artifact)]));
}

function readArtifactState(artifact) {
  const absolutePath = path.resolve(repoRoot, artifact.path);
  if (!fs.existsSync(absolutePath)) {
    return {
      id: artifact.id,
      path: artifact.path,
      producerCommandId: artifact.producerCommandId,
      exists: false,
    };
  }
  const stat = fs.statSync(absolutePath);
  return {
    id: artifact.id,
    path: artifact.path,
    producerCommandId: artifact.producerCommandId,
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    mtime: stat.mtime.toISOString(),
  };
}

function enrichArtifacts(before, after, results) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  return apkArtifacts.map((artifact) => {
    const beforeState = before[artifact.id];
    const afterState = after[artifact.id];
    const producer = resultById.get(artifact.producerCommandId);
    const changedDuringRun = Boolean(
      afterState.exists
      && (!beforeState.exists
        || beforeState.size !== afterState.size
        || beforeState.mtimeMs !== afterState.mtimeMs)
    );
    const producedThisRun = changedDuringRun && producer?.status === 'pass';
    return {
      ...afterState,
      producedThisRun,
      changedDuringRun,
      sha256: producedThisRun ? sha256File(path.resolve(repoRoot, artifact.path)) : null,
    };
  });
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function appendReport(reportPath, markdown) {
  const absolutePath = path.resolve(repoRoot, reportPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const prefix = fs.existsSync(absolutePath) && fs.readFileSync(absolutePath, 'utf8').trim().length > 0
    ? '\n\n'
    : '';
  fs.appendFileSync(absolutePath, `${prefix}${markdown}\n`);
}

function buildReport({ title, mode, startedAt, endedAt, environment, results, artifacts }) {
  const lines = [];
  lines.push(`## ${formatTimestamp(startedAt)} - ${title}`);
  lines.push('');
  lines.push('Environment:');
  lines.push('');
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Platform: ${environment.platform}`);
  lines.push(`- Node: ${environment.node}`);
  lines.push(`- pnpm: ${environment.pnpm}`);
  lines.push(`- JAVA_HOME: ${environment.javaHome}`);
  lines.push(`- Java: ${environment.java}`);
  lines.push(`- Android JAVA_HOME: ${environment.androidJavaHome}`);
  lines.push(`- Android Java: ${environment.androidJava}`);
  lines.push(`- Gradle: ${environment.gradle}`);
  lines.push(`- Started: ${startedAt.toISOString()}`);
  lines.push(`- Finished: ${endedAt.toISOString()}`);
  lines.push('');
  lines.push('Command results:');
  lines.push('');

  for (const result of results) {
    const label = result.status === 'pass' ? 'PASS' : result.status === 'skipped' ? 'SKIPPED' : 'FAIL';
    lines.push(`- ${label}: \`${result.command}\``);
    lines.push(`  - id: \`${result.id}\`, cwd: \`${result.cwd}\`, duration: ${formatDuration(result.durationMs)}`);
    if (result.status === 'fail') {
      lines.push(`  - exit: ${result.exitCode}${result.signal ? `, signal: ${result.signal}` : ''}`);
      const failureTail = tailLines(`${result.stdout}\n${result.stderr}`, 18);
      if (failureTail) {
        lines.push('  - failure tail:');
        lines.push('');
        lines.push('```text');
        lines.push(failureTail);
        lines.push('```');
        lines.push('');
      }
    }
  }

  lines.push('APK artifacts:');
  lines.push('');
  for (const artifact of artifacts) {
    if (!artifact.exists) {
      lines.push(`- ${artifact.id}: missing at \`${artifact.path}\``);
      continue;
    }
    const produced = artifact.producedThisRun ? 'produced this run' : 'pre-existing or unchanged during this run';
    lines.push(`- ${artifact.id}: \`${artifact.path}\` (${produced})`);
    lines.push(`  - size: ${artifact.size} bytes`);
    lines.push(`  - mtime: ${artifact.mtime}`);
    if (artifact.sha256) {
      lines.push(`  - sha256: \`${artifact.sha256}\``);
    }
  }

  const failed = results.filter((result) => result.status === 'fail');
  lines.push('');
  if (failed.length === 0) {
    lines.push('Overall result: PASS');
  } else {
    lines.push(`Overall result: FAIL (${failed.map((item) => item.id).join(', ')})`);
    lines.push('');
    lines.push('Next action: fix the command failure above, then rerun this recorder so the report contains the updated command and APK artifact state.');
  }
  lines.push('');
  lines.push('Constraint note: this recorder does not change Java, Android SDK, proxy, VPN, Tailscale, or host network settings.');
  return lines.join('\n');
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function tailLines(value, count) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-count)
    .join('\n');
}

function execute(options) {
  const selected = selectCommands(options);
  if (options.mode === 'list') {
    usage();
    listCommands(selected);
    return 0;
  }

  const startedAt = new Date();
  const beforeArtifacts = collectArtifactStates();
  const androidJava = resolveAndroidJava();
  const environment = collectEnvironment(androidJava);
  const results = options.mode === 'dry-run'
    ? selected.map(skippedCommand)
    : selected.map((item) => runCommand(item, androidJava));
  const afterArtifacts = collectArtifactStates();
  const artifacts = enrichArtifacts(beforeArtifacts, afterArtifacts, results);
  const endedAt = new Date();
  const markdown = buildReport({
    title: options.title,
    mode: options.mode,
    startedAt,
    endedAt,
    environment,
    results,
    artifacts,
  });

  appendReport(options.reportPath, markdown);
  console.log(`\nE2E record appended to ${options.reportPath}`);

  return results.some((result) => result.status === 'fail') ? 1 : 0;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      process.exit(0);
    }
    process.exit(execute(options));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    usage();
    process.exit(1);
  }
}

module.exports = {
  apkArtifacts,
  buildReport,
  commands,
  execute,
  parseArgs,
  selectCommands,
};
