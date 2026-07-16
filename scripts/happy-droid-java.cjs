const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MINIMUM_GRADLE_JAVA_MAJOR = 17;
const ANDROID_GRADLE_JVM_ARGUMENT = '-Dorg.gradle.jvmargs=-Xmx6144m -XX:MaxMetaspaceSize=1024m';

function parseJavaMajor(versionOutput) {
  const match = String(versionOutput).match(/(?:java|openjdk) version ["']([^"']+)["']/i);
  if (!match) {
    return null;
  }
  const version = match[1];
  const majorText = version.startsWith('1.') ? version.split('.')[1] : version.split('.')[0];
  const major = Number.parseInt(majorText, 10);
  return Number.isFinite(major) ? major : null;
}

function probeJavaHome(javaHome) {
  if (!javaHome) {
    return null;
  }
  const javaPath = path.join(javaHome, 'bin', 'java');
  if (!fs.existsSync(javaPath)) {
    return null;
  }
  const result = spawnSync(javaPath, ['-version'], {
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status !== 0) {
    return null;
  }
  const major = parseJavaMajor(output);
  if (major === null) {
    return null;
  }
  return {
    javaHome,
    javaPath,
    major,
    version: output.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() || '(unknown)',
  };
}

function defaultJavaHomeCandidates(env = process.env, platform = process.platform) {
  const explicit = [env.HAPPY_ANDROID_JAVA_HOME, env.JAVA_HOME].filter(Boolean);
  if (platform !== 'darwin') {
    return explicit;
  }
  return [
    ...explicit,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home',
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
  ];
}

function resolveAndroidJava(options = {}) {
  const env = options.env || process.env;
  const candidates = options.candidates || defaultJavaHomeCandidates(env, options.platform || process.platform);
  const probe = options.probe || probeJavaHome;
  const seen = new Set();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    const java = probe(candidate);
    if (java && java.major >= MINIMUM_GRADLE_JAVA_MAJOR) {
      return java;
    }
  }
  return null;
}

function androidCommandEnv(baseEnv = process.env, resolvedJava = resolveAndroidJava({ env: baseEnv })) {
  if (!resolvedJava) {
    return baseEnv;
  }
  return {
    ...baseEnv,
    JAVA_HOME: resolvedJava.javaHome,
    PATH: `${path.join(resolvedJava.javaHome, 'bin')}${path.delimiter}${baseEnv.PATH || ''}`,
  };
}

function androidGradleArgs(taskArgs) {
  return [ANDROID_GRADLE_JVM_ARGUMENT, ...taskArgs];
}

module.exports = {
  ANDROID_GRADLE_JVM_ARGUMENT,
  MINIMUM_GRADLE_JAVA_MAJOR,
  androidCommandEnv,
  androidGradleArgs,
  defaultJavaHomeCandidates,
  parseJavaMajor,
  probeJavaHome,
  resolveAndroidJava,
};
