// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const failures = [];
const warnings = [];

function requireValue(ok, message) {
  if (!ok) failures.push(message);
}

requireValue(config.android?.package === 'com.nevula.app', 'Android package must be com.nevula.app.');
requireValue(Number(config.android?.versionCode) > 0, 'Android versionCode is missing.');
requireValue(config.android?.allowBackup === false, 'android.allowBackup must be false for the private vault.');
requireValue(config.android?.blockedPermissions?.includes('android.permission.READ_EXTERNAL_STORAGE'), 'READ_EXTERNAL_STORAGE must be blocked.');
requireValue(config.android?.blockedPermissions?.includes('android.permission.WRITE_EXTERNAL_STORAGE'), 'WRITE_EXTERNAL_STORAGE must be blocked.');
requireValue(config.plugins?.includes('./plugins/withReleaseSigning'), 'Release signing guard plugin is missing.');

for (const name of [
  'NEVULA_UPLOAD_STORE_FILE',
  'NEVULA_UPLOAD_STORE_PASSWORD',
  'NEVULA_UPLOAD_KEY_ALIAS',
  'NEVULA_UPLOAD_KEY_PASSWORD',
]) {
  requireValue(Boolean(process.env[name]), `${name} is not set.`);
}
if (process.env.NEVULA_UPLOAD_STORE_FILE) {
  requireValue(fs.existsSync(process.env.NEVULA_UPLOAD_STORE_FILE), 'NEVULA_UPLOAD_STORE_FILE does not exist.');
}

for (const name of ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_SUPPORT_URL', 'EXPO_PUBLIC_COMMUNITY_URL', 'EXPO_PUBLIC_DELETE_URL', 'EXPO_PUBLIC_IMPRINT_URL']) {
  const value = process.env[name];
  requireValue(Boolean(value), `${name} is not set.`);
  if (value) requireValue(/^https:\/\//i.test(value), `${name} must use HTTPS.`);
  if (value) requireValue(new URL(value).hostname === 'nevula.de', `${name} must use the official nevula.de domain.`);
}

const icon = path.join(root, 'assets', 'icon.png');
requireValue(fs.existsSync(icon), 'assets/icon.png is missing.');
if (fs.existsSync(icon) && fs.statSync(icon).size < 10_000) {
  warnings.push('assets/icon.png is still the tiny/transparent development icon; create a compliant 512x512 Play icon.');
}
requireValue(fs.existsSync(path.join(root, 'play-store', 'feature-graphic-1024x500.png')), 'Play feature graphic is missing.');
const screenshotDir = path.join(root, 'play-store', 'screenshots');
const screenshotCount = fs.existsSync(screenshotDir)
  ? fs.readdirSync(screenshotDir).filter(name => /\.(png|jpe?g)$/i.test(name) && fs.statSync(path.join(screenshotDir, name)).size > 0).length
  : 0;
requireValue(screenshotCount >= 2, 'At least two Play phone screenshots are missing.');

console.log(`NEVULA ${config.version} (${config.android.versionCode}) release readiness`);
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const failure of failures) console.log(`BLOCK ${failure}`);
if (failures.length) {
  console.error(`\nNot ready: ${failures.length} blocking item(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`\nReady for the technical Play bundle build (${warnings.length} warning(s)).`);
