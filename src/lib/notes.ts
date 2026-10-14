// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as openpgp from 'openpgp';
import { decryptUtf8, encryptUtf8 } from './localCrypto';
import { docPreview, parseNoteDoc } from './noteDoc';

const NOTES_FILE = `${FileSystem.documentDirectory}nevula-notes.pgp`;
const PASS_KEY = 'nevula.notes.passphrase.v1';
export const ALL_FOLDER_ID = 'all';
export const INBOX_FOLDER_ID = 'inbox';

export type NoteKind = 'text' | 'todo' | 'voice';

export type NoteTodo = {
  id: string;
  text: string;
  done: boolean;
};

export type Note = {
  id: string;
  folderId: string;
  title: string;
  body: string;
  kind: NoteKind;
  todos: NoteTodo[];
  createdAt: string;
  updatedAt: string;
};

export type NoteFolder = {
  id: string;
  name: string;
};

type NotesStore = {
  folders: NoteFolder[];
  notes: Note[];
};

const emptyStore = (): NotesStore => ({
  folders: [{ id: INBOX_FOLDER_ID, name: 'Notes' }],
  notes: [],
});

let cache: NotesStore | null = null;
let writeChain: Promise<void> = Promise.resolve();

function newId() {
  return globalThis.crypto.randomUUID();
}

async function notesPassphrase() {
  const existing = await SecureStore.getItemAsync(PASS_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const created = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(PASS_KEY, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return created;
}

async function parseStorePayload(raw: string): Promise<NotesStore> {
  try {
    return JSON.parse(await decryptUtf8(raw)) as NotesStore;
  } catch {
    const passphrase = await notesPassphrase();
    const message = await openpgp.readMessage({ armoredMessage: raw });
    const result = await openpgp.decrypt({ message, passwords: [passphrase], format: 'utf8' });
    return JSON.parse(result.data as string) as NotesStore;
  }
}

async function readStore(): Promise<NotesStore> {
  if (cache) return cache;
  const info = await FileSystem.getInfoAsync(NOTES_FILE);
  if (!info.exists) {
    cache = emptyStore();
    return cache;
  }
  try {
    const parsed = await parseStorePayload(await FileSystem.readAsStringAsync(NOTES_FILE));
    cache = {
      folders: parsed.folders?.length ? parsed.folders : emptyStore().folders,
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    };
  } catch {
    cache = emptyStore();
  }
  return cache;
}

async function writeStore(next: NotesStore) {
  cache = next;
  writeChain = writeChain.then(async () => {
    await FileSystem.writeAsStringAsync(NOTES_FILE, await encryptUtf8(JSON.stringify(next)));
  });
  await writeChain;
}

export async function loadNotesWorkspace() {
  const store = await readStore();
  return {
    folders: store.folders,
    notes: [...store.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export async function createFolder(name: string) {
  const store = await readStore();
  const folder: NoteFolder = { id: newId(), name: name.trim() || 'Folder' };
  await writeStore({ ...store, folders: [...store.folders, folder] });
  return folder;
}

export async function renameFolder(id: string, name: string) {
  const store = await readStore();
  await writeStore({
    ...store,
    folders: store.folders.map(folder => folder.id === id ? { ...folder, name: name.trim() || folder.name } : folder),
  });
}

export async function deleteFolder(id: string) {
  if (id === INBOX_FOLDER_ID) return;
  const store = await readStore();
  await writeStore({
    folders: store.folders.filter(folder => folder.id !== id),
    notes: store.notes.map(note => note.folderId === id ? { ...note, folderId: INBOX_FOLDER_ID, updatedAt: new Date().toISOString() } : note),
  });
}

export async function createNote(kind: NoteKind, folderId: string) {
  const store = await readStore();
  const now = new Date().toISOString();
  const note: Note = {
    id: newId(),
    folderId: folderId === ALL_FOLDER_ID ? INBOX_FOLDER_ID : folderId,
    title: '',
    body: '',
    kind,
    todos: kind === 'todo' ? [{ id: newId(), text: '', done: false }] : [],
    createdAt: now,
    updatedAt: now,
  };
  await writeStore({ ...store, notes: [note, ...store.notes] });
  return note;
}

export async function saveNote(next: Note) {
  const store = await readStore();
  const updated = { ...next, updatedAt: new Date().toISOString() };
  const exists = store.notes.some(note => note.id === updated.id);
  await writeStore({
    ...store,
    notes: exists
      ? store.notes.map(note => note.id === updated.id ? updated : note)
      : [updated, ...store.notes],
  });
  return updated;
}

export async function deleteNote(id: string) {
  const store = await readStore();
  await writeStore({ ...store, notes: store.notes.filter(note => note.id !== id) });
}

export function previewOf(note: Note) {
  if (note.kind === 'todo') {
    const line = note.todos.map(item => item.text.trim()).filter(Boolean).join(' · ');
    return line || '';
  }
  if (note.body.startsWith('NVLDOC.1.') || note.body.startsWith('NVLDOC.2.')) {
    return docPreview(parseNoteDoc(note.body));
  }
  return note.body.replace(/\s+/g, ' ').trim();
}

export async function wipeNotes() {
  cache = null;
  writeChain = Promise.resolve();
  await FileSystem.deleteAsync(NOTES_FILE, { idempotent: true }).catch(() => undefined);
  await SecureStore.deleteItemAsync(PASS_KEY).catch(() => undefined);
}
