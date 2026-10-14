// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

/**
 * Lightweight document model for Notes (plain JSON in note.body).
 * Prefix: NVLDOC.2. (runs) — migrates NVLDOC.1. (line-level marks).
 */

export type NoteDocMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

export type NoteDocRun = NoteDocMarks & { text: string };

export type NoteDocLine = {
  id: string;
  runs: NoteDocRun[];
  list?: 'none' | 'number' | 'check';
  done?: boolean;
};

/** @deprecated shape from NVLDOC.1. */
type LegacyLine = {
  id?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  list?: 'none' | 'number' | 'check';
  done?: boolean;
  runs?: NoteDocRun[];
};

export const NOTE_DOC_PREFIX = 'NVLDOC.2.';
export const NOTE_DOC_PREFIX_V1 = 'NVLDOC.1.';

export const NOTE_DOC_COLORS = [
  '#e8eef7', // light / default
  '#111111', // black
  '#4ea3ff', // blue
  '#c9a227', // yellow
  '#7dba9a', // green
  '#e24b4b', // red
  '#9b8fd4', // purple
  '#d78518', // orange
] as const;

function newLineId() {
  return globalThis.crypto.randomUUID();
}

export function emptyMarks(): NoteDocMarks {
  return { bold: false, italic: false, underline: false, color: undefined };
}

export function marksEqual(a: NoteDocMarks, b: NoteDocMarks): boolean {
  return Boolean(a.bold) === Boolean(b.bold)
    && Boolean(a.italic) === Boolean(b.italic)
    && Boolean(a.underline) === Boolean(b.underline)
    && (a.color || undefined) === (b.color || undefined);
}

export function emptyDocLine(partial?: Partial<NoteDocLine> & NoteDocMarks & { text?: string }): NoteDocLine {
  const text = partial?.text ?? '';
  const marks: NoteDocMarks = {
    bold: partial?.bold,
    italic: partial?.italic,
    underline: partial?.underline,
    color: partial?.color,
  };
  const runs = partial?.runs?.length
    ? partial.runs
    : text
      ? [{ text, ...marks }]
      : [{ text: '', ...marks }];
  return {
    id: partial?.id ?? newLineId(),
    runs,
    list: partial?.list ?? 'none',
    done: partial?.done,
  };
}

export function linePlainText(line: NoteDocLine): string {
  return line.runs.map(r => r.text).join('');
}

export function normalizeRuns(runs: NoteDocRun[]): NoteDocRun[] {
  const out: NoteDocRun[] = [];
  for (const run of runs) {
    if (!run.text && out.length) continue;
    const last = out[out.length - 1];
    if (last && marksEqual(last, run)) {
      last.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  if (!out.length) out.push({ text: '' });
  return out;
}

/** Apply marks to [start, end) in plain text; Word-style selection format. */
export function applyMarksToRange(
  line: NoteDocLine,
  start: number,
  end: number,
  patch: Partial<NoteDocMarks>,
): NoteDocLine {
  const plain = linePlainText(line);
  const a = Math.max(0, Math.min(start, end, plain.length));
  const b = Math.max(0, Math.min(Math.max(start, end), plain.length));
  if (a === b) return line;
  const next: NoteDocRun[] = [];
  let cursor = 0;
  for (const run of line.runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    if (runEnd <= a || runStart >= b) {
      next.push({ ...run });
      continue;
    }
    if (runStart < a) {
      next.push({ ...run, text: run.text.slice(0, a - runStart) });
    }
    const sliceStart = Math.max(0, a - runStart);
    const sliceEnd = Math.min(run.text.length, b - runStart);
    next.push({
      ...run,
      text: run.text.slice(sliceStart, sliceEnd),
      bold: patch.bold !== undefined ? patch.bold : run.bold,
      italic: patch.italic !== undefined ? patch.italic : run.italic,
      underline: patch.underline !== undefined ? patch.underline : run.underline,
      color: patch.color !== undefined ? (patch.color || undefined) : run.color,
    });
    if (runEnd > b) {
      next.push({ ...run, text: run.text.slice(b - runStart) });
    }
  }
  return { ...line, runs: normalizeRuns(next) };
}

/**
 * Rebuild runs after TextInput edit.
 * Appends / end-deletes preserve style; mid-edits keep left runs and stamp activeMarks on the rest.
 */
export function runsAfterEdit(
  line: NoteDocLine,
  nextPlain: string,
  active: NoteDocMarks,
): NoteDocRun[] {
  const prevPlain = linePlainText(line);
  if (nextPlain === prevPlain) return line.runs;

  // Append at end
  if (nextPlain.startsWith(prevPlain) && nextPlain.length > prevPlain.length) {
    const added = nextPlain.slice(prevPlain.length);
    const runs = line.runs.map(r => ({ ...r }));
    const last = runs[runs.length - 1];
    if (last && marksEqual(last, active)) {
      last.text += added;
      return normalizeRuns(runs);
    }
    return normalizeRuns([...runs, { text: added, ...active }]);
  }

  // Delete from end
  if (prevPlain.startsWith(nextPlain) && nextPlain.length < prevPlain.length) {
    let remaining = nextPlain.length;
    const runs: NoteDocRun[] = [];
    for (const run of line.runs) {
      if (remaining <= 0) break;
      if (run.text.length <= remaining) {
        runs.push({ ...run });
        remaining -= run.text.length;
      } else {
        runs.push({ ...run, text: run.text.slice(0, remaining) });
        remaining = 0;
      }
    }
    return normalizeRuns(runs.length ? runs : [{ text: '', ...active }]);
  }

  // Common prefix keep, rest = activeMarks
  let common = 0;
  const max = Math.min(prevPlain.length, nextPlain.length);
  while (common < max && prevPlain[common] === nextPlain[common]) common += 1;
  let remaining = common;
  const kept: NoteDocRun[] = [];
  for (const run of line.runs) {
    if (remaining <= 0) break;
    if (run.text.length <= remaining) {
      kept.push({ ...run });
      remaining -= run.text.length;
    } else {
      kept.push({ ...run, text: run.text.slice(0, remaining) });
      remaining = 0;
    }
  }
  const rest = nextPlain.slice(common);
  if (rest) kept.push({ text: rest, ...active });
  return normalizeRuns(kept.length ? kept : [{ text: '', ...active }]);
}

function migrateLegacy(line: LegacyLine): NoteDocLine {
  if (Array.isArray(line.runs) && line.runs.length) {
    return {
      id: typeof line.id === 'string' ? line.id : newLineId(),
      runs: normalizeRuns(line.runs.map(r => ({
        text: typeof r.text === 'string' ? r.text : '',
        bold: Boolean(r.bold),
        italic: Boolean(r.italic),
        underline: Boolean(r.underline),
        color: typeof r.color === 'string' ? r.color : undefined,
      }))),
      list: line.list === 'number' || line.list === 'check' ? line.list : 'none',
      done: Boolean(line.done),
    };
  }
  return emptyDocLine({
    id: typeof line.id === 'string' ? line.id : undefined,
    text: typeof line.text === 'string' ? line.text : '',
    bold: Boolean(line.bold),
    italic: Boolean(line.italic),
    underline: Boolean(line.underline),
    color: typeof line.color === 'string' ? line.color : undefined,
    list: line.list === 'number' || line.list === 'check' ? line.list : 'none',
    done: Boolean(line.done),
  });
}

export function parseNoteDoc(body: string): NoteDocLine[] {
  if (typeof body === 'string' && (body.startsWith(NOTE_DOC_PREFIX) || body.startsWith(NOTE_DOC_PREFIX_V1))) {
    try {
      const raw = body.startsWith(NOTE_DOC_PREFIX)
        ? body.slice(NOTE_DOC_PREFIX.length)
        : body.slice(NOTE_DOC_PREFIX_V1.length);
      const parsed = JSON.parse(raw) as LegacyLine[];
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(migrateLegacy);
      }
    } catch {
      // fall through
    }
  }
  if (!body) return [emptyDocLine()];
  return body.split('\n').map(text => emptyDocLine({ text }));
}

export function serializeNoteDoc(lines: NoteDocLine[]): string {
  return `${NOTE_DOC_PREFIX}${JSON.stringify(lines)}`;
}

export function docPreview(lines: NoteDocLine[]): string {
  return lines
    .map(line => linePlainText(line).trim())
    .filter(Boolean)
    .join(' · ');
}

export function numberLabel(lines: NoteDocLine[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i += 1) {
    if (lines[i]?.list === 'number') n += 1;
  }
  return Math.max(1, n);
}
