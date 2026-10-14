// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { contactInviteUrl } from '../../shared/contactInvite';
import type { PairingPayload } from '../lib/pairing';
import { loadOwnContactInvite, resolveContactInvite, revokeContactInvite, rotateContactInvite, submitContactInvite } from '../lib/contactInvites';

type Props = {
  identity: PairingPayload;
  token?: string | null;
  visible?: boolean;
  onClose: () => void;
  onSent: () => void;
};

export default function PublicContactInvite({ identity, token, visible = true, onClose, onSent }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [peer, setPeer] = useState<PairingPayload | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const live = useRef(true);
  const running = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    live.current = true;
    let cancelled = false;
    setBusy(true);
    setError('');
    setPeer(null);
    (token
      ? resolveContactInvite(token).then((value) => {
          if (value.userId === identity.userId) throw new Error('This is your own contact link.');
          if (!cancelled) setPeer(value);
        })
      : loadOwnContactInvite(identity.userId).then((value) => {
          if (!cancelled) setUrl(value);
        }))
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Could not load invitation.');
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      live.current = false;
    };
  }, [token, identity.userId, reload]);

  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e: any) {
      if (live.current) setError(e.message ?? 'Please try again.');
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  };

  const generate = () =>
    run(async () => {
      const next = await rotateContactInvite(identity);
      if (live.current) setUrl(next);
    });

  const confirmRotate = () =>
    Alert.alert(
      'Replace public link?',
      'The previous link will stop accepting new requests. Existing contacts and already sent requests remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace link', onPress: generate },
      ],
    );

  const confirmRevoke = () =>
    Alert.alert(
      'Revoke public link?',
      'New requests through this link will stop. Existing contacts and already sent requests remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await revokeContactInvite();
              if (live.current) setUrl(null);
            }),
        },
      ],
    );

  const authorizeSend = () => {
    if (!token || !peer) return;
    void run(async () => {
      const outcome = await submitContactInvite(token, identity, peer);
      if (!live.current) return;
      onSent();
      onClose();
      if (outcome === 'connected') {
        Alert.alert('Already connected', 'This contact is already in your chats.');
      } else {
        Alert.alert(
          'Request sent',
          'Waiting for them to Accept or Decline on their phone. No chat opens until you choose one later.',
        );
      }
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={busy} onPress={() => { if (!busy) onClose(); }} accessibilityLabel="Dismiss" />
        <ScrollView style={s.card} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>{token ? 'Contact invitation' : 'Your public contact link'}</Text>
          <Text style={s.text}>
            {token
              ? 'Check the NEVULA ID and fingerprint, then authorize once. That sends an encrypted request — not an automatic verified contact.'
              : 'Share this link on a website or in a forum. Anyone with it can request contact. You can replace or revoke it at any time. Tor/NevTOR is optional for this flow.'}
          </Text>
          {busy ? <ActivityIndicator color="#7fb2ff" accessibilityLabel="Loading invitation" /> : null}
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          {token && peer ? (
            <>
              <Text style={s.labelSoft}>Public handshake details</Text>
              <Text style={s.text}>Contact: {peer.nevulaId}</Text>
              <Text style={s.text}>Device fingerprint</Text>
              <Text selectable style={s.small}>
                {peer.fingerprint}
              </Text>
              <Text style={s.warn}>
                Public invite ≠ identity proof. Check the NEVULA ID and fingerprint carefully before you authorize.
              </Text>
              <Pressable disabled={busy} style={[s.button, s.primary]} onPress={authorizeSend}>
                <Text style={s.label}>Authorize contact</Text>
              </Pressable>
            </>
          ) : null}
          {token && !peer && !busy ? (
            <Pressable style={s.button} onPress={() => setReload((n) => n + 1)}>
              <Text style={s.label}>Try again</Text>
            </Pressable>
          ) : null}
          {!token && url ? (
            <>
              <View style={s.qr}>
                <QRCode value={url} size={210} />
              </View>
              <Text selectable style={s.small}>
                {url}
              </Text>
              <Pressable
                disabled={busy}
                style={s.button}
                onPress={() =>
                  run(async () => {
                    await Clipboard.setStringAsync(url);
                    Alert.alert('Link copied');
                  })
                }
              >
                <Text style={s.label}>Copy link</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                style={s.button}
                onPress={() =>
                  run(async () => {
                    await Share.share({ message: url });
                  })
                }
              >
                <Text style={s.label}>Share link</Text>
              </Pressable>
              <Pressable disabled={busy} style={s.button} onPress={confirmRotate}>
                <Text style={s.label}>Generate new link</Text>
              </Pressable>
            </>
          ) : null}
          {!token && !url ? (
            <Pressable disabled={busy} style={s.button} onPress={generate}>
              <Text style={s.label}>Create public link</Text>
            </Pressable>
          ) : null}
          {!token ? (
            <Pressable disabled={busy} style={s.button} onPress={confirmRevoke}>
              <Text style={s.label}>Revoke active public link</Text>
            </Pressable>
          ) : null}
          <Pressable disabled={busy} style={s.button} onPress={onClose}>
            <Text style={s.label}>{token ? 'Cancel' : 'Done'}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,.85)' },
  card: { flexGrow: 0, maxHeight: '90%', borderRadius: 20, backgroundColor: '#0b121e' },
  content: { padding: 22, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  text: { fontSize: 14, lineHeight: 21, color: '#bdcadd' },
  labelSoft: { color: '#4c78b8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  small: { fontSize: 11, color: '#a7bad4' },
  warn: { color: '#c9a36a', fontSize: 12, lineHeight: 18 },
  error: { color: '#ffacac' },
  qr: { alignSelf: 'center', backgroundColor: '#fff', padding: 16 },
  button: { padding: 14, borderRadius: 12, backgroundColor: '#193459', alignItems: 'center' },
  primary: { backgroundColor: '#2878ff' },
  label: { color: '#fff', fontWeight: '600' },
});
