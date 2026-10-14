// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isPinAttempt, isSetupPin, pinsMatch } from '../lib/unlock';

type Props = {
  unlockCode: string | null;
  wipeCode: string | null;
  lockedUntil: number | null;
  onUnlock: () => void;
  onSetup: (code: string) => Promise<void>;
  onFailedPin: () => Promise<void>;
  onPanicWipe: () => Promise<void>;
};

// Unicode escapes — never rely on file encoding for these glyphs.
const PLUS_MINUS = '\u00B1';
const DIVIDE = '\u00F7';
const MULTIPLY = '\u00D7';
const MINUS = '\u2212';
const BACKSPACE = '\u232B';

const keys = [
  'C',
  PLUS_MINUS,
  '%',
  DIVIDE,
  '7',
  '8',
  '9',
  MULTIPLY,
  '4',
  '5',
  '6',
  MINUS,
  '1',
  '2',
  '3',
  '+',
  '0',
  '.',
  BACKSPACE,
  '=',
];

const OPERATORS = new Set([DIVIDE, MULTIPLY, MINUS, '+', '=']);
const UTILITIES = new Set(['C', PLUS_MINUS, '%']);

export default function CalculatorGate({
  unlockCode,
  wipeCode,
  lockedUntil,
  onUnlock,
  onSetup,
  onFailedPin,
  onPanicWipe,
}: Props) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [pendingSetup, setPendingSetup] = useState<string | null>(null);

  const prettyExpression = useMemo(() => expression || display, [expression, display]);
  const needsSetup = !unlockCode;
  const isLocked = () => !!lockedUntil && Date.now() < lockedUntil;

  const showResult = (output: string) => {
    setDisplay(output);
    setExpression(output === 'Error' ? '' : output);
  };

  const evaluate = (source: string) => {
    const sanitized = source
      .split(MULTIPLY)
      .join('*')
      .split(DIVIDE)
      .join('/')
      .split(MINUS)
      .join('-');
    if (!/^[0-9+\-*/.%()\s]+$/.test(sanitized)) {
      showResult('Error');
      return;
    }
    try {
      const result = Function(`"use strict"; return (${sanitized})`)();
      showResult(Number.isFinite(result) ? String(result) : 'Error');
    } catch {
      showResult('Error');
    }
  };

  const finishEquals = async (source: string) => {
    if (needsSetup) {
      if (isSetupPin(source)) {
        if (!pendingSetup) {
          setPendingSetup(source);
          setDisplay('0');
          setExpression('');
          return;
        }
        if (pendingSetup === source) {
          await onSetup(source);
          setPendingSetup(null);
          setDisplay('0');
          setExpression('');
          return;
        }
        setPendingSetup(null);
        showResult('Error');
        return;
      }
      evaluate(source);
      return;
    }

    if (isLocked()) {
      showResult('Error');
      return;
    }

    if (isPinAttempt(source, unlockCode)) {
      if (wipeCode && pinsMatch(source, wipeCode)) {
        await onPanicWipe();
        setDisplay('0');
        setExpression('');
        return;
      }
      if (unlockCode && pinsMatch(source, unlockCode)) {
        onUnlock();
        setDisplay('0');
        setExpression('');
        return;
      }
      await onFailedPin();
      showResult('Error');
      return;
    }

    evaluate(source);
  };

  const input = (key: string) => {
    if (key === 'C') {
      setDisplay('0');
      setExpression('');
      setPendingSetup(null);
      return;
    }
    if (key === BACKSPACE) {
      if (expression.length <= 1) {
        setDisplay('0');
        setExpression('');
      } else {
        const next = expression.slice(0, -1);
        setExpression(next);
        setDisplay(next);
      }
      return;
    }
    if (key === '=') {
      void finishEquals(expression || display);
      return;
    }
    if (key === PLUS_MINUS) {
      const base = expression || display;
      if (base.startsWith('-')) {
        const next = base.slice(1) || '0';
        setExpression(next);
        setDisplay(next);
      } else if (base !== '0') {
        const next = `-${base}`;
        setExpression(next);
        setDisplay(next);
      }
      return;
    }
    if (key === '%') {
      const n = Number(expression || display);
      if (!Number.isFinite(n)) {
        showResult('Error');
        return;
      }
      const next = String(n / 100);
      setExpression(next);
      setDisplay(next);
      return;
    }

    const next = (expression === '0' || expression === 'Error' ? '' : expression) + key;
    setExpression(next);
    setDisplay(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.displayArea}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.display}>
          {prettyExpression}
        </Text>
      </View>

      <View style={styles.grid}>
        {keys.map(key => {
          const operator = OPERATORS.has(key);
          const utility = UTILITIES.has(key);
          return (
            <Pressable
              key={key}
              onPress={() => input(key)}
              style={({ pressed }) => [
                styles.key,
                operator && styles.operatorKey,
                utility && styles.utilityKey,
                key === '0' && styles.zeroKey,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.keyText, utility && styles.utilityText]}>{key}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Calculator opener is always dark — matches the disguise and unlock moment. */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 18,
    paddingBottom: 18,
    justifyContent: 'flex-end',
  },
  displayArea: {
    minHeight: 180,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingBottom: 24,
    marginTop: 48,
  },
  display: { color: '#f7f7f8', fontSize: 64, fontWeight: '300' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  key: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: '#24262b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zeroKey: { width: '47%', aspectRatio: 2.15, alignItems: 'flex-start', paddingLeft: 30 },
  operatorKey: { backgroundColor: '#d78518' },
  utilityKey: { backgroundColor: '#a8a9ac' },
  pressed: { opacity: 0.65 },
  keyText: { color: '#fff', fontSize: 28, fontWeight: '500' },
  utilityText: { color: '#111318' },
});
