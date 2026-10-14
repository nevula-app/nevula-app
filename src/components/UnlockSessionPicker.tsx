// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { HomePalette, useDisplayTheme } from '../lib/displayTheme';
import {
  UNLOCK_SESSION_OPTIONS,
  type UnlockSessionOptionId,
} from '../lib/unlockSession';

type Props = {
  visible: boolean;
  onChoose: (optionId: UnlockSessionOptionId) => void;
};

export default function UnlockSessionPicker({ visible, onChoose }: Props) {
  const { palette: p } = useDisplayTheme();
  const styles = useMemo(() => makeStyles(p), [p]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Stay unlocked?</Text>
          <Text style={styles.copy}>
            How long may NEVULA stay open without asking for your calculator PIN again — including when
            you leave the app and come back? After this time you must enter the PIN again. Maximum is
            3 hours.
          </Text>
          {UNLOCK_SESSION_OPTIONS.map(option => (
            <Pressable
              key={option.id}
              onPress={() => onChoose(option.id)}
              style={styles.option}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.82)',
      justifyContent: 'center',
      padding: 22,
    },
    card: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 24,
      padding: 22,
    },
    title: { color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 10 },
    copy: { color: p.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    option: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceAlt,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 8,
      alignItems: 'center',
    },
    optionText: { color: p.text, fontSize: 15, fontWeight: '700' },
  });
}
