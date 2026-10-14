// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNevTorSnapshot } from '../lib/nevtor';

type Props = {
  size?: number;
  compact?: boolean;
  showHint?: boolean;
  onPress?: () => void;
};

/**
 * Tor-style onion: blue only when NevTOR is on AND Orbot probe is live.
 */
export default function OrbotOnionMark({
  size = 24,
  compact = false,
  showHint = false,
  onPress,
}: Props) {
  const snap = useNevTorSnapshot();
  const live =
    snap.routingMode !== 'OFF' && snap.torReady && snap.connection === 'connected';
  const stroke = live ? '#4ea3ff' : '#6b7280';
  const fill = live ? 'rgba(78,163,255,0.22)' : 'rgba(107,114,128,0.18)';
  const w = size;
  const h = size * 1.15;

  const body = (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityRole="image"
      accessibilityLabel={live ? 'Orbot connected' : 'Orbot not connected'}
    >
      <View style={[styles.onionBox, { width: w, height: h }, live && styles.glow]}>
        {/* stem */}
        <View style={[styles.stem, { backgroundColor: stroke, left: w * 0.42, width: w * 0.16, height: h * 0.14 }]} />
        {/* outer bulb */}
        <View
          style={[
            styles.bulb,
            {
              top: h * 0.12,
              width: w,
              height: h * 0.88,
              borderRadius: w * 0.5,
              borderColor: stroke,
              backgroundColor: fill,
              shadowColor: live ? '#4ea3ff' : 'transparent',
            },
            live && styles.bulbLive,
          ]}
        />
        {/* middle layer */}
        <View
          style={[
            styles.layer,
            {
              top: h * 0.28,
              width: w * 0.7,
              height: h * 0.62,
              borderRadius: w * 0.35,
              borderColor: stroke,
              left: w * 0.15,
            },
          ]}
        />
        {/* inner layer */}
        <View
          style={[
            styles.layer,
            {
              top: h * 0.42,
              width: w * 0.42,
              height: h * 0.4,
              borderRadius: w * 0.21,
              borderColor: stroke,
              left: w * 0.29,
              opacity: 0.85,
            },
          ]}
        />
      </View>
      {showHint && !live ? <Text style={styles.hint}>Turn Orbot on</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  wrapCompact: { minWidth: 28 },
  onionBox: { position: 'relative' },
  glow: {},
  stem: {
    position: 'absolute',
    top: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    zIndex: 2,
  },
  bulb: {
    position: 'absolute',
    left: 0,
    borderWidth: 2,
  },
  bulbLive: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 8,
  },
  layer: {
    position: 'absolute',
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  hint: {
    marginTop: 4,
    color: '#9aa3b2',
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
  },
});
