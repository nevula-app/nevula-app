// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: null,
  documentDirectory: null,
}));

vi.mock('react-native-quick-base64', () => ({
  fromByteArray: (value: Uint8Array) => Buffer.from(value).toString('base64'),
  toByteArray: (value: string) => new Uint8Array(Buffer.from(value, 'base64')),
}));

import {
  stripJpegMetadata,
  stripMediaBytes,
  stripWebpMetadata,
  UnsupportedMediaError,
} from './stripMediaMeta';

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function jpegSegment(marker: number, payload: string | Uint8Array) {
  const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const len = body.length + 2;
  const out = new Uint8Array(2 + 2 + body.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = (len >>> 8) & 0xff;
  out[3] = len & 0xff;
  out.set(body, 4);
  return out;
}

function writeU32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

describe('media metadata strip', () => {
  it('drops JPEG EXIF and FlashPix APP2, keeps ICC', () => {
    const icc = jpegSegment(0xe2, 'ICC_PROFILE\0ab');
    const jpeg = concat([
      new Uint8Array([0xff, 0xd8]),
      jpegSegment(0xe1, 'Exif\0\0GPS'),
      jpegSegment(0xe2, 'FPXR\0meta'),
      icc,
      new Uint8Array([0xff, 0xd9]),
    ]);
    const stripped = stripJpegMetadata(jpeg);
    expect(stripped.changed).toBe(true);
    const text = new TextDecoder().decode(stripped.bytes);
    expect(text).not.toContain('Exif');
    expect(text).not.toContain('FPXR');
    expect(text).toContain('ICC_PROFILE');
  });

  it('drops WebP EXIF/XMP chunks and clears VP8X flags', () => {
    const vp8x = new Uint8Array(18);
    vp8x.set(new TextEncoder().encode('VP8X'), 0);
    writeU32LE(vp8x, 4, 10);
    vp8x[8] = 0x18;
    const exif = new Uint8Array(12);
    exif.set(new TextEncoder().encode('EXIF'), 0);
    writeU32LE(exif, 4, 4);
    exif.set(new TextEncoder().encode('GPS1'), 8);
    const riff = new Uint8Array(12 + vp8x.length + exif.length);
    riff.set(new TextEncoder().encode('RIFF'), 0);
    writeU32LE(riff, 4, riff.length - 8);
    riff.set(new TextEncoder().encode('WEBP'), 8);
    riff.set(vp8x, 12);
    riff.set(exif, 12 + vp8x.length);
    const stripped = stripWebpMetadata(riff);
    expect(stripped.changed).toBe(true);
    const text = new TextDecoder().decode(stripped.bytes);
    expect(text).not.toContain('EXIF');
    expect(text).not.toContain('GPS1');
    expect(stripped.bytes[20]).toBe(0);
  });

  it('refuses photo bytes that are not JPEG, PNG or WebP', () => {
    expect(() => stripMediaBytes(new Uint8Array([0, 1, 2, 3, 4, 5]), 'photo', 'heic')).toThrow(UnsupportedMediaError);
  });
});
