// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

let holdUntil = 0;
let vaultUnlocked = false;

export function setVaultUnlocked(open: boolean) {
  vaultUnlocked = open;
}

export function isVaultUnlocked() {
  return vaultUnlocked;
}

export function holdAppLock(ms = 25_000) {
  holdUntil = Math.max(holdUntil, Date.now() + ms);
}

export function clearAppLockHold() {
  holdUntil = 0;
}

export function shouldHoldAppLock() {
  return Date.now() < holdUntil;
}
