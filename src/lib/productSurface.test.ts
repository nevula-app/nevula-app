// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const screensDir = join(srcDir, 'screens');
const componentsDir = join(srcDir, 'components');

function readSrc(relative: string) {
  return readFileSync(join(srcDir, relative), 'utf8');
}

function listTsx(dir: string) {
  return readdirSync(dir).filter(name => name.endsWith('.tsx')).sort();
}

describe('product surface', () => {
  it('onboarding offers exactly the two approved launcher appearances', () => {
    const setup = readSrc('components/AppearanceSetup.tsx');
    expect(setup).toMatch(/<IconChoice mode="nevula"/);
    expect(setup).toMatch(/<IconChoice mode="calculator"/);
    expect(setup.match(/<IconChoice mode=/g)).toHaveLength(2);
    expect(setup).toMatch(/Create your NEVULA identity/);
    expect(setup).toMatch(/Never share calculator codes, private keys or chat keys/);
  });

  it('messenger UI brands NVL3 (not OpenPGP as the live method)', () => {
    const messages = readSrc('screens/MessagesScreen.tsx');
    const home = readSrc('screens/NevulaHome.tsx');
    expect(messages).toMatch(/<Text style=\{s\.modalTitle\}>NVL3-QR Encryption<\/Text>/);
    expect(home).toMatch(/<Text style=\{styles\.modalTitle\}>NVL3-QR Encryption<\/Text>/);
    expect(messages).toMatch(/<Text style=\{s\.brandTitle\}>NEVULA<\/Text>/);
    expect(home).toMatch(/<Text style=\{styles\.heroTitle\}>Private Messenger<\/Text>/);
    expect(messages).not.toMatch(/<Text style=\{s\.securityTitle\}>NVL3<\/Text>/);
    expect(home).toMatch(/<Text style=\{styles\.chipTxt\}>NVL3-QR<\/Text>/);
    expect(home).toMatch(/NVL3 — Quantum-Resistant E2EE/);
    expect(home).not.toMatch(/heroEyebrow/);
    expect(messages).toMatch(/>NVL3-QR</);
    expect(messages).toMatch(/Next-generation cryptographic protection combining quantum-resistant encryption/);
    expect(home).toMatch(/Next-generation cryptographic protection combining quantum-resistant encryption/);
    expect(messages).toMatch(/fontFamily:'PlayfairDisplay-Regular'/);
    for (const name of listTsx(screensDir)) {
      const text = readFileSync(join(screensDir, name), 'utf8');
      expect(text).not.toMatch(/encrypted with OpenPGP|OpenPGP chat encryption is enabled/i);
    }
    for (const name of listTsx(componentsDir)) {
      const text = readFileSync(join(componentsDir, name), 'utf8');
      expect(text).not.toMatch(/encrypted with OpenPGP|OpenPGP chat encryption is enabled/i);
    }
  });

  it('camera ingest still strips media metadata before sealing', () => {
    const media = readSrc('lib/media.ts');
    const camera = readSrc('screens/CameraScreen.tsx');
    expect(media).toMatch(/import \{ stripMediaFile \} from '\.\/stripMediaMeta'/);
    expect(media).toMatch(/export async function ingestCapture\(/);
    expect(media).toMatch(/stripMediaFile\(/);
    expect(media).toMatch(/export async function importPhoneMedia\(/);
    expect(camera).toMatch(/from '\.\.\/lib\/media'/);
    expect(camera).toMatch(/await ingestCapture\(shot\.uri, 'photo'\)/);
    expect(camera).toMatch(/await ingestCapture\(clip\.uri, 'video', durationMs\)/);
    expect(camera).toMatch(/importPhoneMedia/);
    expect(camera).toMatch(/launchImageLibraryAsync/);
    expect(camera).toMatch(/getDocumentAsync/);
    const messages = readSrc('screens/MessagesScreen.tsx');
    expect(messages).toMatch(/sendVaultItem/);
    expect(messages).toMatch(/Send from Gallery/);
    expect(messages).not.toMatch(/launchImageLibraryAsync/);
    const vaultNotice = readSrc('components/VaultNotice.tsx');
    expect(vaultNotice).toMatch(/Identifying metadata/);
    expect(vaultNotice).toMatch(/GPS location, device name and capture date/);
    expect(vaultNotice).toMatch(/regular phone gallery/);
  });

  it('QR / key pairing still stores verification without UI checkmarks', () => {
    const messages = readSrc('screens/MessagesScreen.tsx');
    expect(messages).toMatch(/import \{ loadVerifiedContacts, markContactVerified, unverifyContact, type VerificationMethod \} from '\.\.\/lib\/verifiedContacts'/);
    expect(messages).toMatch(/await pairFromPayload\(data, 'in_person'\)/);
    expect(messages).toMatch(/await pairFromPayload\(raw, 'key'\)/);
    expect(messages).toMatch(/markContactVerified\(/);
    expect(messages).toMatch(/request\.sender_id/);
    expect(messages).toMatch(/request\.trust === 'key' \? 'key' : 'in_person'/);
    expect(messages).toMatch(/sendContactRequest\(/);
    expect(messages).toMatch(/they do not need to scan you back/);
    expect(messages).toMatch(/verification: verifiedMap\.get\(contact\.userId\) \?\? null/);
    expect(messages).not.toMatch(/<VerifiedMark/);
    expect(messages).not.toMatch(/Trusted checkmark/);
    expect(readSrc('lib/verifiedContacts.ts')).toMatch(/export async function markContactVerified\(/);
    expect(readSrc('lib/verifiedContacts.ts')).toMatch(/export type VerificationMethod = 'in_person' \| 'key'/);
  });
});
