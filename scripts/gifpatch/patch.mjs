// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import fs from 'fs';
import { PNG } from 'pngjs';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const ROOT = 'C:/Users/user/Documents/GitHub/NEVULA/assets';
const GIF_PATH = `${ROOT}/nevula-intro.gif`;
const U_PATH = `${ROOT}/nevula-intro-u.png`;
const OUT_GIF = `${ROOT}/nevula-intro.gif`;
const OUT_END = `${ROOT}/nevula-intro-end.png`;

const WIDTH = 640;
const HEIGHT = 360;
const KEEP_MS = 3000;
const OX = 328;
const OY = 120;
const OW = 76;
const OH = 122;

function loadPng(path) {
  const png = PNG.sync.read(fs.readFileSync(path));
  return { data: png.data, width: png.width, height: png.height };
}

function letterBox(img) {
  let minX = img.width;
  let minY = img.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      if (lum > 22) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function sample(img, sx, sy) {
  const x = Math.min(img.width - 1, Math.max(0, Math.round(sx)));
  const y = Math.min(img.height - 1, Math.max(0, Math.round(sy)));
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function paintU(rgba, uImg, box) {
  const { minX, minY, w, h } = box;
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const di = ((OY + y) * WIDTH + (OX + x)) * 4;
      const u = sample(uImg, minX + (x / OW) * w, minY + (y / OH) * h);
      const lum = (u[0] + u[1] + u[2]) / 3;
      if (lum < 18) {
        const n = ((x * 13 + y * 7) % 5) - 2;
        const v = Math.max(0, Math.min(18, 4 + n));
        rgba[di] = v;
        rgba[di + 1] = v;
        rgba[di + 2] = Math.min(22, v + 1);
        rgba[di + 3] = 255;
        continue;
      }
      rgba[di] = u[0];
      rgba[di + 1] = u[1];
      rgba[di + 2] = u[2];
      rgba[di + 3] = 255;
    }
  }
}

function writePng(rgba, path) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data = Buffer.from(rgba);
  fs.writeFileSync(path, PNG.sync.write(png));
}

const buf = fs.readFileSync(GIF_PATH);
const gif = parseGIF(buf);
const frames = decompressFrames(gif, true);
const canvas = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
canvas.fill(0);

const uImg = loadPng(U_PATH);
const box = letterBox(uImg);
console.log('U letter box', box);

const encoder = GIFEncoder();
let elapsed = 0;
let kept = 0;
let lastRgba = null;

for (let f = 0; f < frames.length; f++) {
  const frame = frames[f];
  const { dims, patch, delay } = frame;
  const delayMs = Math.max(10, delay || 30);
  for (let y = 0; y < dims.height; y++) {
    for (let x = 0; x < dims.width; x++) {
      const si = (y * dims.width + x) * 4;
      if (patch[si + 3] === 0) continue;
      const di = ((dims.top + y) * WIDTH + (dims.left + x)) * 4;
      canvas[di] = patch[si];
      canvas[di + 1] = patch[si + 1];
      canvas[di + 2] = patch[si + 2];
      canvas[di + 3] = 255;
    }
  }

  const rgba = new Uint8ClampedArray(canvas);
  const avg =
    (rgba[10 * WIDTH * 4] + rgba[10 * WIDTH * 4 + 1] + rgba[10 * WIDTH * 4 + 2]) / 3;
  if (avg < 80) paintU(rgba, uImg, box);

  const palette = quantize(rgba, 256);
  const index = applyPalette(rgba, palette);
  encoder.writeFrame(index, WIDTH, HEIGHT, {
    palette,
    delay: delayMs,
    repeat: -1,
  });
  lastRgba = rgba;
  kept += 1;
  elapsed += delayMs;
  if (elapsed >= KEEP_MS) break;
}

encoder.finish();
fs.writeFileSync(OUT_GIF, Buffer.from(encoder.bytes()));
writePng(lastRgba, OUT_END);
console.log(`wrote ${kept} frames ${elapsed}ms bytes=${encoder.bytes().length}`);
