#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

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
    args: [':app:assembleDebug'],
    description: 'Build a local debug APK.',
  },
  {
    id: 'android-release-apk',
    group: 'android',
    cwd: 'packages/happy-app/android',
    command: './gradlew',
    args: [':app:assembleRelease'],
    description: 'Build a local release APK signed with the current local Gradle config.',
  },
];

function usage() {
  console.log(`happy-droid validation helper

Usage:
  node scripts/happy-droid-validate.cjs --list
  node scripts/happy-droid-validate.cjs --run --group quick
  node scripts/happy-droid-validate.cjs --run --group app
  node scripts/happy-droid-validate.cjs --run --group android
  node scripts/happy-droid-validate.cjs --run --group all

Options:
  --list          Print commands without running them. This is the default.
  --run           Execute selected commands.
  --group <name>  quick, app, android, or all. Default: quick.
  --only <id>     Run or list one command by id.
`);
}

function parseArgs(argv) {
  const result = { run: false, group: 'quick', only: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') {
      result.run = true;
    } else if (arg === '--list') {
      result.run = false;
    } else if (arg === '--group') {
      result.group = argv[i + 1];
      i += 1;
    } else if (arg === '--only') {
      result.only = argv[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function selectCommands(options) {
  if (options.only) {
    return commands.filter((item) => item.id === options.only);
  }
  if (options.group === 'all') {
    return commands;
  }
  return commands.filter((item) => item.group === options.group);
}

function formatCommand(item) {
  return `${item.command} ${item.args.join(' ')}`;
}

function list(selected) {
  for (const item of selected) {
    console.log(`[${item.group}] ${item.id}`);
    console.log(`  cwd: ${item.cwd}`);
    console.log(`  cmd: ${formatCommand(item)}`);
    console.log(`  why: ${item.description}`);
  }
}

function run(selected) {
  for (const item of selected) {
    console.log(`\n==> ${item.id}`);
    console.log(`cwd: ${item.cwd}`);
    console.log(`cmd: ${formatCommand(item)}`);
    const result = spawnSync(item.command, item.args, {
      cwd: item.cwd,
      stdio: 'inherit',
      shell: false,
      env: process.env,
    });
    if (result.status !== 0) {
      const code = result.status === null ? 1 : result.status;
      console.error(`Command failed: ${item.id}`);
      process.exit(code);
    }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    process.exit(0);
  }
  const selected = selectCommands(options);
  if (selected.length === 0) {
    throw new Error(options.only ? `No command found for --only ${options.only}` : `No commands found for --group ${options.group}`);
  }
  if (options.run) {
    run(selected);
  } else {
    usage();
    list(selected);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
