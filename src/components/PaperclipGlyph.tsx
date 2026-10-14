// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { StyleSheet, View } from 'react-native';

/** Minimal paperclip for attach (gallery / files / camera). */
export default function PaperclipGlyph({ color = '#8ec0ff' }: { color?: string }) {
  return (
    <View style={s.wrap}>
      <View style={[s.loop, { borderColor: color }]} />
      <View style={[s.shaft, { borderColor: color }]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: 16,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-28deg' }],
  },
  loop: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.4,
    position: 'absolute',
    top: 0,
  },
  shaft: {
    width: 8,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.4,
    borderTopWidth: 0,
    position: 'absolute',
    top: 5,
  },
});
