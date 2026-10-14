// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

export const UNLOCK_KEY = 'nevula.unlockCode';
export const WIPE_KEY = 'nevula.wipeCode';
export const PIN_SPECIALS = ['−', '+', '×', '÷', '.', '%'] as const;
export const PIN_POLICY = 'At least 6 digits plus one of − + × ÷ . %';

const LOCKOUT_KEY = 'nevula.unlock.lockout.v1';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type LockoutState = {
  windowFails: number;
  strikes: number;
  lockedUntil: number | null;
};

const EMPTY_LOCKOUT: LockoutState = { windowFails: 0, strikes: 0, lockedUntil: null };

function filesThatMeanExistingInstall() {
  const root = FileSystem.documentDirectory ?? '';
  return [
    `${root}nevula-notes.pgp`,
    `${root}nevula-calendar.json`,
    `${root}nevula-private-key.asc`,
    `${root}nevula-vault/`,
  ];
}

export function normalizePin(value: string) {
  return value.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
}

export function pinsMatch(a: string, b: string) {
  return normalizePin(a) === normalizePin(b);
}

export function isCustomerPin(value: string) {
  const pin = normalizePin(value);
  const digits = pin.match(/\d/g)?.length ?? 0;
  return pin.length <= 24 && /^[0-9+\-*/.%]+$/.test(pin) && digits >= 6 && /[+\-*/.%]/.test(pin);
}

/** Unlock PIN must meet the customer policy. There is no preset or test code. */
export function isSetupPin(value: string) {
  return isCustomerPin(value);
}

/** Wipe PIN must meet the same policy. There is no preset or test code. */
export function isWipePin(value: string) {
  return isCustomerPin(value);
}

export function isPinAttempt(expression: string, _storedCode: string | null) {
  const pin = normalizePin(expression);
  if (!/^[0-9+\-*/.%]+$/.test(pin)) return false;
  return isCustomerPin(expression);
}

export function pinError(value: string) {
  if (!value) return PIN_POLICY;
  if (isSetupPin(value)) return null;
  return PIN_POLICY;
}

export function wipePinError(value: string) {
  if (!value) return PIN_POLICY;
  if (isWipePin(value)) return null;
  return PIN_POLICY;
}

export async function hasExistingInstallData() {
  for (const path of filesThatMeanExistingInstall()) {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) return true;
  }
  return false;
}

export async function loadUnlockCode() {
  return SecureStore.getItemAsync(UNLOCK_KEY);
}

export async function saveUnlockCode(nextCode: string) {
  await SecureStore.setItemAsync(UNLOCK_KEY, nextCode, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadWipeCode() {
  return SecureStore.getItemAsync(WIPE_KEY);
}

export async function saveWipeCode(nextCode: string) {
  await SecureStore.setItemAsync(WIPE_KEY, nextCode, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearWipeCode() {
  await SecureStore.deleteItemAsync(WIPE_KEY);
}

export async function clearUnlockCode() {
  await SecureStore.deleteItemAsync(UNLOCK_KEY);
}

async function readLockout(): Promise<LockoutState> {
  const raw = await SecureStore.getItemAsync(LOCKOUT_KEY);
  if (!raw) return { ...EMPTY_LOCKOUT };
  try {
    const parsed = JSON.parse(raw) as Partial<LockoutState>;
    return {
      windowFails: Number(parsed.windowFails) || 0,
      strikes: Number(parsed.strikes) || 0,
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : null,
    };
  } catch {
    return { ...EMPTY_LOCKOUT };
  }
}

async function writeLockout(state: LockoutState) {
  await SecureStore.setItemAsync(LOCKOUT_KEY, JSON.stringify(state), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function resetLockout() {
  await SecureStore.deleteItemAsync(LOCKOUT_KEY);
}

export async function getLockoutState() {
  const state = await readLockout();
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    const next = { ...state, lockedUntil: null, windowFails: 0 };
    await writeLockout(next);
    return next;
  }
  return state;
}

export async function recordUnlockSuccess() {
  const state = await getLockoutState();
  await writeLockout({ ...state, windowFails: 0 });
}

export type FailResult =
  | { action: 'none'; windowFails: number; lockedUntil: null }
  | { action: 'lock'; windowFails: number; lockedUntil: number }
  | { action: 'wipe'; windowFails: number; lockedUntil: null };

export async function recordFailedPin(): Promise<FailResult> {
  const state = await getLockoutState();
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return { action: 'lock', windowFails: state.windowFails, lockedUntil: state.lockedUntil };
  }

  const windowFails = state.windowFails + 1;
  if (windowFails < 3) {
    await writeLockout({ ...state, windowFails, lockedUntil: null });
    return { action: 'none', windowFails, lockedUntil: null };
  }

  if (state.strikes <= 0) {
    const lockedUntil = Date.now() + SIX_HOURS_MS;
    await writeLockout({ windowFails: 0, strikes: 1, lockedUntil });
    return { action: 'lock', windowFails: 0, lockedUntil };
  }

  if (state.strikes === 1) {
    const lockedUntil = Date.now() + ONE_DAY_MS;
    await writeLockout({ windowFails: 0, strikes: 2, lockedUntil });
    return { action: 'lock', windowFails: 0, lockedUntil };
  }

  return { action: 'wipe', windowFails: 0, lockedUntil: null };
}
