// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDisplayTheme } from '../lib/displayTheme';

const PLUS_MINUS = '\u00B1';
const DIVIDE = '\u00F7';
const MULTIPLY = '\u00D7';
const MINUS = '\u2212';
const BACKSPACE = '\u232B';

type KeyKind = 'digit' | 'function' | 'operator' | 'equals';
type KeyDef = { label: string; kind: KeyKind };

/** Classic Android calculator 4×5 pad. */
const ROWS: KeyDef[][] = [
  [
    { label: 'AC', kind: 'function' },
    { label: PLUS_MINUS, kind: 'function' },
    { label: '%', kind: 'function' },
    { label: DIVIDE, kind: 'operator' },
  ],
  [
    { label: '7', kind: 'digit' },
    { label: '8', kind: 'digit' },
    { label: '9', kind: 'digit' },
    { label: MULTIPLY, kind: 'operator' },
  ],
  [
    { label: '4', kind: 'digit' },
    { label: '5', kind: 'digit' },
    { label: '6', kind: 'digit' },
    { label: MINUS, kind: 'operator' },
  ],
  [
    { label: '1', kind: 'digit' },
    { label: '2', kind: 'digit' },
    { label: '3', kind: 'digit' },
    { label: '+', kind: 'operator' },
  ],
  [
    { label: BACKSPACE, kind: 'function' },
    { label: '0', kind: 'digit' },
    { label: '.', kind: 'digit' },
    { label: '=', kind: 'equals' },
  ],
];

type Props = {
  onKey: (key: string) => void;
  value?: string;
};

/** Keep existing PIN handlers: C / ⌫ / . / digits / operators. */
function emitKey(label: string, onKey: (key: string) => void) {
  if (label === 'AC') {
    onKey('C');
    return;
  }
  if (label === PLUS_MINUS || label === '=') return;
  onKey(label);
}

type ThemePack = {
  shell: string;
  display: string;
  hint: string;
  digitBg: string;
  digitFg: string;
  functionBg: string;
  functionFg: string;
  operatorBg: string;
  operatorFg: string;
  equalsBg: string;
  equalsFg: string;
};

/** Stock / Material calculator palette (light). */
const LIGHT: ThemePack = {
  shell: '#f1f3f4',
  display: '#202124',
  hint: '#5f6368',
  digitBg: '#ffffff',
  digitFg: '#202124',
  functionBg: '#e8eaed',
  functionFg: '#202124',
  operatorBg: '#e8f0fe',
  operatorFg: '#1967d2',
  equalsBg: '#1a73e8',
  equalsFg: '#ffffff',
};

/** Stock / Material calculator palette (dark). */
const DARK: ThemePack = {
  shell: '#202124',
  display: '#e8eaed',
  hint: '#9aa0a6',
  digitBg: '#3c4043',
  digitFg: '#e8eaed',
  functionBg: '#5f6368',
  functionFg: '#e8eaed',
  operatorBg: '#394457',
  operatorFg: '#8ab4f8',
  equalsBg: '#8ab4f8',
  equalsFg: '#202124',
};

export default function PinKeypad({ onKey, value = '' }: Props) {
  const { theme } = useDisplayTheme();
  const pack = theme === 'light' ? LIGHT : DARK;
  const styles = useMemo(() => makeStyles(pack), [pack]);
  const shown = value || '0';

  return (
    <View style={styles.shell} accessibilityLabel="Calculator keypad">
      <View style={styles.displayBox}>
        <Text style={styles.hint} numberOfLines={1}>
          {value ? 'PIN' : ''}
        </Text>
        <Text style={styles.display} numberOfLines={1} adjustsFontSizeToFit>
          {shown}
        </Text>
      </View>

      <View style={styles.pad}>
        {ROWS.map((row, ri) => (
          <View key={`row-${ri}`} style={styles.row}>
            {row.map(item => (
              <Pressable
                key={item.label}
                onPress={() => emitKey(item.label, onKey)}
                style={({ pressed }) => [
                  styles.key,
                  item.kind === 'function' && styles.keyFunction,
                  item.kind === 'operator' && styles.keyOperator,
                  item.kind === 'equals' && styles.keyEquals,
                  pressed && styles.keyPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.keyLabelWrap}>
                  <Text
                    style={[
                      styles.keyLabel,
                      item.kind === 'function' && styles.labelFunction,
                      item.kind === 'operator' && styles.labelOperator,
                      item.kind === 'equals' && styles.labelEquals,
                    ]}
                    allowFontScaling={false}
                  >
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: ThemePack) {
  return StyleSheet.create({
    shell: {
      width: '100%',
      backgroundColor: c.shell,
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingTop: 16,
      paddingBottom: 14,
      marginBottom: 12,
    },
    displayBox: {
      minHeight: 88,
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
      paddingHorizontal: 10,
      paddingBottom: 18,
    },
    hint: {
      alignSelf: 'stretch',
      textAlign: 'right',
      color: c.hint,
      fontSize: 13,
      minHeight: 18,
      marginBottom: 4,
    },
    display: {
      alignSelf: 'stretch',
      textAlign: 'right',
      color: c.display,
      fontSize: 44,
      fontWeight: '300',
      fontVariant: ['tabular-nums'],
      includeFontPadding: false,
      lineHeight: 48,
    },
    pad: {
      gap: 10,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    key: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 999,
      backgroundColor: c.digitBg,
      // True center for the label box
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    keyFunction: { backgroundColor: c.functionBg },
    keyOperator: { backgroundColor: c.operatorBg },
    keyEquals: { backgroundColor: c.equalsBg },
    keyPressed: { opacity: 0.75 },
    keyLabelWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyLabel: {
      color: c.digitFg,
      fontSize: 26,
      fontWeight: '400',
      textAlign: 'center',
      includeFontPadding: false,
      textAlignVertical: 'center',
      lineHeight: 26,
      padding: 0,
      margin: 0,
    },
    labelFunction: {
      color: c.functionFg,
      fontSize: 22,
      lineHeight: 22,
    },
    labelOperator: {
      color: c.operatorFg,
      fontSize: 28,
      lineHeight: 28,
    },
    labelEquals: {
      color: c.equalsFg,
      fontSize: 28,
      lineHeight: 28,
      fontWeight: '600',
    },
  });
}
