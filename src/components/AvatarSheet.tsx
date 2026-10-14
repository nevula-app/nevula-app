// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { avatarCopy } from '../lib/profileAvatar';

type Props = {
  visible: boolean;
  hasPicture: boolean;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  dangerColor: string;
  onClose: () => void;
  onGallery: () => void;
  onNevula: () => void;
  onCamera: () => void;
  onRemove: () => void;
};

export default function AvatarSheet({
  visible,
  hasPicture,
  backgroundColor,
  textColor,
  borderColor,
  dangerColor,
  onClose,
  onGallery,
  onNevula,
  onCamera,
  onRemove,
}: Props) {
  const copy = avatarCopy();
  const row = {
    minHeight: 52,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: borderColor,
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={copy.cancel} />
        <View style={{ backgroundColor, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor, paddingTop: 18, paddingBottom: 8 }}>
          <Text style={{ color: textColor, fontSize: 16, fontWeight: '800', textAlign: 'center', paddingBottom: 10 }}>{copy.title}</Text>
          <Pressable onPress={onGallery} style={row}><Text style={{ color: textColor, fontSize: 16, fontWeight: '700' }}>{copy.gallery}</Text></Pressable>
          <Pressable onPress={onNevula} style={row}><Text style={{ color: textColor, fontSize: 16, fontWeight: '700' }}>{copy.nevula}</Text></Pressable>
          <Pressable onPress={onCamera} style={row}><Text style={{ color: textColor, fontSize: 16, fontWeight: '700' }}>{copy.camera}</Text></Pressable>
          {hasPicture ? <Pressable onPress={onRemove} style={row}><Text style={{ color: dangerColor, fontSize: 16, fontWeight: '700' }}>{copy.remove}</Text></Pressable> : null}
          <Pressable onPress={onClose} style={row}><Text style={{ color: textColor, fontSize: 16, fontWeight: '700' }}>{copy.cancel}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}
