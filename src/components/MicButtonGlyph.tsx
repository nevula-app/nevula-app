// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { StyleSheet, View } from 'react-native';

type Props = { recording?: boolean; color?: string };

/** Slim microphone mark — fine strokes, small footprint for the chat composer. */
export default function MicButtonGlyph({ recording = false, color = '#8ec0ff' }: Props) {
  return (
    <View style={s.wrap}>
      {recording ? (
        <View style={s.liveDot} />
      ) : (
        <>
          <View style={[s.capsule, { borderColor: color }]} />
          <View style={[s.yoke, { borderColor: color }]} />
          <View style={[s.stem, { backgroundColor: color }]} />
          <View style={[s.base, { backgroundColor: color }]} />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: 14, height: 18, alignItems: 'center', justifyContent: 'flex-end' },
  capsule: {
    width: 7,
    height: 10,
    borderRadius: 3.5,
    borderWidth: 1.25,
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
  },
  yoke: {
    width: 12,
    height: 7,
    borderWidth: 1.25,
    borderTopWidth: 0,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
    position: 'absolute',
    top: 6,
  },
  stem: { width: 1.25, height: 3, borderRadius: 0.6 },
  base: { width: 6, height: 1.25, borderRadius: 0.6, marginTop: 0.5 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff4d4d', alignSelf: 'center', marginBottom: 3 },
});
