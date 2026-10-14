// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatVoiceClock } from '../lib/voiceMessages';
import type { VoicePayload } from '../lib/voiceMessages';

type Props = {
  payload: VoicePayload;
  mine: boolean;
  active: boolean;
  failed?: boolean;
};

export default function VoiceMessageBubble({ payload, mine, active, failed }: Props) {
  return (
    <View style={s.row}>
      <View style={[s.play, mine ? s.playMine : s.playTheirs]}>
        <Text style={s.playMark}>{active ? '■' : '▶'}</Text>
      </View>
      <View style={s.meta}>
        <Text style={mine ? s.sentText : s.receivedText}>{failed ? 'Could not play' : formatVoiceClock(payload.durationMs)}</Text>
        <Text style={s.mode}>{(payload.mode ?? 'robot').toUpperCase()}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 148 },
  play: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  playMine: { backgroundColor: 'rgba(255,255,255,.18)' },
  playTheirs: { backgroundColor: '#1768e8' },
  playMark: { color: 'white', fontSize: 13, fontWeight: '800' },
  meta: { flex: 1 },
  sentText: { color: 'white', fontSize: 13, fontWeight: '700' },
  receivedText: { color: '#e8edf4', fontSize: 13, fontWeight: '700' },
  mode: { color: '#94a3b8', fontSize: 8, marginTop: 3, fontWeight: '800', letterSpacing: 0.6 },
});
