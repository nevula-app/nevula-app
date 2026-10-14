// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PinKeypad from '../components/PinKeypad';
import { ACCOUNT_DELETION_URL, createDeletionCode } from '../lib/accountDeletion';
import { HomePalette, useDisplayTheme } from '../lib/displayTheme';
import { ensureNevulaIdentity } from '../lib/identity';

type Props = {
  onBack: () => void;
  onVerifyUnlockCode: (code: string) => boolean;
  onPanicWipe: () => Promise<void>;
};

export default function AccountDeletionScreen({ onBack, onVerifyUnlockCode, onPanicWipe }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [code, setCode] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [pinError, setPinError] = useState('');
  const swipeBack = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-28, 28])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) < 56 && Math.abs(event.velocityX) < 550) return;
          onBack();
        }),
    [onBack],
  );

  const generate = async () => {
    try {
      setBusy(true);
      const identity = await ensureNevulaIdentity();
      setCode(await createDeletionCode(identity));
    } catch (error: any) {
      Alert.alert('Could not create code', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const key = (value: string) => {
    setPinError('');
    if (value === 'C') return setPin('');
    if (value === '⌫') return setPin((current) => current.slice(0, -1));
    if (pin.length < 24) setPin((current) => `${current}${value}`);
  };

  const openKill = () => {
    setPin('');
    setPinError('');
    setKillOpen(true);
  };

  const confirmKill = () => {
    if (!pin) {
      setPinError('Enter your calculator access code.');
      return;
    }
    if (!onVerifyUnlockCode(pin)) {
      setPinError('Incorrect calculator access code.');
      setPin('');
      return;
    }
    Alert.alert(
      'Are you sure?',
      'You will permanently delete everything stored by NEVULA on this device, including local chats, keys, notes, calendar entries and Gallery files. This cannot be undone. Your online account is not deleted by this action — use the external deletion code above for that.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, delete everything',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void onPanicWipe()
              .catch((error: any) => Alert.alert('Wipe failed', error?.message ?? 'Please try again.'))
              .finally(() => {
                setBusy(false);
                setKillOpen(false);
                setPin('');
              });
          },
        },
      ],
    );
  };

  return (
    <GestureDetector gesture={swipeBack}>
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        <Pressable onPress={onBack}>
          <Text style={s.back}>‹ Settings</Text>
        </Pressable>
        <Text style={s.eyebrow}>ACCOUNT & DATA</Text>
        <Text style={s.title}>Account deletion</Text>
        <Text style={s.copy}>
          Delete your anonymous NEVULA account without providing an email address or phone number.
        </Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>External deletion code</Text>
          <Text style={s.cardCopy}>
            Generate a deletion code and save it outside this device. Creating a new code invalidates the previous one.
          </Text>
          {code ? (
            <>
              <Text selectable style={s.code}>
                {code}
              </Text>
              <Pressable onPress={() => Clipboard.setStringAsync(code)} style={s.secondary}>
                <Text style={s.secondaryText}>Copy code</Text>
              </Pressable>
              <Text selectable style={s.url}>
                {ACCOUNT_DELETION_URL}
              </Text>
            </>
          ) : (
            <Pressable disabled={busy} onPress={generate} style={s.secondary}>
              <Text style={s.secondaryText}>{busy ? 'Creating…' : 'Generate deletion code'}</Text>
            </Pressable>
          )}
        </View>

        {!killOpen ? (
          <Pressable onPress={openKill} style={s.killButton} accessibilityRole="button" accessibilityLabel="Emergency Kill">
            <Text style={s.killIcon}>☠</Text>
            <Text style={s.killTitle}>Emergency Kill</Text>
            <Text style={s.killDetail}>Erase all local NEVULA data on this phone. Works offline, with no server connection. Does not delete the online account.</Text>
          </Pressable>
        ) : (
          <View style={[s.card, s.dangerCard]}>
            <Text style={s.killIconInline}>☠</Text>
            <Text style={s.dangerTitle}>Emergency Kill</Text>
            <Text style={s.cardCopy}>
              Enter your calculator access PIN. It is checked only on this phone and is never sent to the server.
            </Text>
            <View style={[s.pinDisplay, !!pinError && s.pinDisplayError]}>
              <Text style={[s.pinText, !pin && s.pinHint]}>
                {pin ? '•'.repeat(pin.length) : 'Calculator code'}
              </Text>
            </View>
            {!!pinError && <Text style={s.errorText}>{pinError}</Text>}
            <PinKeypad onKey={key} value={pin} />
            <Pressable disabled={busy || !pin} onPress={confirmKill} style={s.deleteButton}>
              <Text style={s.deleteText}>{busy ? 'Please wait…' : 'Confirm access code'}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => {
                setKillOpen(false);
                setPin('');
                setPinError('');
              }}
              style={s.cancelKill}
            >
              <Text style={s.cancelKillText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    </GestureDetector>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg },
    content: { padding: 22, paddingBottom: 48 },
    back: { color: p.accent, fontSize: 13, marginBottom: 28 },
    eyebrow: { color: p.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
    title: { color: p.text, fontSize: 28, fontWeight: '800', marginTop: 8 },
    copy: { color: p.muted, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 22 },
    card: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      borderRadius: 22,
      padding: 18,
      marginBottom: 16,
    },
    dangerCard: { borderColor: p.danger },
    cardTitle: { color: p.text, fontSize: 16, fontWeight: '800' },
    dangerTitle: { color: p.danger, fontSize: 18, fontWeight: '900', textAlign: 'center' },
    cardCopy: { color: p.muted, fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 14 },
    code: { color: p.accent, fontSize: 18, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
    secondary: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryText: { color: p.accent, fontSize: 11, fontWeight: '800' },
    url: { color: p.accent, fontSize: 10, marginTop: 13 },
    killButton: {
      borderWidth: 1,
      borderColor: p.danger,
      backgroundColor: 'rgba(200, 30, 53, 0.08)',
      borderRadius: 22,
      paddingVertical: 22,
      paddingHorizontal: 18,
      alignItems: 'center',
    },
    killIcon: { color: p.danger, fontSize: 36, marginBottom: 8 },
    killIconInline: { color: p.danger, fontSize: 28, textAlign: 'center', marginBottom: 6 },
    killTitle: { color: p.danger, fontSize: 20, fontWeight: '900' },
    killDetail: { color: p.muted, fontSize: 11, marginTop: 6, textAlign: 'center', lineHeight: 16 },
    pinDisplay: {
      height: 48,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 13,
      justifyContent: 'center',
      paddingHorizontal: 14,
      marginBottom: 12,
    },
    pinDisplayError: { borderColor: p.danger },
    pinText: { color: p.text, fontSize: 14, fontWeight: '700' },
    pinHint: { color: p.muted, fontWeight: '500' },
    errorText: { color: p.danger, fontSize: 11, marginBottom: 8 },
    deleteButton: {
      backgroundColor: p.danger,
      borderRadius: 13,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    deleteText: { color: '#fff', fontWeight: '800' },
    cancelKill: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
    cancelKillText: { color: p.muted, fontSize: 12, fontWeight: '700' },
  });
}
