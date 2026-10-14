// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ALL_FOLDER_ID,
  INBOX_FOLDER_ID,
  Note,
  NoteFolder,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  loadNotesWorkspace,
  previewOf,
  saveNote,
} from '../lib/notes';
import {
  applyMarksToRange,
  emptyDocLine,
  emptyMarks,
  linePlainText,
  NOTE_DOC_COLORS,
  NoteDocLine,
  NoteDocMarks,
  parseNoteDoc,
  runsAfterEdit,
  serializeNoteDoc,
} from '../lib/noteDoc';
import {
  loadNotesListPrefs,
  NotesListPrefs,
  pinnedToneFor,
  reorderNoteInList,
  setNotePinned,
  sortNotesByPrefs,
} from '../lib/notesListPrefs';
import BrandMark from '../components/BrandMark';
import OrbotOnionMark from '../components/OrbotOnionMark';
import TopUnreadBadge from '../components/TopUnreadBadge';
import ChatListSwipeRow from '../components/ChatListSwipeRow';
import { BRAND_EYEBROW, HomePalette, useDisplayTheme } from '../lib/displayTheme';
import { androidStatusInset } from '../lib/statusInset';
import { subscribeInAppUnreadSnapshot } from '../lib/inAppUnread';

type Props = { onBack: () => void; onOpenMessages?: () => void };

const t = {
  all: 'All notes',
  last7: 'Last 7 days',
  searchHint: 'Search notes',
  newFolder: 'New folder',
  folderName: 'Folder name',
  create: 'Create',
  cancel: 'Cancel',
  delete: 'Delete',
  empty: 'No notes yet',
  emptyHint: 'Tap the pencil below to create a note.',
  noText: 'No text',
  title: 'Title',
  body: 'Start writing',
  yesterday: 'Yesterday',
  saveError: 'The note could not be saved.',
  deleteNoteQ: 'Delete this note?',
  deleteFolderQ: 'Delete this folder? Notes move back to Notes.',
};

const ROW_H = 88;

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long' });
}

function noteDateLabel(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startNote = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (startNote === startToday) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (startNote === startToday - 86400000) return t.yesterday;
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function NotesScreen({ onBack, onOpenMessages }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [listPrefs, setListPrefs] = useState<NotesListPrefs>({ pinned: [], order: [] });
  const [folderId, setFolderId] = useState(ALL_FOLDER_ID);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [swipeCloseSignal, setSwipeCloseSignal] = useState(0);
  const [scrollLock, setScrollLock] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragDyRef = useRef(0);
  const dragSessionRef = useRef<{ id: string } | null>(null);
  const listPrefsRef = useRef(listPrefs);
  listPrefsRef.current = listPrefs;
  const visibleRef = useRef<Note[]>([]);
  const finishDragRef = useRef<() => void>(() => undefined);

  useEffect(() => subscribeInAppUnreadSnapshot((snap) => setUnreadCount(snap.count)), []);

  const reload = async () => {
    const [next, prefs] = await Promise.all([loadNotesWorkspace(), loadNotesListPrefs()]);
    setFolders(next.folders);
    setNotes(next.notes);
    setListPrefs(prefs);
    return next;
  };

  useEffect(() => { reload().catch(() => {}); }, []);

  const currentFolder = folders.find(folder => folder.id === folderId);
  const title = folderId === ALL_FOLDER_ID ? t.all : (currentFolder?.name ?? t.all);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = notes.filter(note => {
      if (folderId !== ALL_FOLDER_ID && note.folderId !== folderId) return false;
      if (!needle) return true;
      return `${note.title}\n${note.body}\n${previewOf(note)}`.toLowerCase().includes(needle);
    });
    return sortNotesByPrefs(filtered, listPrefs);
  }, [notes, folderId, query, listPrefs]);
  visibleRef.current = visible;

  finishDragRef.current = () => {
    void (async () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      const dy = dragDyRef.current;
      setDragId(null);
      setDragDy(0);
      dragDyRef.current = 0;
      setScrollLock(false);
      if (!session) return;
      const list = visibleRef.current;
      const note = list.find(n => n.id === session.id);
      if (!note) return;
      const prefsNow = listPrefsRef.current;
      const pinnedSet = new Set(prefsNow.pinned);
      const isPinned = pinnedSet.has(note.id);
      const group = list.filter(n => pinnedSet.has(n.id) === isPinned);
      const fromInGroup = group.findIndex(n => n.id === note.id);
      if (fromInGroup < 0) return;
      const delta = Math.round(dy / ROW_H);
      const toInGroup = Math.max(0, Math.min(group.length - 1, fromInGroup + delta));
      if (toInGroup === fromInGroup) return;
      const visibleIds = list.map(n => n.id);
      const optimistic = [...group.map(n => n.id)];
      const [moved] = optimistic.splice(fromInGroup, 1);
      if (moved) optimistic.splice(toInGroup, 0, moved);
      setListPrefs({
        ...prefsNow,
        pinned: isPinned ? optimistic : prefsNow.pinned,
        order: isPinned
          ? [...optimistic, ...visibleIds.filter(id => !pinnedSet.has(id))]
          : [...prefsNow.pinned.filter(id => visibleIds.includes(id)), ...optimistic],
      });
      const prefs = await reorderNoteInList(note.id, toInGroup, visibleIds);
      setListPrefs(prefs);
    })();
  };

  const openNew = async () => {
    try {
      const note = await createNote('text', folderId);
      await reload();
      setEditing(note);
    } catch (error: any) {
      Alert.alert('Could not create note', error?.message ?? 'Please try again.');
    }
  };

  const handleCreateFolder = async () => {
    const created = await createFolder(folderName);
    setFolderName('');
    setNewFolderOpen(false);
    const next = await reload();
    setFolderId(created.id);
    setFoldersOpen(false);
    setFolders(next.folders);
  };

  const handlePin = async (note: Note) => {
    const pinned = listPrefs.pinned.includes(note.id);
    const prefs = await setNotePinned(note.id, !pinned);
    setListPrefs(prefs);
    setSwipeCloseSignal(n => n + 1);
  };

  const handleDelete = async (note: Note) => {
    await deleteNote(note.id);
    setSwipeCloseSignal(n => n + 1);
    await reload();
  };

  if (editing) {
    return <NoteEditor note={editing} onClose={() => { setEditing(null); reload().catch(() => {}); }}/>;
  }

  return <SafeAreaView style={[s.container,s.safeContainer]}>
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconButton}><Text style={s.backText}>{'\u2039'}</Text></Pressable>
      <Pressable onPress={() => setFoldersOpen(true)} style={s.titleHit}>
        <BrandMark style={s.eyebrow} />
        <Text style={s.title} numberOfLines={1}>{title}</Text>
      </Pressable>
      <Pressable onPress={() => { setNewFolderOpen(true); setFolderName(''); }} style={s.iconButton}><Text style={s.toolTxt}>+</Text></Pressable>
      <Pressable onPress={() => setSearchOpen(open => !open)} style={s.iconButton}><Text style={s.toolTxt}>{'\u2315'}</Text></Pressable>
      <TopUnreadBadge count={unreadCount} onPress={onOpenMessages} />
      <OrbotOnionMark compact size={18} />
    </View>

    {searchOpen && <View style={s.searchWrap}><TextInput value={query} onChangeText={setQuery} placeholder={t.searchHint} placeholderTextColor={p.muted} style={s.search} autoFocus/></View>}

    <ScrollView
      style={s.listScroll}
      contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!scrollLock && !dragId}
    >
      {visible.length === 0 && <View style={s.emptyBox}><Text style={s.empty}>{t.empty}</Text><Text style={s.emptyHint}>{t.emptyHint}</Text></View>}
      {visible.map(note => {
        const preview = previewOf(note) || t.noText;
        const pinTone = pinnedToneFor(note.id, listPrefs.pinned);
        const pinned = Boolean(pinTone);
        let dragOffsetY = 0;
        if (dragId) {
          const prefsNow = listPrefs;
          const pinnedSet = new Set(prefsNow.pinned);
          const isPinned = pinnedSet.has(note.id);
          const group = visible.filter(n => pinnedSet.has(n.id) === isPinned);
          const fromInGroup = group.findIndex(n => n.id === dragId);
          const myInGroup = group.findIndex(n => n.id === note.id);
          if (fromInGroup >= 0 && myInGroup >= 0) {
            if (note.id === dragId) {
              dragOffsetY = dragDy;
            } else {
              const toInGroup = Math.max(0, Math.min(group.length - 1, fromInGroup + Math.round(dragDy / ROW_H)));
              if (fromInGroup < toInGroup && myInGroup > fromInGroup && myInGroup <= toInGroup) {
                dragOffsetY = -ROW_H;
              } else if (fromInGroup > toInGroup && myInGroup < fromInGroup && myInGroup >= toInGroup) {
                dragOffsetY = ROW_H;
              }
            }
          }
        }
        return (
          <ChatListSwipeRow
            key={note.id}
            pinned={pinned}
            closeSignal={swipeCloseSignal}
            scrollLock={setScrollLock}
            onPress={() => setEditing(note)}
            onTogglePin={() => { void handlePin(note); }}
            onConfirmDelete={() => { void handleDelete(note); }}
            onDragStart={() => {
              dragSessionRef.current = { id: note.id };
              dragDyRef.current = 0;
              setDragDy(0);
              setDragId(note.id);
              setScrollLock(true);
              setSwipeCloseSignal(n => n + 1);
            }}
            onDragMove={(dy) => {
              dragDyRef.current = dy;
              setDragDy(dy);
            }}
            onDragEnd={(dy) => {
              dragDyRef.current = dy;
              finishDragRef.current();
            }}
            dragging={dragId === note.id}
            dragOffsetY={dragOffsetY}
            style={[
              s.card,
              pinTone && { borderColor: pinTone.border, backgroundColor: pinTone.background },
            ]}
          >
            <View style={s.cardCopy}>
              <View style={s.cardTitleRow}>
                {pinTone ? <Text style={[s.pinMark, { color: pinTone.border }]}>📌</Text> : null}
                <Text style={s.cardTitle} numberOfLines={1}>{note.title.trim() || preview || t.noText}</Text>
              </View>
              <View style={s.cardMeta}>
                <Text style={s.cardTime}>{noteDateLabel(note.updatedAt)}</Text>
                <Text style={s.cardPreview} numberOfLines={1}>{preview || t.noText}</Text>
              </View>
            </View>
          </ChatListSwipeRow>
        );
      })}
    </ScrollView>

    <View style={s.fabBar}>
      <Pressable onPress={openNew} style={s.fabMain}><Text style={s.fabMainIcon}>✎</Text></Pressable>
    </View>

    <Modal visible={foldersOpen} transparent animationType="fade" onRequestClose={() => setFoldersOpen(false)}>
      <Pressable style={s.backdrop} onPress={() => setFoldersOpen(false)}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.sheetTitle}>Folders</Text>
          <Pressable onPress={() => { setFolderId(ALL_FOLDER_ID); setFoldersOpen(false); }} style={[s.sheetRow, folderId === ALL_FOLDER_ID && s.sheetRowOn]}>
            <Text style={s.sheetRowTxt}>{t.all}</Text>
            <Text style={s.sheetCount}>{notes.length}</Text>
          </Pressable>
          {folders.map(folder => <Pressable key={folder.id} onPress={() => { setFolderId(folder.id); setFoldersOpen(false); }} onLongPress={() => {
            if (folder.id === INBOX_FOLDER_ID) return;
            Alert.alert(folder.name, t.deleteFolderQ, [
              { text: t.cancel, style: 'cancel' },
              { text: t.delete, style: 'destructive', onPress: async () => { await deleteFolder(folder.id); if (folderId === folder.id) setFolderId(ALL_FOLDER_ID); reload(); } },
            ]);
          }} style={[s.sheetRow, folderId === folder.id && s.sheetRowOn]}>
            <Text style={s.sheetRowTxt}>{folder.name}</Text>
            <Text style={s.sheetCount}>{notes.filter(note => note.folderId === folder.id).length}</Text>
          </Pressable>)}
          <Pressable onPress={() => { setFoldersOpen(false); setNewFolderOpen(true); setFolderName(''); }} style={s.sheetNew}><Text style={s.sheetNewTxt}>{t.newFolder}</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>

    <Modal visible={newFolderOpen} transparent animationType="fade" onRequestClose={() => setNewFolderOpen(false)}>
      <View style={s.backdrop}>
        <View style={s.modal}>
          <Text style={s.sheetTitle}>{t.newFolder}</Text>
          <TextInput value={folderName} onChangeText={setFolderName} placeholder={t.folderName} placeholderTextColor={p.muted} style={s.input} autoFocus/>
          <View style={s.modalActions}>
            <Pressable onPress={() => setNewFolderOpen(false)}><Text style={s.cancel}>{t.cancel}</Text></Pressable>
            <Pressable onPress={handleCreateFolder} style={s.save}><Text style={s.saveTxt}>{t.create}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function NoteEditor({ note, onClose }: { note: Note; onClose: () => void }) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [title, setTitle] = useState(note.title);
  const [lines, setLines] = useState<NoteDocLine[]>(() => parseNoteDoc(note.body).map(l => ({ ...l, list: 'none', done: false })));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [activeMarks, setActiveMarks] = useState<NoteDocMarks>(() => emptyMarks());
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [caretOn, setCaretOn] = useState(true);
  const [caretBox, setCaretBox] = useState<{ lineId: string; x: number; y: number; h: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const goneRef = useRef(false);
  const draftRef = useRef({ title: note.title, lines });
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  draftRef.current = { title, lines };

  const focused = lines.find(l => l.id === focusId) ?? null;
  const hasSelection = selection.start !== selection.end;

  useEffect(() => {
    if (!focusId || hasSelection) return;
    setCaretOn(true);
    const id = setInterval(() => setCaretOn(on => !on), 530);
    return () => clearInterval(id);
  }, [focusId, hasSelection, selection.start]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = draftRef.current;
      const body = serializeNoteDoc(current.lines);
      const empty = !current.title.trim() && !current.lines.some(l => linePlainText(l).trim());
      if (!empty) {
        saveNote({
          ...note,
          title: current.title,
          body,
          kind: 'text',
          todos: [],
        }).catch(() => undefined);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [title, lines, note]);

  useEffect(() => () => {
    if (goneRef.current) return;
    const current = draftRef.current;
    const empty = !current.title.trim() && !current.lines.some(l => linePlainText(l).trim());
    if (empty) deleteNote(note.id).catch(() => {});
    else {
      saveNote({
        ...note,
        title: current.title,
        body: serializeNoteDoc(current.lines),
        kind: 'text',
        todos: [],
      }).catch(() => Alert.alert('NEVULA', t.saveError));
    }
  }, [note]);

  const patchLineRuns = (id: string, next: NoteDocLine) => {
    setLines(prev => prev.map(l => (l.id === id ? { ...next, list: 'none', done: false } : l)));
  };

  const toggleFormat = (key: 'bold' | 'italic' | 'underline') => {
    const nextVal = !activeMarks[key];
    if (focused && hasSelection) {
      patchLineRuns(focused.id, applyMarksToRange(focused, selection.start, selection.end, { [key]: nextVal }));
    }
    setActiveMarks(prev => ({ ...prev, [key]: nextVal }));
  };

  const applyColor = (color: string) => {
    setColorOpen(false);
    const value = color === '#e8eef7' ? undefined : color;
    if (focused && hasSelection) {
      patchLineRuns(focused.id, applyMarksToRange(focused, selection.start, selection.end, { color: value ?? '' }));
    }
    setActiveMarks(prev => ({ ...prev, color: value }));
  };

  const onChangeLineText = (lineId: string, index: number, text: string) => {
    if (text.includes('\n')) {
      const parts = text.split('\n');
      const first = parts[0] ?? '';
      const rest = parts.slice(1);
      const created = rest.map(chunk => emptyDocLine({
        list: 'none',
        text: chunk,
        bold: activeMarks.bold,
        italic: activeMarks.italic,
        underline: activeMarks.underline,
        color: activeMarks.color,
      }));
      setLines(prev => {
        const next = [...prev];
        const current = next[index];
        if (!current || current.id !== lineId) return prev;
        next[index] = { ...current, runs: runsAfterEdit(current, first, activeMarks), list: 'none', done: false };
        next.splice(index + 1, 0, ...created);
        return next;
      });
      const focusTarget = created[created.length - 1];
      if (focusTarget) setFocusId(focusTarget.id);
      return;
    }
    setLines(prev => prev.map(l => (
      l.id === lineId
        ? { ...l, runs: runsAfterEdit(l, text, activeMarks), list: 'none', done: false }
        : l
    )));
  };

  const placeCaret = (line: NoteDocLine, cursor: number) => {
    const len = linePlainText(line).length;
    const at = Math.max(0, Math.min(cursor, len));
    setFocusId(line.id);
    setSelection({ start: at, end: at });
    const input = inputRefs.current[line.id];
    input?.focus();
    requestAnimationFrame(() => {
      inputRefs.current[line.id]?.setNativeProps({ selection: { start: at, end: at } });
    });
  };

  const resumeWriting = () => {
    const line = lines.find(item => item.id === focusId) ?? lines[lines.length - 1];
    if (!line) return;
    placeCaret(line, linePlainText(line).length);
  };

  const onSubmitLine = (index: number) => {
    const line = lines[index];
    if (!line) return;
    onChangeLineText(line.id, index, `${linePlainText(line)}\n`);
  };

  const noteIsEmpty = lines.every(line => !linePlainText(line));

  const renderLineVisual = (line: NoteDocLine, editing: boolean, index: number) => {
    const plain = linePlainText(line);
    const selA = Math.min(selection.start, selection.end);
    const selB = Math.max(selection.start, selection.end);
    const showSel = editing && selA !== selB;
    const showPlaceholder = noteIsEmpty && index === 0 && !editing;

    if (!plain) {
      return (
        <Text style={s.linePreview}>
          {showPlaceholder ? <Text style={{ color: p.muted }}>{t.body}</Text> : ' '}
        </Text>
      );
    }

    let offset = 0;
    return (
      <Text style={s.linePreview}>
        {line.runs.map((run, ri) => {
          const runStart = offset;
          const runEnd = offset + run.text.length;
          offset = runEnd;
          const markStyle = [
            run.bold && s.lineBold,
            run.italic && s.lineItalic,
            run.underline && s.lineUnderline,
            { color: run.color || p.text },
          ];
          if (!showSel || selB <= runStart || selA >= runEnd) {
            return (
              <Text key={`${line.id}-${ri}`} style={markStyle}>
                {run.text}
              </Text>
            );
          }
          const left = Math.max(runStart, selA);
          const right = Math.min(runEnd, selB);
          const before = run.text.slice(0, left - runStart);
          const mid = run.text.slice(left - runStart, right - runStart);
          const after = run.text.slice(right - runStart);
          return (
            <Text key={`${line.id}-${ri}`}>
              {before ? <Text style={markStyle}>{before}</Text> : null}
              {mid ? <Text style={[markStyle, s.lineSelected]}>{mid}</Text> : null}
              {after ? <Text style={markStyle}>{after}</Text> : null}
            </Text>
          );
        })}
      </Text>
    );
  };

  return <SafeAreaView style={[s.container,s.safeContainer]}>
    <KeyboardAvoidingView style={s.keyboardLayout} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={s.header}>
      <Pressable onPress={onClose} style={s.iconButton}><Text style={s.backText}>{'\u2039'}</Text></Pressable>
      <View style={s.titleHit}><BrandMark style={s.eyebrow} /><Text style={s.title}>Note</Text></View>
      <Pressable onPress={() => Alert.alert(title || t.noText, t.deleteNoteQ, [
        { text: t.cancel, style: 'cancel' },
        { text: t.delete, style: 'destructive', onPress: async () => { goneRef.current = true; await deleteNote(note.id); onClose(); } },
      ])} style={s.iconButton}><Text style={s.toolTxt}>⌫</Text></Pressable>
    </View>

    <View style={s.toolbar}>
      <Pressable onPress={() => setColorOpen(open => !open)} style={[s.toolChip, s.colorChip]}>
        <View style={[s.colorDot, { backgroundColor: activeMarks.color || NOTE_DOC_COLORS[0] }]} />
        <Text style={s.toolChipTxt}>Color</Text>
      </Pressable>
      <Pressable onPress={() => toggleFormat('bold')} style={[s.toolChip, activeMarks.bold && s.toolChipOn]}><Text style={[s.toolChipTxt, activeMarks.bold && s.toolChipTxtOn]}>B</Text></Pressable>
      <Pressable onPress={() => toggleFormat('italic')} style={[s.toolChip, activeMarks.italic && s.toolChipOn]}><Text style={[s.toolChipTxt, s.toolItalic, activeMarks.italic && s.toolChipTxtOn]}>I</Text></Pressable>
      <Pressable onPress={() => toggleFormat('underline')} style={[s.toolChip, activeMarks.underline && s.toolChipOn]}><Text style={[s.toolChipTxt, s.toolUnderline, activeMarks.underline && s.toolChipTxtOn]}>U</Text></Pressable>
    </View>
    {colorOpen ? (
      <View style={s.colorPalette}>
        {NOTE_DOC_COLORS.map(color => (
          <Pressable
            key={color}
            onPress={() => applyColor(color)}
            style={[
              s.paletteSwatch,
              { backgroundColor: color },
              (activeMarks.color || NOTE_DOC_COLORS[0]) === color && s.paletteSwatchOn,
            ]}
          />
        ))}
      </View>
    ) : null}

    <ScrollView contentContainerStyle={s.editor} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
      <TextInput value={title} onChangeText={setTitle} placeholder={t.title} placeholderTextColor={p.muted} style={s.titleInput}/>
      {lines.map((line, index) => {
        const plain = linePlainText(line);
        const tip = line.runs[line.runs.length - 1];
        const editing = focusId === line.id;
        return (
        <View key={line.id} style={s.docRow}>
          <View style={s.lineWrap}>
            <View pointerEvents="none" style={s.lineFace}>
              {renderLineVisual(line, editing, index)}
              {editing && !hasSelection ? (
                <Text
                  style={[s.linePreview, s.caretProbe]}
                  onTextLayout={(e) => {
                    const laid = e.nativeEvent.lines;
                    const last = laid[laid.length - 1];
                    if (!last) return;
                    const cap = last.capHeight > 1 ? last.capHeight : 11;
                    const baseline = last.baseline > 0 ? last.baseline : last.y + (last.height || 24) * 0.78;
                    const h = Math.max(15, Math.round(cap + 3));
                    const next = {
                      lineId: line.id,
                      x: Math.round(last.x + last.width),
                      y: Math.round(8 + baseline - cap),
                      h,
                    };
                    setCaretBox(prev => (
                      prev && prev.lineId === next.lineId && prev.x === next.x && prev.y === next.y && prev.h === next.h
                        ? prev
                        : next
                    ));
                  }}
                >
                  {(() => {
                    const at = Math.max(0, Math.min(selection.start, plain.length));
                    if (at === 0) return '\u200b';
                    let offset = 0;
                    return line.runs.map((run, ri) => {
                      if (offset >= at) return null;
                      const take = Math.min(run.text.length, at - offset);
                      const text = run.text.slice(0, take);
                      offset += run.text.length;
                      if (!text) return null;
                      return (
                        <Text
                          key={`${line.id}-c-${ri}`}
                          style={[
                            run.bold && s.lineBold,
                            run.italic && s.lineItalic,
                            run.underline && s.lineUnderline,
                          ]}
                        >
                          {text}
                        </Text>
                      );
                    });
                  })()}
                </Text>
              ) : null}
            </View>
            <TextInput
              ref={node => { inputRefs.current[line.id] = node; }}
              value={plain}
              onFocus={() => {
                setFocusId(line.id);
                if (tip) {
                  setActiveMarks({
                    bold: Boolean(tip.bold),
                    italic: Boolean(tip.italic),
                    underline: Boolean(tip.underline),
                    color: tip.color,
                  });
                }
              }}
              onBlur={() => {
                if (focusId === line.id) setFocusId(null);
              }}
              onChangeText={text => onChangeLineText(line.id, index, text)}
              onSelectionChange={(e) => {
                setSelection({
                  start: e.nativeEvent.selection.start,
                  end: e.nativeEvent.selection.end,
                });
              }}
              onSubmitEditing={() => onSubmitLine(index)}
              blurOnSubmit={false}
              caretHidden
              multiline
              style={s.lineInputHidden}
            />
            {editing && !hasSelection && caretBox?.lineId === line.id ? (
              <View
                pointerEvents="none"
                style={[s.caret, { left: caretBox.x, top: caretBox.y, height: caretBox.h, opacity: caretOn ? 1 : 0 }]}
              />
            ) : null}
          </View>
        </View>
        );
      })}
      <Pressable style={s.editorRest} onPress={resumeWriting} />
    </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    safeContainer:{paddingHorizontal:16,paddingTop:androidStatusInset(12),paddingBottom:Platform.OS==='android'?4:0},
    container:{flex:1,backgroundColor:p.bg,paddingHorizontal:20,paddingTop:androidStatusInset(8)},
    keyboardLayout:{flex:1},
    header:{flexDirection:'row',alignItems:'center',marginBottom:14,gap:8},
    iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center',backgroundColor:p.surface},
    backText:{color:p.text,fontSize:30,lineHeight:31},
    toolTxt:{color:p.muted,fontSize:18},
    titleHit:{flex:1},
    eyebrow:{color:BRAND_EYEBROW,fontSize:9,fontWeight:'800',letterSpacing:2.4},
    title:{color:p.text,fontFamily:'PlayfairDisplay-Regular',fontSize:22,letterSpacing:1.2,textTransform:'uppercase'},
    searchWrap:{height:48,borderRadius:16,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:13,justifyContent:'center',marginBottom:12},
    search:{color:p.text,fontSize:14},
    listScroll:{flex:1},
    list:{paddingBottom:16,gap:4,flexGrow:1},
    card:{minHeight:78,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:16,paddingVertical:14,marginBottom:10},
    cardCopy:{gap:6,flex:1},
    cardTitleRow:{flexDirection:'row',alignItems:'center',gap:6},
    pinMark:{fontSize:10},
    cardTitle:{color:p.text,fontSize:16,fontWeight:'700',flexShrink:1},
    cardMeta:{flexDirection:'row',alignItems:'center',gap:8},
    cardTime:{color:p.muted,fontSize:12},
    cardPreview:{flex:1,color:p.muted,fontSize:12},
    emptyBox:{alignItems:'center',paddingTop:80,gap:8},
    empty:{color:p.text,fontSize:18,fontWeight:'700'},
    emptyHint:{color:p.muted,fontSize:12,textAlign:'center',maxWidth:260,lineHeight:18},
    fabBar:{alignSelf:'center',marginBottom:18},
    fabMain:{width:56,height:56,borderRadius:18,backgroundColor:p.accent,alignItems:'center',justifyContent:'center'},
    fabMainIcon:{color:'#fff',fontSize:22},
    backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'flex-end'},
    sheet:{backgroundColor:p.surface,borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:p.border,padding:20,paddingBottom:32},
    sheetTitle:{color:p.text,fontSize:18,fontWeight:'800',marginBottom:14},
    sheetRow:{minHeight:52,borderRadius:14,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
    sheetRowOn:{backgroundColor:p.accentSoft},
    sheetRowTxt:{color:p.text,fontSize:15,fontWeight:'700'},
    sheetCount:{color:p.muted,fontSize:13},
    sheetNew:{height:46,borderRadius:14,backgroundColor:p.accent,alignItems:'center',justifyContent:'center',marginTop:14},
    sheetNewTxt:{color:'#fff',fontWeight:'800'},
    modal:{backgroundColor:p.surface,borderWidth:1,borderColor:p.border,borderRadius:26,padding:22,margin:22},
    input:{color:p.text,backgroundColor:p.surfaceAlt,borderWidth:1,borderColor:p.border,borderRadius:15,paddingHorizontal:14,paddingVertical:13,marginTop:12},
    modalActions:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:18,marginTop:16},
    cancel:{color:p.muted,fontWeight:'700'},
    save:{backgroundColor:p.accent,borderRadius:13,paddingHorizontal:18,paddingVertical:11},
    saveTxt:{color:'#fff',fontWeight:'800'},
    toolbar:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},
    toolChip:{minWidth:36,height:34,borderRadius:10,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
    toolChipOn:{borderColor:p.accent,backgroundColor:p.accentSoft},
    toolChipTxt:{color:p.muted,fontSize:13,fontWeight:'800'},
    toolChipTxtOn:{color:p.accent},
    toolItalic:{fontStyle:'italic'},
    toolUnderline:{textDecorationLine:'underline'},
    colorChip:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10},
    colorDot:{width:14,height:14,borderRadius:7,borderWidth:1,borderColor:p.border},
    colorPalette:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:12,paddingHorizontal:2},
    paletteSwatch:{width:28,height:28,borderRadius:14,borderWidth:2,borderColor:'transparent'},
    paletteSwatchOn:{borderColor:p.accent},
    editor:{paddingBottom:40,flexGrow:1},
    editorRest:{flexGrow:1,minHeight:160},
    titleInput:{color:p.text,fontSize:24,fontWeight:'800',paddingVertical:8},
    docRow:{flexDirection:'row',alignItems:'flex-start',marginBottom:6},
    lineWrap:{flex:1,minHeight:40,justifyContent:'center',position:'relative'},
    lineFace:{position:'relative'},
    linePreview:{color:p.text,fontSize:16,lineHeight:24,paddingVertical:8,minHeight:40},
    caretProbe:{position:'absolute',left:0,right:0,top:0,opacity:0},
    caret:{position:'absolute',width:2,borderRadius:1,backgroundColor:p.text,zIndex:4},
    lineInputHidden:{...StyleSheet.absoluteFillObject,opacity:0,color:'transparent',fontSize:16,lineHeight:24,paddingVertical:8},
    lineBold:{fontWeight:'800'},
    lineItalic:{fontStyle:'italic'},
    lineUnderline:{textDecorationLine:'underline'},
    lineSelected:{backgroundColor:'rgba(78,163,255,0.35)'},
  });
}
