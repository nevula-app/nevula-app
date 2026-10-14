// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { stripMediaFile } from './stripMediaMeta';

const PREFIX = 'NVL3AVA.1.';
const DIR_NAME = 'nevula-avatars/';

type Listener = () => void;
const listeners = new Set<Listener>();

export type AvatarPayload = { k: 'avatar'; v: string; img?: string; clear?: 1 };

export function subscribeAvatars(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit() {
  listeners.forEach(listener => listener());
}

function rootDir() {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Avatar storage is unavailable.');
  return `${root}${DIR_NAME}`;
}

export function isAvatarPlaintext(body: string) {
  return body.startsWith(PREFIX);
}

export function encodeAvatar(payload: { version: string; imageBase64?: string; clear?: boolean }) {
  const body: AvatarPayload = payload.clear
    ? { k: 'avatar', v: payload.version, clear: 1 }
    : { k: 'avatar', v: payload.version, img: payload.imageBase64 };
  return PREFIX + JSON.stringify(body);
}

export function tryParseAvatar(body: string): AvatarPayload | null {
  if (!isAvatarPlaintext(body)) return null;
  try {
    const parsed = JSON.parse(body.slice(PREFIX.length)) as AvatarPayload;
    if (parsed?.k !== 'avatar' || typeof parsed.v !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function versionOf(value: string) {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 17) hash = Math.imul(hash, 33) ^ value.charCodeAt(i);
  return `${(hash >>> 0).toString(16)}:${value.length.toString(16)}`;
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(rootDir());
  if (!info.exists) await FileSystem.makeDirectoryAsync(rootDir(), { intermediates: true });
}

function selfPath() {
  return `${rootDir()}self.jpg`;
}

function peerPath(userId: string) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'peer';
  return `${rootDir()}peer-${safe}.jpg`;
}

function withStamp(path: string, stamp: number | undefined) {
  return `${path}?v=${stamp ?? 1}`;
}

export async function wipeAvatars() {
  await FileSystem.deleteAsync(rootDir(), { idempotent: true }).catch(() => undefined);
  emit();
}

export async function selfAvatarUri() {
  const path = selfPath();
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? withStamp(path, info.modificationTime) : null;
}

export async function peerAvatarUri(userId: string) {
  const path = peerPath(userId);
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? withStamp(path, info.modificationTime) : null;
}

async function shrinkToJpeg(uri: string) {
  try {
    const mod = await import('expo-image-manipulator');
    const out = await mod.manipulateAsync(uri, [{ resize: { width: 192 } }], {
      compress: 0.72,
      format: mod.SaveFormat.JPEG,
    });
    return out.uri;
  } catch {
    return uri;
  }
}

export async function prepareAvatarFile(uri: string) {
  const shrunk = await shrinkToJpeg(uri);
  const clean = await stripMediaFile(shrunk, 'photo', 'jpg').catch(() => shrunk);
  const base64 = await FileSystem.readAsStringAsync(clean, { encoding: 'base64' });
  if (!base64) throw new Error('Picture is empty.');
  if (base64.length > 120000) throw new Error('Picture is too large.');
  await ensureDir();
  await FileSystem.writeAsStringAsync(selfPath(), base64, { encoding: 'base64' });
  emit();
  return { plaintext: encodeAvatar({ version: versionOf(base64), imageBase64: base64 }) };
}

export async function clearSelfAvatar() {
  await FileSystem.deleteAsync(selfPath(), { idempotent: true }).catch(() => undefined);
  emit();
  return { plaintext: encodeAvatar({ version: Date.now().toString(16), clear: true }) };
}

export async function applyIncomingAvatar(peerUserId: string, body: string) {
  const parsed = tryParseAvatar(body);
  if (!parsed) return;
  await ensureDir();
  const path = peerPath(peerUserId);
  if (parsed.clear || !parsed.img) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
  } else {
    await FileSystem.writeAsStringAsync(path, parsed.img, { encoding: 'base64' });
  }
  emit();
}

export async function pickPhoneAvatar() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Gallery permission is needed.');
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.4,
  });
  if (picked.canceled || !picked.assets[0]?.uri) return null;
  return prepareAvatarFile(picked.assets[0].uri);
}

export async function captureAvatar() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera permission is needed.');
  const picked = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.4,
  });
  if (picked.canceled || !picked.assets[0]?.uri) return null;
  return prepareAvatarFile(picked.assets[0].uri);
}

export function avatarCopy() {
  const german = (Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase().startsWith('de');
  if (german) {
    return {
      title: 'Profilbild',
      gallery: 'Aus der Galerie',
      nevula: 'NEVULA-Galerie',
      camera: 'Foto aufnehmen',
      remove: 'Bild entfernen',
      cancel: 'Abbrechen',
      empty: 'Keine Fotos in der NEVULA-Galerie.',
      close: 'Schließen',
      failed: 'Das Profilbild konnte nicht gespeichert werden.',
    };
  }
  return {
    title: 'Profile picture',
    gallery: 'Choose from gallery',
    nevula: 'NEVULA gallery',
    camera: 'Take photo',
    remove: 'Remove picture',
    cancel: 'Cancel',
    empty: 'No photos in the NEVULA gallery.',
    close: 'Close',
    failed: 'The profile picture could not be saved.',
  };
}
