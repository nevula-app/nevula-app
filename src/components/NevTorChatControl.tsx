// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  chipForNevTorSnapshot,
  labelForNevTorSnapshot,
  type NevTorRoutingMode,
  type NevTorSnapshot,
  type PeerNevTorCapability,
} from '../lib/nevtor';
import { HomePalette, useDisplayTheme } from '../lib/displayTheme';
import OrbotOnionMark from './OrbotOnionMark';

type Props = {
  snapshot: NevTorSnapshot;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSetMode: (mode: NevTorRoutingMode) => void;
  onSetAllowDirectFallback?: (allow: boolean) => void;
  onRefresh: () => void;
  busy?: boolean;
  variant?: 'inline' | 'pill';
  peerStatus?: PeerNevTorCapability | null;
  chatRequireMine?: boolean;
  chatRequirePeer?: boolean;
};

export default function NevTorChatControl({
  snapshot,
  open,
  onOpen,
  onClose,
  onSetMode,
  onRefresh,
  busy,
  variant = 'inline',
  chatRequireMine = false,
  chatRequirePeer = false,
}: Props) {
  const { palette: p } = useDisplayTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const chip = chipForNevTorSnapshot(snapshot);
  const labels = labelForNevTorSnapshot(snapshot);
  const on = snapshot.routingMode !== 'OFF';
  const chatRequired = chatRequireMine || chatRequirePeer;
  const chipLabel = chip.label;

  return (
    <>
      <Pressable
        onPress={onOpen}
        style={[
          variant === 'inline' ? styles.inline : styles.pill,
          chip.tone === 'off' && styles.toneOff,
          chip.tone === 'on' && styles.toneOn,
          chip.tone === 'wait' && styles.toneWait,
          chip.tone === 'warn' && styles.toneWarn,
        ]}
        accessibilityRole="button"
        accessibilityLabel={labels.connectionLine}
      >
        <Text style={[styles.chipLabel, chip.tone === 'on' && styles.chipOn]}>{chipLabel}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.modalTitle}>NevTOR</Text>
              <OrbotOnionMark size={26} />
            </View>

            <View style={[styles.statusBlock, chip.tone === 'warn' && styles.statusWarn]}>
              <Text style={styles.statusLabel}>Connection</Text>
              <Text style={styles.connectionLine}>{labels.connectionLine}</Text>
              {snapshot.lastError && chip.tone === 'warn' ? (
                <Text style={styles.error}>{snapshot.lastError}</Text>
              ) : null}
            </View>

            {chatRequired ? (
              <View style={[styles.modeRow, styles.modeRowOn]}>
                <View style={styles.modeCopy}>
                  <Text style={styles.modeTitle}>Orbot required for this chat</Text>
                  <Text style={styles.modeDetail}>
                    {chatRequireMine && chatRequirePeer
                      ? 'Both confirmed. This cannot be turned off for this chat.'
                      : chatRequirePeer
                        ? 'They require Orbot. Waiting for your confirmation via the chat prompt, or already locked in.'
                        : 'You require Orbot. Waiting for them to confirm.'}
                  </Text>
                </View>
              </View>
            ) : null}

            <Pressable
              disabled={busy}
              onPress={() => onSetMode(on ? 'OFF' : 'TOR_PREFERRED')}
              style={[styles.modeRow, on && styles.modeRowOn]}
            >
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>{on ? 'NevTOR On' : 'NevTOR Off'}</Text>
                <Text style={styles.modeDetail}>{on ? 'Uses Tor when Orbot is ready' : 'Normal connection'}</Text>
              </View>
              <View style={[styles.toggle, on && styles.toggleOn]}>
                <View style={[styles.knob, on && styles.knobOn]} />
              </View>
            </Pressable>

            {on ? (
              <Pressable disabled={busy} onPress={onRefresh} style={styles.secondary}>
                <Text style={styles.secondaryText}>{busy ? '…' : 'Recheck'}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    inline: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      maxWidth: 110,
    },
    pill: {
      minWidth: 72,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Same blue as OrbotOnionMark when Tor is live
    toneOn: {
      borderColor: '#4ea3ff',
      backgroundColor: 'rgba(78,163,255,0.22)',
      shadowColor: '#4ea3ff',
      shadowOpacity: 0.55,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    toneOff: {
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    toneWait: { borderColor: '#3d4a1f', backgroundColor: '#12140a' },
    toneWarn: { borderColor: '#6a4032', backgroundColor: '#1a100c' },
    chipLabel: { color: p.muted, fontSize: 10, fontWeight: '800' },
    chipOn: { color: '#4ea3ff' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.76)',
      justifyContent: 'center',
      padding: 22,
    },
    card: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 26,
      padding: 22,
      maxHeight: '90%',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 12,
    },
    modalTitle: { color: p.text, fontSize: 22, fontWeight: '800', flex: 1 },
    statusBlock: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 16,
      padding: 12,
      marginBottom: 10,
      backgroundColor: p.surfaceAlt,
    },
    statusWarn: { borderColor: '#6a4032' },
    statusLabel: { color: p.accent, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
    connectionLine: { color: '#7dba9a', fontSize: 13, fontWeight: '700', marginTop: 4 },
    error: { color: '#c9887a', fontSize: 11, marginTop: 6, lineHeight: 15 },
    modeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 14,
      padding: 11,
      marginBottom: 7,
      backgroundColor: p.surfaceAlt,
    },
    modeRowOn: { borderColor: p.accent, backgroundColor: p.accentSoft },
    modeCopy: { flex: 1, paddingRight: 12 },
    modeTitle: { color: p.text, fontSize: 12, fontWeight: '800' },
    modeDetail: { color: p.muted, fontSize: 10, marginTop: 3, lineHeight: 14 },
    toggle: { width: 40, height: 23, borderRadius: 13, backgroundColor: p.border, padding: 3 },
    toggleOn: { backgroundColor: p.accent },
    knob: { width: 17, height: 17, borderRadius: 9, backgroundColor: p.muted },
    knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
    secondary: { marginTop: 6, paddingVertical: 12, alignItems: 'center' },
    secondaryText: { color: p.accent, fontSize: 13, fontWeight: '600' },
    close: { marginTop: 2, paddingVertical: 10, alignItems: 'center' },
    closeText: { color: p.muted, fontSize: 13 },
  });
}
