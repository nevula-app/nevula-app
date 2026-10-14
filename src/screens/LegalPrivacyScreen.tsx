// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CONTRIBUTE_URL, LEGAL_NOTICE_URL, PRIVACY_POLICY_URL, SUPPORT_URL } from '../lib/legal';
import { openNevulaCommunity } from '../lib/communityAccess';
import { HomePalette, useDisplayTheme } from '../lib/displayTheme';

type Props = { onBack: () => void };

async function open(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', 'Please try again when an internet connection is available.');
  }
}

/**
 * In-app hub only. Full legal text lives on nevula.de — a clear link is enough
 * for the policy/imprint duty; we do not duplicate long explanations here.
 */
export default function LegalPrivacyScreen({ onBack }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [openingCommunity, setOpeningCommunity] = useState(false);
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

  const enterCommunity = async () => {
    try {
      setOpeningCommunity(true);
      await openNevulaCommunity();
    } catch (error: any) {
      Alert.alert('Community access unavailable', error?.message ?? 'Please try again.');
    } finally {
      setOpeningCommunity(false);
    }
  };

  return (
    <GestureDetector gesture={swipeBack}>
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} nestedScrollEnabled>
        <Pressable onPress={onBack}>
          <Text style={s.back}>‹ Settings</Text>
        </Pressable>
        <Text style={s.eyebrow}>PRIVACY & SUPPORT</Text>
        <Text style={s.title}>Help & policy</Text>

        <View style={s.policyColumn}>
          <Text style={s.columnLabel}>SUPPORT & LEGAL</Text>
          <Pressable onPress={() => open(SUPPORT_URL)} style={s.columnRow}>
            <View style={s.columnCopy}>
              <Text style={s.columnTitle}>Support</Text>
              <Text style={s.columnDetail}>Private help via the support form</Text>
            </View>
            <Text style={s.arrow}>↗</Text>
          </Pressable>
          <Pressable onPress={() => open(CONTRIBUTE_URL)} style={s.columnRow}>
            <View style={s.columnCopy}>
              <Text style={s.columnTitle}>NEVULA unterstützen</Text>
              <Text style={s.columnDetail}>Support NEVULA — voluntary crypto contribution</Text>
            </View>
            <Text style={s.arrow}>↗</Text>
          </Pressable>
          <Pressable onPress={() => open(PRIVACY_POLICY_URL)} style={s.columnRow}>
            <View style={s.columnCopy}>
              <Text style={s.columnTitle}>Privacy</Text>
              <Text style={s.columnDetail}>Privacy policy on nevula.de</Text>
            </View>
            <Text style={s.arrow}>↗</Text>
          </Pressable>
          <Pressable onPress={() => open(LEGAL_NOTICE_URL)} style={[s.columnRow, s.columnRowLast]}>
            <View style={s.columnCopy}>
              <Text style={s.columnTitle}>Legal</Text>
              <Text style={s.columnDetail}>Legal notice / imprint</Text>
            </View>
            <Text style={s.arrow}>↗</Text>
          </Pressable>
        </View>

        <Pressable
          disabled={openingCommunity}
          onPress={enterCommunity}
          style={s.communityButton}
          accessibilityRole="button"
          accessibilityLabel="Enter NEVULA Community"
        >
          <Text style={s.communityEyebrow}>MEMBERS ONLY</Text>
          <Text style={s.communityTitle}>Community</Text>
          <Text style={s.communityCopy}>
            Bugs, questions and ideas. Open from the app to register or sign in.
          </Text>
          <Text style={s.communityCta}>
            {openingCommunity ? 'Creating secure access…' : 'Enter NEVULA Community ›'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
    </GestureDetector>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: p.bg },
    content: { padding: 22, paddingBottom: 48 },
    back: { color: p.accent, fontSize: 13, marginBottom: 22 },
    eyebrow: { color: p.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
    title: { color: p.text, fontSize: 24, fontWeight: '800', marginTop: 6, marginBottom: 18 },
    policyColumn: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 18,
    },
    columnLabel: {
      color: p.muted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.4,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 6,
    },
    columnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    columnRowLast: {},
    columnCopy: { flex: 1, paddingRight: 10 },
    columnTitle: { color: p.text, fontSize: 14, fontWeight: '800' },
    columnDetail: { color: p.muted, fontSize: 11, marginTop: 3, lineHeight: 15 },
    arrow: { color: p.muted, fontSize: 16 },
    communityButton: {
      borderWidth: 1,
      borderColor: p.accent,
      backgroundColor: p.accentSoft,
      borderRadius: 18,
      padding: 18,
      minHeight: 140,
      justifyContent: 'center',
    },
    communityEyebrow: { color: p.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
    communityTitle: { color: p.text, fontSize: 22, fontWeight: '800', marginTop: 8 },
    communityCopy: { color: p.muted, fontSize: 12, lineHeight: 17, marginTop: 8 },
    communityCta: { color: p.accent, fontSize: 12, fontWeight: '900', marginTop: 16 },
  });
}
