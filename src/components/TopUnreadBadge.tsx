// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { unreadCountLabel, unreadLabel } from '../lib/inAppUnread';

type Props = {
  count: number;
  onPress?: () => void;
};

/**
 * Top-bar unread: filigree envelope chip — same colors/frame as before.
 * Envelope slightly larger and nudged up so the digit sits in the flap.
 * Digit size stays 13.
 */
export default function TopUnreadBadge({ count, onPress }: Props) {
  if (count <= 0) return null;
  const label = unreadCountLabel(count);
  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityLabel={unreadLabel(count)}
      accessibilityRole="button"
      hitSlop={6}
    >
      <Text style={styles.envelope} pointerEvents="none">✉</Text>
      <Text style={styles.digit}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 40,
    height: 32,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(78,163,255,0.2)',
    borderWidth: 1,
    borderColor: '#4ea3ff',
    overflow: 'visible',
  },
  envelope: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -3,
    textAlign: 'center',
    color: 'rgba(78,163,255,0.55)',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  digit: {
    color: '#4ea3ff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    zIndex: 1,
    marginTop: 1,
  },
});
