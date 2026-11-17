import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON_PATH = path.join(ROOT_DIR, 'app.json');
const PKG_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const APP_GRADLE_PATH = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function bumpSemver(version, type) {
  const parts = String(version).split('.').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }
  const [major, minor, patch] = parts;
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump type: "${type}"`);
}

function readGradleVersions(gradlePath) {
  if (!fs.existsSync(gradlePath)) return null;
  const content = fs.readFileSync(gradlePath, 'utf8');
  const codeMatch = content.match(/versionCode\s+(\d+)/);
  const nameMatch = content.match(/versionName\s+["']([^"']+)["']/);
  return {
    versionCode: codeMatch ? Number(codeMatch[1]) : null,
    versionName: nameMatch ? nameMatch[1] : null,
  };
}

function syncGradleVersions(gradlePath, versionCode, versionName) {
  if (!fs.existsSync(gradlePath)) return false;
  let content = fs.readFileSync(gradlePath, 'utf8');
  content = content.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
  if (versionName !== undefined) {
    content = content.replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);
  }
  fs.writeFileSync(gradlePath, content, 'utf8');
  return true;
}

function cmdShow() {
  const appJson = readJson(APP_JSON_PATH);
  const pkgJson = readJson(PKG_JSON_PATH);
  const appVersion = appJson.expo?.version;
  const appCode = appJson.expo?.android?.versionCode;
  const gradle = readGradleVersions(APP_GRADLE_PATH);

  const pkgSynced = pkgJson.version === appVersion;
  console.log(`app.json:               version=${appVersion}, versionCode=${appCode}`);
  console.log(`package.json:           version=${pkgJson.version} (${pkgSynced ? 'in sync' : 'OUT OF SYNC'})`);

  if (!gradle) {
    console.log('android/app/build.gradle: not present');
    return;
  }
  const gradleSynced = gradle.versionName === appVersion && gradle.versionCode === appCode;
  console.log(
    `android/app/build.gradle: versionName=${gradle.versionName}, versionCode=${gradle.versionCode} (${gradleSynced ? 'in sync' : 'OUT OF SYNC'})`
  );
}

function cmdBump(type) {
  const appJson = readJson(APP_JSON_PATH);
  const pkgJson = readJson(PKG_JSON_PATH);

  const oldVersion = appJson.expo.version;
  const oldCode = appJson.expo.android?.versionCode ?? 0;
  const newVersion = bumpSemver(oldVersion, type);
  const newCode = oldCode + 1;

  appJson.expo.version = newVersion;
  appJson.expo.android = { ...appJson.expo.android, versionCode: newCode };
  writeJson(APP_JSON_PATH, appJson);

  pkgJson.version = newVersion;
  writeJson(PKG_JSON_PATH, pkgJson);

  const gradleUpdated = syncGradleVersions(APP_GRADLE_PATH, newCode, newVersion);
  console.log(`Bumped (${type}): ${oldVersion} (${oldCode}) -> ${newVersion} (${newCode})`);
  console.log(`Updated: app.json, package.json${gradleUpdated ? ', android/app/build.gradle' : ''}`);
}

function cmdCode() {
  const appJson = readJson(APP_JSON_PATH);
  const oldCode = appJson.expo.android?.versionCode ?? 0;
  const newCode = oldCode + 1;

  appJson.expo.android = { ...appJson.expo.android, versionCode: newCode };
  writeJson(APP_JSON_PATH, appJson);

  const gradleUpdated = syncGradleVersions(APP_GRADLE_PATH, newCode);
  console.log(`Incremented versionCode: ${oldCode} -> ${newCode}`);
  console.log(`Updated: app.json${gradleUpdated ? ', android/app/build.gradle' : ''}`);
}

const command = process.argv[2] || 'show';
if (command === 'show') {
  cmdShow();
} else if (command === 'patch' || command === 'minor' || command === 'major') {
  cmdBump(command);
} else if (command === 'code') {
  cmdCode();
} else {
  console.error(`Usage: node scripts/version.mjs [show|patch|minor|major|code]`);
  process.exit(1);
}
