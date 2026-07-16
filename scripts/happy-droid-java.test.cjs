const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ANDROID_GRADLE_JVM_ARGUMENT,
  androidCommandEnv,
  androidGradleArgs,
  parseJavaMajor,
  resolveAndroidJava,
} = require('./happy-droid-java.cjs');

test('parseJavaMajor supports legacy and modern version formats', () => {
  assert.equal(parseJavaMajor('java version "1.8.0_381"'), 8);
  assert.equal(parseJavaMajor('openjdk version "17.0.19" 2026-04-21'), 17);
  assert.equal(parseJavaMajor('openjdk version "21.0.2"'), 21);
  assert.equal(parseJavaMajor('not a Java version'), null);
});

test('resolveAndroidJava skips old Java and selects the first JDK 17+', () => {
  const versions = new Map([
    ['/jdk8', { javaHome: '/jdk8', javaPath: '/jdk8/bin/java', major: 8, version: 'java 8' }],
    ['/jdk17', { javaHome: '/jdk17', javaPath: '/jdk17/bin/java', major: 17, version: 'java 17' }],
    ['/jdk21', { javaHome: '/jdk21', javaPath: '/jdk21/bin/java', major: 21, version: 'java 21' }],
  ]);
  const selected = resolveAndroidJava({
    candidates: ['/jdk8', '/jdk17', '/jdk21'],
    probe: (candidate) => versions.get(candidate) || null,
  });

  assert.equal(selected?.javaHome, '/jdk17');
});

test('androidCommandEnv overrides Java only in the returned child environment', () => {
  const baseEnv = { JAVA_HOME: '/jdk8', PATH: '/usr/bin' };
  const childEnv = androidCommandEnv(baseEnv, {
    javaHome: '/jdk17',
    javaPath: '/jdk17/bin/java',
    major: 17,
    version: 'java 17',
  });

  assert.equal(baseEnv.JAVA_HOME, '/jdk8');
  assert.equal(childEnv.JAVA_HOME, '/jdk17');
  assert.equal(childEnv.PATH, `/jdk17/bin${require('node:path').delimiter}/usr/bin`);
});

test('androidGradleArgs applies reproducible packaging memory without mutating task args', () => {
  const taskArgs = [':app:assembleRelease'];

  assert.deepEqual(androidGradleArgs(taskArgs), [
    ANDROID_GRADLE_JVM_ARGUMENT,
    ':app:assembleRelease',
  ]);
  assert.deepEqual(taskArgs, [':app:assembleRelease']);
});
