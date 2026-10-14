// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { materializeVaultMedia, type VaultMediaPayload } from '../lib/vaultMedia';

type Props = {
  id: string;
  payload: VaultMediaPayload;
  mine: boolean;
};

export default function ChatMediaBubble({ id, payload, mine }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    materializeVaultMedia(id, payload).then(next => { if (!cancelled) setUri(next); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, payload.bytes]);
  if (payload.mediaKind === 'photo') {
    return <View style={s.wrap}>{uri ? <Image source={{ uri }} style={s.photo} resizeMode="cover" /> : <Text style={mine ? s.sent : s.got}>Photo</Text>}</View>;
  }
  if (payload.mediaKind === 'video') {
    return <View style={s.wrap}>{uri ? <ChatVideo uri={uri} /> : <Text style={mine ? s.sent : s.got}>Video</Text>}</View>;
  }
  return <View style={s.file}><Text style={mine ? s.sent : s.got}>{payload.fileName}</Text><Text style={s.hint}>Gallery file</Text></View>;
}

function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, next => { next.loop = false; });
  return <VideoView player={player} style={s.video} nativeControls contentFit="contain" allowsPictureInPicture={false} fullscreenOptions={{ enable: false }} />;
}

const s = StyleSheet.create({
  wrap: { width: 196, minHeight: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,.25)' },
  photo: { width: 196, height: 148 },
  video: { width: 196, height: 148 },
  file: { minWidth: 140, paddingVertical: 4 },
  sent: { color: 'white', fontSize: 13, fontWeight: '700' },
  got: { color: '#e8edf4', fontSize: 13, fontWeight: '700' },
  hint: { color: '#94a3b8', fontSize: 8, marginTop: 4, fontWeight: '800' },
});
