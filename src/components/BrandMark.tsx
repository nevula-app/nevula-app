// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { BRAND_EYEBROW, useDisplayTheme } from '../lib/displayTheme';

/** Thin, spaced NEVULA wordmark used in screen headers. */
export default function BrandMark({ style }: { style?: TextStyle }) {
  const { theme } = useDisplayTheme();
  return (
    <Text
      style={[styles.mark, { color: theme === 'light' ? BRAND_EYEBROW : '#ffffff' }, style]}
      accessibilityRole="header"
      accessibilityLabel="NEVULA"
    >
      NEVULA
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    fontSize: 10,
    fontWeight: '200',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
});
