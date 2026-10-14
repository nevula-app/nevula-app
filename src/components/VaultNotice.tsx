// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HomePalette, useDisplayTheme } from '../lib/displayTheme';

export default function VaultNotice() {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={s.box}>
      <Text style={s.icon}>▣</Text>
      <View style={s.copy}>
        <Text style={s.title}>What happens in NEVULA stays in NEVULA</Text>
        <Text style={s.text}>Identifying metadata — including GPS location, device name and capture date — is removed. Nothing is copied to your regular phone gallery.</Text>
      </View>
    </View>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    box: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      paddingVertical: 13,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
    },
    icon: { color: p.accent, fontSize: 15, marginRight: 12 },
    copy: { flex: 1 },
    title: { color: p.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.2, lineHeight: 13 },
    text: { color: p.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  });
}
