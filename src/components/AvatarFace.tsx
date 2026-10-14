// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { Image, View } from 'react-native';

type Props = {
  uri: string | null;
  size: number;
  borderColor: string;
  backgroundColor: string;
  iconColor: string;
};

export default function AvatarFace({ uri, size, borderColor, backgroundColor, iconColor }: Props) {
  const radius = size / 2;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, borderWidth: 1, borderColor, backgroundColor }}
      />
    );
  }
  const head = Math.round(size * 0.28);
  return (
    <View style={{ width: size, height: size, borderRadius: radius, borderWidth: 1, borderColor, backgroundColor, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: iconColor }} />
      <View style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.18), borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: iconColor, marginTop: Math.round(size * 0.04) }} />
    </View>
  );
}
