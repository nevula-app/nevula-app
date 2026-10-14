// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import * as FileSystem from 'expo-file-system/legacy';
import { fromByteArray, toByteArray } from 'react-native-quick-base64';

export type MediaKind = 'photo' | 'video';

type StripResult = {
  bytes: Uint8Array;
  changed: boolean;
};

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function byteAt(bytes: Uint8Array, offset: number) {
  return bytes[offset] ?? 0;
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((byteAt(bytes, offset) << 24) | (byteAt(bytes, offset + 1) << 16) | (byteAt(bytes, offset + 2) << 8) | byteAt(bytes, offset + 3)) >>> 0;
}

function readType(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(byteAt(bytes, offset), byteAt(bytes, offset + 1), byteAt(bytes, offset + 2), byteAt(bytes, offset + 3));
}

function writeU32(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function packBox(type: string, payload: Uint8Array) {
  const size = 8 + payload.length;
  if (size > 0xffffffff) return null;
  const out = new Uint8Array(size);
  writeU32(out, 0, size);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(payload, 8);
  return out;
}

function isIccProfileSegment(input: Uint8Array, start: number, end: number) {
  const tag = 'ICC_PROFILE\0';
  if (start + tag.length > end) return false;
  for (let i = 0; i < tag.length; i += 1) {
    if (byteAt(input, start + i) !== tag.charCodeAt(i)) return false;
  }
  return true;
}

/** Drop EXIF/XMP/IPTC/comments/FlashPix. Keep JFIF (APP0) and ICC (APP2) so the image still looks right. */
export function stripJpegMetadata(input: Uint8Array): StripResult {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return { bytes: input, changed: false };
  const out = new Uint8Array(input.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  let o = 2;
  let i = 2;
  let dropped = false;
  while (i < input.length) {
    if (input[i] !== 0xff) {
      out.set(input.subarray(i), o);
      o += input.length - i;
      break;
    }
    let j = i;
    while (j < input.length && input[j] === 0xff) j += 1;
    if (j >= input.length) break;
    const marker = byteAt(input, j);
    if (marker === 0xd9) {
      out[o++] = 0xff;
      out[o++] = 0xd9;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out[o++] = 0xff;
      out[o++] = marker;
      i = j + 1;
      continue;
    }
    if (j + 2 >= input.length) break;
    const len = (byteAt(input, j + 1) << 8) | byteAt(input, j + 2);
    const segmentEnd = j + 1 + len;
    if (len < 2 || segmentEnd > input.length) {
      out.set(input.subarray(i), o);
      o += input.length - i;
      break;
    }
    if (marker === 0xda) {
      out[o++] = 0xff;
      out.set(input.subarray(j), o);
      o += input.length - j;
      break;
    }
    const keepIcc = marker === 0xe2 && isIccProfileSegment(input, j + 3, segmentEnd);
    const drop = marker === 0xfe || marker === 0xe1 || (marker === 0xe2 && !keepIcc) || (marker >= 0xe3 && marker <= 0xef);
    if (drop) dropped = true;
    else {
      out[o++] = 0xff;
      out.set(input.subarray(j, segmentEnd), o);
      o += segmentEnd - j;
    }
    i = segmentEnd;
  }
  return dropped ? { bytes: out.subarray(0, o), changed: true } : { bytes: input, changed: false };
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf']);

export function stripPngMetadata(input: Uint8Array): StripResult {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (input.length < 16 || sig.some((value, index) => input[index] !== value)) return { bytes: input, changed: false };
  const parts: Uint8Array[] = [input.subarray(0, 8)];
  let i = 8;
  let dropped = false;
  while (i + 12 <= input.length) {
    const length = readU32(input, i);
    const type = readType(input, i + 4);
    const chunkEnd = i + 12 + length;
    if (chunkEnd > input.length) return { bytes: input, changed: false };
    if (PNG_DROP.has(type)) dropped = true;
    else parts.push(input.subarray(i, chunkEnd));
    i = chunkEnd;
    if (type === 'IEND') break;
  }
  if (i < input.length) parts.push(input.subarray(i));
  return dropped ? { bytes: concat(parts), changed: true } : { bytes: input, changed: false };
}

const MP4_CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex', 'moof', 'traf']);
const MP4_DROP = new Set(['udta', 'meta']);

function zeroBoxTimestamps(box: Uint8Array): StripResult {
  if (box.length < 20) return { bytes: box, changed: false };
  const version = byteAt(box, 8);
  const out = new Uint8Array(box);
  let changed = false;
  const end = version === 1 ? 28 : 20;
  if (out.length < end) return { bytes: box, changed: false };
  for (let i = 12; i < end; i += 1) {
    if (out[i] !== 0) {
      out[i] = 0;
      changed = true;
    }
  }
  return changed ? { bytes: out, changed: true } : { bytes: box, changed: false };
}

function rewriteMp4Boxes(input: Uint8Array, start: number, end: number): { bytes: Uint8Array; changed: boolean } | null {
  const parts: Uint8Array[] = [];
  let i = start;
  let changed = false;
  while (i + 8 <= end) {
    const size32 = readU32(input, i);
    const type = readType(input, i + 4);
    let headerLen = 8;
    let boxEnd: number;
    if (size32 === 1) {
      if (i + 16 > end) return null;
      headerLen = 16;
      const high = readU32(input, i + 8);
      const low = readU32(input, i + 12);
      if (high !== 0) return null;
      boxEnd = i + low;
    } else if (size32 === 0) {
      boxEnd = end;
    } else {
      boxEnd = i + size32;
    }
    if (boxEnd > end || boxEnd < i + headerLen) return null;

    if (MP4_DROP.has(type)) {
      changed = true;
      i = boxEnd;
      continue;
    }

    if (type === 'mvhd' || type === 'tkhd' || type === 'mdhd') {
      const sanitized = zeroBoxTimestamps(input.subarray(i, boxEnd));
      parts.push(sanitized.bytes);
      if (sanitized.changed) changed = true;
      i = boxEnd;
      continue;
    }

    if (MP4_CONTAINERS.has(type) && headerLen === 8) {
      const inner = rewriteMp4Boxes(input, i + headerLen, boxEnd);
      if (!inner) return null;
      if (inner.changed) {
        const packed = packBox(type, inner.bytes);
        if (!packed) return null;
        parts.push(packed);
        changed = true;
      } else {
        parts.push(input.subarray(i, boxEnd));
      }
    } else {
      parts.push(input.subarray(i, boxEnd));
    }
    i = boxEnd;
  }
  if (i < end) parts.push(input.subarray(i, end));
  return { bytes: concat(parts), changed };
}

export function stripMp4Metadata(input: Uint8Array): StripResult {
  if (input.length < 12) return { bytes: input, changed: false };
  const brand = readType(input, 4);
  if (brand !== 'ftyp' && brand !== 'wide' && brand !== 'mdat' && brand !== 'moov') {
    return { bytes: input, changed: false };
  }
  const rewritten = rewriteMp4Boxes(input, 0, input.length);
  if (!rewritten || !rewritten.changed) return { bytes: input, changed: false };
  return rewritten;
}

function readU32LE(bytes: Uint8Array, offset: number) {
  return (byteAt(bytes, offset) | (byteAt(bytes, offset + 1) << 8) | (byteAt(bytes, offset + 2) << 16) | (byteAt(bytes, offset + 3) << 24)) >>> 0;
}

function writeU32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

const WEBP_DROP = new Set(['EXIF', 'XMP ']);

function isWebp(input: Uint8Array) {
  return input.length >= 12 && readType(input, 0) === 'RIFF' && readType(input, 8) === 'WEBP';
}

export function stripWebpMetadata(input: Uint8Array): StripResult {
  if (!isWebp(input)) return { bytes: input, changed: false };
  const parts: Uint8Array[] = [input.subarray(0, 12)];
  let i = 12;
  let changed = false;
  while (i + 8 <= input.length) {
    const type = readType(input, i);
    const size = readU32LE(input, i + 4);
    const payloadEnd = i + 8 + size;
    const chunkEnd = payloadEnd + (size % 2);
    if (chunkEnd > input.length) return { bytes: input, changed: false };
    if (WEBP_DROP.has(type)) {
      changed = true;
      i = chunkEnd;
      continue;
    }
    if (type === 'VP8X' && size >= 1) {
      const chunk = new Uint8Array(input.subarray(i, chunkEnd));
      const flags = byteAt(chunk, 8);
      const next = flags & ~0x18;
      if (next !== flags) {
        chunk[8] = next;
        changed = true;
      }
      parts.push(chunk);
    } else {
      parts.push(input.subarray(i, chunkEnd));
    }
    i = chunkEnd;
  }
  if (!changed) return { bytes: input, changed: false };
  const out = concat(parts);
  writeU32LE(out, 4, Math.max(0, out.length - 8));
  return { bytes: out, changed: true };
}

export class UnsupportedMediaError extends Error {
  constructor(kind: MediaKind) {
    super(kind === 'photo'
      ? 'This photo format cannot be stored without stripping location and camera data.'
      : 'This video format cannot be stored without stripping metadata.');
    this.name = 'UnsupportedMediaError';
  }
}

function isJpeg(input: Uint8Array) {
  return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8;
}

function isPng(input: Uint8Array) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  return input.length >= 8 && sig.every((value, index) => input[index] === value);
}

function isMp4Like(input: Uint8Array) {
  if (input.length < 12) return false;
  const brand = readType(input, 4);
  return brand === 'ftyp' || brand === 'wide' || brand === 'mdat' || brand === 'moov';
}

export function stripMediaBytes(input: Uint8Array, kind: MediaKind, extension: string): StripResult {
  const ext = extension.toLowerCase();
  if (kind === 'photo' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') {
    if (isJpeg(input)) return stripJpegMetadata(input);
    if (isPng(input)) return stripPngMetadata(input);
    if (isWebp(input)) return stripWebpMetadata(input);
    throw new UnsupportedMediaError('photo');
  }
  if (isMp4Like(input)) return stripMp4Metadata(input);
  throw new UnsupportedMediaError(kind);
}

export async function stripMediaFile(uri: string, kind: MediaKind, extension: string) {
  const packed = toByteArray(await FileSystem.readAsStringAsync(uri, { encoding: 'base64' }));
  const stripped = stripMediaBytes(packed, kind, extension);
  if (!stripped.changed) return uri;
  const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}nevula-stripped-${globalThis.crypto.randomUUID()}.${extension}`;
  await FileSystem.writeAsStringAsync(dest, fromByteArray(stripped.bytes), { encoding: 'base64' });
  return dest;
}
