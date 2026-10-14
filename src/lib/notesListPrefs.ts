// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as SecureStore from 'expo-secure-store';

export type NotesListPrefs = {
  pinned: string[];
  order: string[];
};

const KEY = 'nevula.notes.listprefs.v1';
const EMPTY: NotesListPrefs = { pinned: [], order: [] };

async function read(): Promise<NotesListPrefs> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return { pinned: [], order: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<NotesListPrefs>;
    return {
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((x): x is string => typeof x === 'string') : [],
      order: Array.isArray(parsed.order) ? parsed.order.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return { pinned: [], order: [] };
  }
}

async function write(prefs: NotesListPrefs) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(prefs), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadNotesListPrefs() {
  return read();
}

export async function setNotePinned(noteId: string, pinned: boolean) {
  const prefs = await read();
  if (pinned) {
    if (!prefs.pinned.includes(noteId)) prefs.pinned = [noteId, ...prefs.pinned];
    if (!prefs.order.includes(noteId)) prefs.order = [noteId, ...prefs.order];
  } else {
    prefs.pinned = prefs.pinned.filter(id => id !== noteId);
  }
  await write(prefs);
  return prefs;
}

export async function reorderNoteInList(
  noteId: string,
  toIndexInGroup: number,
  visibleIds: string[],
) {
  const prefs = await read();
  const pinnedSet = new Set(prefs.pinned);
  const isPinned = pinnedSet.has(noteId);
  const group = visibleIds.filter(id => pinnedSet.has(id) === isPinned);
  const from = group.indexOf(noteId);
  if (from < 0) return prefs;
  const to = Math.max(0, Math.min(group.length - 1, toIndexInGroup));
  if (from === to) return prefs;
  const nextGroup = [...group];
  const [item] = nextGroup.splice(from, 1);
  if (!item) return prefs;
  nextGroup.splice(to, 0, item);
  if (isPinned) prefs.pinned = nextGroup;
  const pinnedOrdered = isPinned ? nextGroup : prefs.pinned.filter(id => visibleIds.includes(id));
  const unpinned = isPinned
    ? visibleIds.filter(id => !pinnedSet.has(id))
    : nextGroup;
  prefs.order = [...pinnedOrdered, ...unpinned];
  await write(prefs);
  return prefs;
}

export function sortNotesByPrefs<T extends { id: string }>(notes: T[], prefs: NotesListPrefs): T[] {
  const byId = new Map(notes.map(n => [n.id, n]));
  const pinned = prefs.pinned.map(id => byId.get(id)).filter((n): n is T => Boolean(n));
  const pinnedSet = new Set(pinned.map(n => n.id));
  const restIds = prefs.order.filter(id => byId.has(id) && !pinnedSet.has(id));
  const orderedRest = restIds.map(id => byId.get(id)!);
  const seen = new Set([...pinnedSet, ...restIds]);
  const leftover = notes.filter(n => !seen.has(n.id));
  return [...pinned, ...orderedRest, ...leftover];
}

export { pinnedToneFor } from './chatListPrefs';
