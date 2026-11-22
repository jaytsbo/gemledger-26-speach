import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON_PATH = path.join(ROOT_DIR, 'app.json');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const APP_GRADLE_PATH = path.join(ANDROID_DIR, 'app', 'build.gradle');
const APK_DIR_REL_PATH = path.join('android', 'app', 'build', 'outputs', 'apk', 'release');
const APK_REL_PATH = path.join(APK_DIR_REL_PATH, 'app-release.apk');

function readAppVersion() {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
  const appName = (appJson.expo?.name || 'app-release').replace(/[^a-zA-Z0-9._-]/g, '-');
  const version = appJson.expo?.version;
  const versionCode = appJson.expo?.android?.versionCode;
  if (!version || !Number.isInteger(versionCode)) {
    throw new Error('app.json must define expo.version and integer expo.android.versionCode');
  }
  return { appName, version, versionCode };
}

function syncGradleVersions(gradlePath, versionCode, versionName) {
  if (!fs.existsSync(gradlePath)) {
    throw new Error(`Missing ${gradlePath}`);
  }
  let content = fs.readFileSync(gradlePath, 'utf8');
  content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  content = content.replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);
  fs.writeFileSync(gradlePath, content, 'utf8');
}

function resolveJavaHome(env) {
  if (env.JAVA_HOME && fs.existsSync(env.JAVA_HOME)) return env.JAVA_HOME;
  const msDir = 'C:\\Program Files\\Microsoft';
  if (fs.existsSync(msDir)) {
    const jdks = fs.readdirSync(msDir).filter((d) => d.startsWith('jdk-17')).sort().reverse();
    if (jdks.length > 0) return path.join(msDir, jdks[0]);
  }
  return env.JAVA_HOME;
}

function resolveAndroidHome(env) {
  if (env.ANDROID_HOME && fs.existsSync(env.ANDROID_HOME)) return env.ANDROID_HOME;
  if (env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, 'Android', 'Sdk');
  return env.ANDROID_HOME;
}

function main() {
  const { appName, version, versionCode } = readAppVersion();
  console.log(`[build-apk] Target version: ${version} (versionCode: ${versionCode})`);

  if (!fs.existsSync(ANDROID_DIR)) {
    console.log('[build-apk] android/ not found, running expo prebuild...');
    execSync('npx expo prebuild --platform android', { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  syncGradleVersions(APP_GRADLE_PATH, versionCode, version);

  const env = { ...process.env };
  const javaHome = resolveJavaHome(env);
  const androidHome = resolveAndroidHome(env);
  if (javaHome) env.JAVA_HOME = javaHome;
  if (androidHome) env.ANDROID_HOME = androidHome;

  const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
  console.log(`[build-apk] Running ${gradlew} assembleRelease...`);
  execSync(`${gradlew} assembleRelease`, { cwd: ANDROID_DIR, env, stdio: 'inherit' });

  const versionedApkName = `${appName}-v${version}.apk`;
  const versionedApkRelPath = path.join(APK_DIR_REL_PATH, versionedApkName);
  const srcApkPath = path.join(ROOT_DIR, APK_REL_PATH);
  const destApkPath = path.join(ROOT_DIR, versionedApkRelPath);
  if (fs.existsSync(srcApkPath)) {
    fs.copyFileSync(srcApkPath, destApkPath);
    console.log(
      `[build-apk/copyVersionedApk] Copied - Input:${APK_REL_PATH} / Output:${versionedApkRelPath}`,
    );
  }

  console.log(`[build-apk] Done! Version: ${version} (${versionCode})`);
  console.log(`[build-apk] APK: ${versionedApkRelPath}`);
}

main();
