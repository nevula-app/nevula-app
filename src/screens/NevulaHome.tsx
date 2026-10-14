// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert, Image, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { requestReminderPermission, rescheduleAllCalendarNotifications } from '../lib/calendar';
import { clearStoredNotificationBadge, DEFAULT_NOTIFICATION_PREFERENCES, DISGUISED_NOTIFICATION_TEXTS, getNotificationPreferences, NotificationPreferences, saveNotificationPreferences } from '../lib/notificationPreferences';
import { subscribeInAppUnread, unreadCountLabel, unreadLabel, acknowledgeAllInAppUnreadOrphans, reconcileInAppUnread } from '../lib/inAppUnread';
import { consumeInboxQuiet } from '../lib/messageAlerts';
import { registerMessageInboxBackgroundFetch } from '../lib/messageAlertBackground';
import { registerRemotePushToken, unregisterRemotePushTokens } from '../lib/remotePush';
import { listContacts, listPendingInboxBlobIds } from '../lib/messaging';
import { listSealedInboxIds } from '../lib/sealedInbox';
import { PIN_POLICY, pinError, wipePinError } from '../lib/unlock';
import PinKeypad from '../components/PinKeypad';
import PublicContactInvite from '../components/PublicContactInvite';
import OrbotOnionMark from '../components/OrbotOnionMark';
import { ensureNevulaIdentity, getCachedNevulaIdentity, peekCachedNevulaId } from '../lib/identity';
import { ensurePersonalDeleteKey, loadPersonalDeleteKey } from '../lib/personalDeleteKey';
import { LauncherIconMode, openOemPushSettings, requestUnrestrictedBattery, syncLauncherIconToNative } from '../lib/launcherIcon';
import { acknowledgeOemPushHint, shouldShowHonorOemPushDialog } from '../lib/oemPushHints';
import { ensureIdentityRecovery } from '../lib/identityRecovery';
import { BRAND_EYEBROW, DisplayTheme, HomePalette, useDisplayTheme } from '../lib/displayTheme';
import { nevTorManager, useNevTorSnapshot } from '../lib/nevtor';
import { PRIVACY_POLICY_URL } from '../lib/legal';
import { androidStatusInset } from '../lib/statusInset';
import type { PairingPayload } from '../lib/pairing';
import { openOrbotApp as launchOrbot } from '../lib/openOrbot';
/**
 * Prep-only: Recheck label + active/not active under the onion (no Orbot store/deep link).
 * Keep false until we deliberately ship that UI.
 */
const ORBOT_HINT_RECHECK_STATUS = false;

type Props = {
  launcherIconMode: LauncherIconMode;
  onChangeLauncherIcon: (mode: LauncherIconMode) => Promise<void>;
  initialCredentials: { nevulaId: string; deleteKey: string; recoveryId: string; recoveryKey: string } | null;
  onCredentialsShown: () => void;
  onChangeUnlockCode: (code: string) => Promise<void>;
  onChangeWipeCode: (code: string) => Promise<void>;
  onVerifyUnlockCode: (code: string) => boolean;
  onPanicWipe: () => Promise<void>;
  onOpenAccountDeletion: () => void;
  onOpenLegalPrivacy: () => void;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenNotes: () => void;
  onOpenCamera: () => void;
};

type Pillar = { title: string; subtitle: string; onPress: () => void; glyph: 'calendar' | 'camera' | 'notes' };

export default function NevulaHome({
  launcherIconMode,
  onChangeLauncherIcon,
  initialCredentials,
  onCredentialsShown,
  onChangeUnlockCode,
  onChangeWipeCode,
  onVerifyUnlockCode,
  onPanicWipe,
  onOpenAccountDeletion,
  onOpenLegalPrivacy,
  onOpenMessages,
  onOpenCalendar,
  onOpenNotes,
  onOpenCamera,
}: Props) {
  const { theme, palette: p, setTheme: setDisplay } = useDisplayTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const nevTorSnapshot = useNevTorSnapshot();
  const nevTorOn = nevTorSnapshot.routingMode !== 'OFF';
  const nevTorLive =
    nevTorOn && nevTorSnapshot.torReady && nevTorSnapshot.connection === 'connected';
  const [nevTorBusy, setNevTorBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [identity, setIdentity] = useState<PairingPayload | null>(() => getCachedNevulaIdentity());
  const [dashboardKey, setDashboardKey] = useState<string | null>(
    () => getCachedNevulaIdentity()?.nevulaId ?? initialCredentials?.nevulaId ?? null,
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<'menu' | 'appearance' | 'security' | 'recovery' | 'access'>('menu');
  const settingsPanelRef = React.useRef(settingsPanel);
  settingsPanelRef.current = settingsPanel;
  const goSettingsBack = () => {
    if (settingsPanelRef.current !== 'menu') setSettingsPanel('menu');
    else setSettingsOpen(false);
  };
  const settingsSwipeBack = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-28, 28])
        .failOffsetY([-20, 20])
        .onEnd((event) => {
          if (Math.abs(event.translationX) < 56 && Math.abs(event.velocityX) < 550) return;
          goSettingsBack();
        }),
    [],
  );
  const [securityOpen, setSecurityOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [deleteCode, setDeleteCode] = useState('');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState('');
  const [codeField, setCodeField] = useState<'new' | 'confirm' | 'delete' | 'deleteConfirm' | null>(null);
  const [saving, setSaving] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [pushSaveFlash, setPushSaveFlash] = useState(false);
  const [iconSaving, setIconSaving] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicCode, setPanicCode] = useState('');
  const [panicError, setPanicError] = useState('');
  const [credentialsOpen, setCredentialsOpen] = useState(Boolean(initialCredentials));
  const [personalKeys, setPersonalKeys] = useState(initialCredentials);
  const [unreadCount, setUnreadCount] = useState(0);

  const pillars: Pillar[] = [
    { title: 'Calendar', subtitle: 'Schedules', glyph: 'calendar', onPress: onOpenCalendar },
    { title: 'Gallery', subtitle: 'Media & files', glyph: 'camera', onPress: onOpenCamera },
    { title: 'Notes', subtitle: 'Private text', glyph: 'notes', onPress: onOpenNotes },
  ];

  useEffect(() => {
    getNotificationPreferences().then(setNotificationPrefs).catch(() => undefined);
    void peekCachedNevulaId()
      .then((id) => {
        if (id) setDashboardKey(id);
      })
      .catch(() => undefined);
    ensureNevulaIdentity()
      .then((id) => {
        setIdentity(id);
        setDashboardKey(id.nevulaId);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => subscribeInAppUnread(setUnreadCount), []);
  useEffect(() => {
    if (!identity?.userId) return;
    const prompted = new Set<string>();
    const pull = () => {
      void (async () => {
        await consumeInboxQuiet(identity.userId).catch(() => undefined);
        const [pending, sealed, contacts, requestBundle] = await Promise.all([
          listPendingInboxBlobIds(identity.userId).catch(() => [] as string[]),
          listSealedInboxIds(identity.userId).catch(() => [] as string[]),
          listContacts(identity.userId).catch(() => [] as { userId: string }[]),
          import('../lib/messaging').then(m => m.listContactRequests(identity.userId)).catch(() => ({ pending: [], declines: [] })),
        ]);
        await reconcileInAppUnread({
          pendingServerIds: pending,
          localSealedIds: sealed,
          knownPeerIds: contacts.map(c => c.userId),
        }).catch(() => undefined);

        const known = new Set(contacts.map(c => c.userId));
        const incoming = requestBundle.pending.filter(
          r => r.receiver_id === identity.userId && r.status === 'pending' && !known.has(r.sender_id),
        );
        for (const request of incoming) {
          if (prompted.has(request.id)) continue;
          prompted.add(request.id);
          const label = (request as { senderNevulaId?: string }).senderNevulaId || 'Someone';
          Alert.alert(
            'Contact request',
            `${label} wants to add you as a secure contact. Accept to confirm on both sides, or Decline to refuse.`,
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Decline',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    try {
                      const {
                        respondToContactRequest,
                        sendPairingDecline,
                      } = await import('../lib/messaging');
                      await sendPairingDecline(identity.userId, request.sender_id).catch(() => undefined);
                      await respondToContactRequest(request.id, 'declined');
                    } catch (error: any) {
                      Alert.alert('Could not decline', error?.message ?? 'Please try again.');
                    }
                  })();
                },
              },
              {
                text: 'Accept',
                onPress: () => {
                  void (async () => {
                    try {
                      const {
                        createConversationWith,
                        respondToContactRequest,
                        sendPairingAck,
                      } = await import('../lib/messaging');
                      const { markContactVerified } = await import('../lib/verifiedContacts');
                      await createConversationWith(request.sender_id, identity.userId, {
                        nevulaId: label !== 'Someone' ? label : undefined,
                        displayName: label !== 'Someone' ? label : undefined,
                      });
                      if ((request as { source?: string }).source !== 'public_invite') {
                        const trust = (request as { trust?: string }).trust;
                        const method = trust === 'key' ? 'key' : 'in_person';
                        await markContactVerified(identity.userId, request.sender_id, method);
                        await sendPairingAck(identity.userId, request.sender_id, method);
                      } else {
                        await sendPairingAck(identity.userId, request.sender_id);
                      }
                      await respondToContactRequest(request.id, 'accepted');
                      Alert.alert(
                        'Contact confirmed',
                        'Contact confirmed on both sides. No chat was started — open Messenger → New chat when you want to message them.',
                      );
                    } catch (error: any) {
                      Alert.alert('Could not accept', error?.message ?? 'Please try again.');
                    }
                  })();
                },
              },
            ],
          );
          try {
            const prefs = await getNotificationPreferences();
            if (prefs.enabled && prefs.contactRequests !== false) {
              const { presentDisguisedMessageAlert } = await import('../lib/messageAlerts');
              await presentDisguisedMessageAlert().catch(() => undefined);
            }
          } catch {
            // Optional push only.
          }
          break;
        }
      })();
    };
    pull();
    const timer = setInterval(pull, 5_000);
    return () => clearInterval(timer);
  }, [identity?.userId, onOpenMessages]);

  // After returning from Messages, drop any leftover peerless badge immediately.
  useEffect(() => {
    void acknowledgeAllInAppUnreadOrphans().catch(() => undefined);
  }, []);

  // Keep FCM token fresh whenever push is enabled (not only when saving Settings).
  useEffect(() => {
    if (!identity?.userId || !notificationPrefs.enabled) return;
    void registerRemotePushToken(identity.userId, notificationPrefs).catch(() => undefined);
  }, [identity?.userId, notificationPrefs.enabled, notificationPrefs.badgeOnly, notificationPrefs.disguisedText]);

  // FCM / status-bar icons read SharedPreferences — keep them aligned with Appearance.
  useEffect(() => {
    void syncLauncherIconToNative().catch(() => undefined);
  }, [launcherIconMode]);
  useEffect(() => {
    if (initialCredentials) {
      setPersonalKeys(initialCredentials);
      setCredentialsOpen(true);
    }
  }, [initialCredentials]);

  const toggleNevTor = async () => {
    // Allow turning OFF even if a previous probe left busy stuck.
    if (nevTorBusy && nevTorOn === false) return;
    try {
      setNevTorBusy(true);
      if (nevTorOn) {
        await nevTorManager.setRoutingMode('OFF');
        return;
      }
      // NevTOR is only a preference — Orbot (Tor VPN) must be running separately.
      await nevTorManager.setRoutingMode('TOR_PREFERRED');
      const snap = nevTorManager.getSnapshot();
      const live = snap.torReady && snap.connection === 'connected';
      if (!live) {
        Alert.alert(
          'Orbot required',
          snap.lastError
            ? `${snap.lastError}\n\nOpen Orbot, start the connection, then Recheck. The onion turns blue when Orbot is live.`
            : 'NevTOR is on, but Tor only works while Orbot’s VPN is connected. Open Orbot, start the connection, then Recheck. The onion turns blue when Orbot is live.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Open Orbot', onPress: () => { void openOrbotApp(); } },
            {
              text: 'Recheck',
              onPress: () => {
                void recheckOrbot();
              },
            },
          ],
        );
      }
    } catch (error: any) {
      Alert.alert('NevTOR', error?.message ?? 'Could not update NevTOR.');
    } finally {
      setNevTorBusy(false);
    }
  };

  const recheckOrbot = async () => {
    if (nevTorBusy) return;
    try {
      setNevTorBusy(true);
      await nevTorManager.refresh();
    } catch (error: any) {
      Alert.alert('NevTOR', error?.message ?? 'Could not recheck Orbot.');
    } finally {
      setNevTorBusy(false);
    }
  };

  const openOrbotApp = async () => {
    const result = await launchOrbot();
    if (result !== 'opened') {
      Alert.alert(
        'Orbot',
        'Orbot is not installed or could not be opened. Install Orbot, start its VPN, then return here and tap Recheck.',
      );
    }
  };

  /** Top-right onion: always recheck Tor/Orbot status (enable NevTOR if it was off). */
  const onOnionPress = () => {
    void (async () => {
      if (!nevTorOn) {
        try {
          setNevTorBusy(true);
          await nevTorManager.setRoutingMode('TOR_PREFERRED');
        } catch (error: any) {
          Alert.alert('NevTOR', error?.message ?? 'Could not update NevTOR.');
          setNevTorBusy(false);
          return;
        }
        setNevTorBusy(false);
      }
      await recheckOrbot();
    })();
  };

  const openLink = async () => {
    try {
      const id = identity ?? (await ensureNevulaIdentity());
      setIdentity(id);
      setLinkOpen(true);
    } catch (error: any) {
      Alert.alert('Link unavailable', error?.message ?? 'Complete NEVULA setup first.');
    }
  };

  const showPersonalKeys = async () => {
    try {
      let deleteKey = await loadPersonalDeleteKey();
      const nextIdentity = await ensureNevulaIdentity();
      if (!deleteKey) deleteKey = await ensurePersonalDeleteKey(nextIdentity.userId, nextIdentity.nevulaId);
      const recovery = await ensureIdentityRecovery(nextIdentity);
      setPersonalKeys({ nevulaId: nextIdentity.nevulaId, deleteKey, ...recovery });
      setCredentialsOpen(true);
    } catch (error: any) {
      Alert.alert('Keys unavailable', error?.message ?? 'Could not load your personal keys.');
    }
  };
  const closeCredentials = () => {
    setCredentialsOpen(false);
    onCredentialsShown();
  };
  const insertKey = (key: string) => {
    if (!codeField) return;
    const apply = (value: string) => {
      if (key === 'C') return '';
      if (key === '⌫') return value.slice(0, -1);
      if (value.length >= 24) return value;
   return `${value}${key}`;
  };
    if (codeField === 'confirm') setConfirmCode(apply);
    else if (codeField === 'delete') setDeleteCode(apply);
    else if (codeField === 'deleteConfirm') setConfirmDeleteCode(apply);
  else setNewCode(apply);
 };
  const saveCode = async () => {
    const error = pinError(newCode);
    if (error) {
      Alert.alert('Invalid code', error);
      return;
    }
    if (newCode !== confirmCode) {
      Alert.alert('Codes do not match', 'Enter the same calculator combination twice.');
      return;
    }
    try {
      setSaving(true);
      await onChangeUnlockCode(newCode);
      setNewCode('');
      setConfirmCode('');
      setSettingsOpen(false);
      Alert.alert('Code changed', 'Your new calculator unlock code is active.');
    } catch {
      Alert.alert('Could not save', 'The new code could not be stored securely.');
    } finally {
      setSaving(false);
    }
  };
  const saveDeleteCode = async () => {
    const error = wipePinError(deleteCode);
    if (error) {
      Alert.alert('Invalid emergency wipe code', error);
      return;
    }
    if (deleteCode !== confirmDeleteCode) {
      Alert.alert('Codes do not match', 'Enter the same emergency wipe code twice.');
      return;
    }
    try {
      setSaving(true);
      await onChangeWipeCode(deleteCode);
      setDeleteCode('');
      setConfirmDeleteCode('');
      setCodeField(null);
      Alert.alert(
        'Emergency wipe code active',
        'On the calculator lock screen: enter this code and press = to erase all local NEVULA data. Use a different code than your unlock PIN.',
      );
    } catch (error: any) {
      Alert.alert('Could not save', error?.message ?? 'The wipe code could not be stored securely.');
    } finally {
      setSaving(false);
    }
  };
  const openPanicWipe = () => {
    setPanicCode('');
    setPanicError('');
    setPanicOpen(true);
  };
  const insertPanicKey = (key: string) => {
    setPanicError('');
    setPanicCode((value) => (key === 'C' ? '' : key === '⌫' ? value.slice(0, -1) : value.length >= 24 ? value : `${value}${key}`));
  };
  const verifyPanicWipe = () => {
    if (!panicCode) {
      setPanicError('Enter your calculator access code.');
      return;
    }
    if (!onVerifyUnlockCode(panicCode)) {
      setPanicError('Incorrect calculator access code.');
      return;
    }
    setPanicOpen(false);
    setPanicCode('');
    Alert.alert(
      'Are you sure?',
      'You will permanently delete everything stored by NEVULA on this device, including local chats, keys, notes, calendar entries and Gallery files. This cannot be undone. Your online account is not deleted by this action.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, delete everything', style: 'destructive', onPress: () => void onPanicWipe() },
      ],
    );
  };
  const savePushSettings = async () => {
    try {
      setNotificationSaving(true);
      // Push on ⇒ message alerts on (no separate Messages switch).
      let next: NotificationPreferences = {
        ...notificationPrefs,
        messageAlerts: notificationPrefs.enabled ? true : notificationPrefs.messageAlerts,
      };
      if (next.enabled && !(await requestReminderPermission())) {
        next = { ...next, enabled: false, messageAlerts: false };
        setNotificationPrefs(next);
        Alert.alert('Push notifications blocked', 'Enable notifications for Calculator in Android settings, then try again.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
        ]);
        return;
      }
      setNotificationPrefs(next);
      await saveNotificationPreferences(next);
      await rescheduleAllCalendarNotifications();
      if (next.enabled) {
        await registerMessageInboxBackgroundFetch().catch(() => undefined);
      }
      const identity = await ensureNevulaIdentity().catch(() => null);
      if (identity?.userId) {
        if (next.enabled) {
          const result = await registerRemotePushToken(identity.userId, next);
          if (!result.ok) {
            const hint =
              result.reason === 'permission' ? 'Notification permission was denied.'
              : result.reason === 'firebase-missing' ? 'Firebase/FCM is missing from this build (google-services.json).'
              : result.reason === 'table-missing' ? 'Push table is missing on the server — run apply_device_push_tokens.sql.'
              : result.reason === 'no-session' ? 'Not signed in yet — try again in a moment.'
              : `Could not register this device (${result.reason ?? 'unknown'}).`;
            Alert.alert(
              'Push saved locally',
              `${hint} Calculator alerts on this phone still work while the app is open or freshly backgrounded; remote wake needs a successful FCM registration.`,
            );
          }
          // Honor/Huawei: Autostart dialog only once (and only on those OEMs).
          // Battery intent is a no-op when already unrestricted.
          await requestUnrestrictedBattery().catch(() => undefined);
          if (await shouldShowHonorOemPushDialog()) {
            Alert.alert(
              'Honor / battery',
              'On Honor, also allow NEVULA for Autostart / “Managed manually” and turn off battery restrictions — otherwise push only arrives after you open the app.',
              [
                {
                  text: 'Later',
                  style: 'cancel',
                  onPress: () => { void acknowledgeOemPushHint(); },
                },
                {
                  text: 'Open settings',
                  onPress: () => {
                    void acknowledgeOemPushHint();
                    void openOemPushSettings();
                  },
                },
              ],
            );
          }
        } else {
          await unregisterRemotePushTokens(identity.userId).catch(() => undefined);
        }
      }
      if (!next.enabled) {
        await clearStoredNotificationBadge();
        await Notifications.setBadgeCountAsync(0).catch(() => undefined);
        await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
      }
      setPushSaveFlash(true);
    } catch (error: any) {
      Alert.alert('Could not save push settings', error?.message ?? 'Please try again.');
    } finally {
      setNotificationSaving(false);
    }
  };
  const selectLauncherIcon = async (mode: LauncherIconMode) => {
    if (mode === launcherIconMode) return;
    try {
      setIconSaving(true);
      await onChangeLauncherIcon(mode);
      Alert.alert(
        'App appearance changed',
        mode === 'calculator'
          ? 'The app now appears as Calculator. Some Android launchers need a few seconds to refresh.'
          : 'The NEVULA name and icon are now visible. Some Android launchers need a few seconds to refresh.',
      );
    } catch (error: any) {
      Alert.alert('Could not change app icon', error?.message ?? 'Please try again.');
    } finally {
      setIconSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Empty status strip (battery / clock), then the app bar with the NEVULA wordmark. */}
      {Platform.OS === 'android' ? <View style={styles.statusSpacer} /> : null}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            setCodeField(null);
            setSettingsPanel('menu');
            setSettingsOpen(true);
          }}
          accessibilityLabel="Settings"
          accessibilityRole="button"
          style={styles.brandHit}
        >
          <Text style={styles.wordmark}>NEVULA</Text>
        </Pressable>
        <View style={styles.topBarMid} />
        <View style={styles.actions}>
          <Pressable onPress={openPanicWipe} accessibilityLabel="Emergency SOS wipe" style={styles.panicBtn}>
            <Text style={styles.panicTxt}>SOS</Text>
          </Pressable>
          <Pressable onPress={() => setSecurityOpen(true)} style={styles.chip}>
            <Text style={styles.chipTxt}>NVL3-QR</Text>
          </Pressable>
          <OrbotOnionMark compact size={18} onPress={onOnionPress} />
        </View>
      </View>

      <View style={styles.body}>
      <Pressable
        onPress={onOpenMessages}
        style={({ pressed }) => [styles.hero, unreadCount > 0 && styles.heroUnread, pressed && styles.pressed]}
        accessibilityLabel={unreadCount > 0 ? `Private Messenger, ${unreadLabel(unreadCount)}` : 'Private Messenger'}
      >
        <Text style={styles.heroTitle}>Private Messenger</Text>
        <Text style={styles.heroCopy}>NVL3 — Quantum-Resistant E2EE</Text>
        <View style={styles.heroFooter}>
          {unreadCount > 0 ? (
            <View style={styles.heroUnreadChip} accessibilityLabel={unreadLabel(unreadCount)}>
              <Text style={styles.heroUnreadChipText}>{unreadCountLabel(unreadCount)}</Text>
            </View>
          ) : (
            <View />
          )}
          <Text style={styles.heroOpen}>Open</Text>
        </View>
      </Pressable>

      <View style={styles.grid}>
        {pillars.map((item) => (
          <Pressable key={item.title} onPress={item.onPress} style={({ pressed }) => [styles.module, pressed && styles.pressed]}>
            <View style={styles.moduleGlyphWrap}>
              {item.glyph === 'calendar' ? (
                <View style={styles.cal}>
                  <View style={styles.calBar} />
                  <Text style={styles.calDay}>31</Text>
                </View>
              ) : item.glyph === 'camera' ? (
                <View style={styles.cameraGlyph}>
                  <View style={styles.cameraTop} />
                  <View style={styles.cameraLens} />
                </View>
              ) : (
                <Text style={styles.notesGlyph}>✎</Text>
              )}
            </View>
            <Text style={styles.modTitle}>{item.title}</Text>
            <Text style={styles.modCopy}>{item.subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.bottom}>
        <View style={styles.modeRow}>
          <Pressable disabled={nevTorBusy} onPress={() => void toggleNevTor()} style={[styles.modeBubble, nevTorOn && styles.modeBubbleOn]}>
            <View style={styles.modeBubbleTop}>
              <Text style={styles.modeTitle}>NevTOR</Text>
              <View style={[styles.toggle, nevTorOn && styles.toggleOn]}>
                <View style={[styles.toggleKnob, nevTorOn && styles.toggleKnobOn]} />
              </View>
            </View>
            <View style={styles.modeOnionRow}>
              <View style={styles.modeOnionLeft}>
                {ORBOT_HINT_RECHECK_STATUS ? (
                  nevTorOn ? (
                    <>
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation?.();
                          void recheckOrbot();
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.orbotHint}>Recheck</Text>
                      </Pressable>
                      <Text style={[styles.orbotStatus, nevTorLive && styles.orbotStatusActive]}>
                        {nevTorLive ? 'active' : 'not active'}
                      </Text>
                    </>
                  ) : null
                ) : (
                  <>
                    {nevTorOn && !nevTorLive ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation?.();
                          void openOrbotApp();
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.orbotHint}>Open Orbot</Text>
                      </Pressable>
                    ) : null}
                    {nevTorOn && nevTorLive ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation?.();
                          void recheckOrbot();
                        }}
                        hitSlop={8}
                      >
                        <Text style={styles.orbotHint}>Recheck</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </View>
              <OrbotOnionMark
                size={24}
                onPress={() => {
                  void recheckOrbot();
                }}
              />
            </View>
          </Pressable>

          <Pressable onPress={() => void openLink()} style={styles.modeBubble}>
            <View style={styles.modeBubbleTop}>
              <Text style={styles.modeTitle}>Create link</Text>
              <View style={styles.linkPlus}>
                <Text style={styles.linkPlusTxt}>+</Text>
              </View>
            </View>
            <Text style={styles.modeDetail}>via nevula.de</Text>
          </Pressable>
        </View>

        <View style={styles.displayRow}>
          <Text style={styles.displayLabel}>Display</Text>
          <View style={styles.segment}>
            <Pressable onPress={() => void setDisplay('dark')} style={[styles.segmentBtn, theme === 'dark' && styles.segmentOn]}>
              <Text style={[styles.segmentTxt, theme === 'dark' && styles.segmentTxtOn]}>Dark</Text>
            </Pressable>
            <Pressable onPress={() => void setDisplay('light')} style={[styles.segmentBtn, theme === 'light' && styles.segmentOn]}>
              <Text style={[styles.segmentTxt, theme === 'light' && styles.segmentTxtOn]}>Light</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.keyBox} accessibilityLabel="Nevula Key">
          <Text style={styles.keyCaption}>Nevula Key</Text>
          <Text style={styles.keyIdLarge} numberOfLines={2} selectable>
            {dashboardKey ?? '—'}
          </Text>
        </View>
      </View>
      </View>

      {identity ? (
        <PublicContactInvite
          identity={identity}
          visible={linkOpen}
          onClose={() => setLinkOpen(false)}
          onSent={() => setLinkOpen(false)}
        />
      ) : null}

      <Modal visible={securityOpen} transparent animationType="fade" onRequestClose={() => setSecurityOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>NVL3-QR Encryption</Text>
            <Text style={styles.modalCopy}>
              Next-generation cryptographic protection combining quantum-resistant encryption with hardened end-to-end security. NVL3 protects every session with advanced key exchange, layered encryption and metadata-minimizing architecture.
            </Text>
            <View style={styles.securityLine}>
              <Text style={styles.securityLineLabel}>Private keys</Text>
              <Text style={styles.securityLineValue}>This device only</Text>
            </View>
            <View style={styles.securityLine}>
              <Text style={styles.securityLineLabel}>Server retention</Text>
              <Text style={styles.securityLineValue}>Maximum 28 days</Text>
            </View>
            <Pressable onPress={() => setSecurityOpen(false)} style={styles.save}>
              <Text style={styles.saveTxt}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={panicOpen} transparent animationType="fade" onRequestClose={() => setPanicOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.panicModalIcon}>☠</Text>
            <Text style={styles.modalTitle}>Emergency Kill</Text>
            <Text style={styles.modalCopy}>
              Enter your calculator access PIN once, then confirm. This erases local NEVULA data on this phone. It runs entirely on this phone and does not need a server connection. It does not delete the online account.
            </Text>
            <View style={[styles.padField, panicError && styles.padFieldError]}>
              <Text style={[styles.padFieldTxt, !panicCode && styles.padFieldHint]}>
                {panicCode ? '•'.repeat(panicCode.length) : 'Enter calculator access code'}
              </Text>
            </View>
            {!!panicError && <Text style={styles.errorText}>{panicError}</Text>}
            <PinKeypad onKey={insertPanicKey} value={panicCode} />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setPanicOpen(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={verifyPanicWipe} style={styles.panicContinue}>
                <Text style={styles.panicContinueText}>Confirm access code</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={credentialsOpen} transparent animationType="fade" onRequestClose={closeCredentials}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Identity & recovery</Text>
            <Text style={styles.modalCopy}>
              Recovery restores only your NEVULA ID on another Android device. Contacts, messages, Gallery, Notes, Calendar and previous device keys never transfer.
            </Text>
            <Text style={styles.keyLabel}>NEVULA ID</Text>
            <Text selectable style={styles.personalKey}>
              {personalKeys?.nevulaId ?? 'Unavailable'}
            </Text>
            <Text style={styles.keyLabel}>RECOVERY ID</Text>
            <Text selectable style={styles.personalKey}>
              {personalKeys?.recoveryId ?? 'Unavailable'}
            </Text>
            <Text style={styles.keyLabel}>RECOVERY KEY</Text>
            <Text selectable style={[styles.personalKey, styles.recoveryKey]}>
              {personalKeys?.recoveryKey ?? 'Unavailable'}
            </Text>
            <Text style={styles.keyLabel}>PERSONAL DELETE KEY</Text>
            <Text selectable style={[styles.personalKey, styles.deleteKey]}>
              {personalKeys?.deleteKey ?? 'Unavailable'}
            </Text>
            <Text style={styles.keyWarning}>Keep recovery credentials private and offline. NEVULA support cannot retrieve them.</Text>
            <Pressable onPress={closeCredentials} style={styles.save}>
              <Text style={styles.saveTxt}>I saved my recovery details</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={goSettingsBack}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={goSettingsBack}
            accessibilityLabel="Close settings"
            accessibilityRole="button"
          />
          <GestureDetector gesture={settingsSwipeBack}>
          <View style={[styles.modal, styles.settingsModal]}>
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {settingsPanel === 'menu' ? (
                <>
                  <Text style={styles.modalTitle}>Settings</Text>
                  <Pressable
                    onPress={() => {
                      void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
                        Alert.alert('Could not open link', 'Please try again when an internet connection is available.');
                      });
                    }}
                    style={styles.menuRow}
                  >
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>What is NEVULA?</Text>
                      <Text style={styles.toggleDetail}>Open Privacy — what it is and what it can do</Text>
                    </View>
                    <Text style={styles.chev}>↗</Text>
                  </Pressable>
                  <View style={styles.divider} />
                  <Pressable onPress={() => setSettingsPanel('appearance')} style={styles.menuRow}>
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>App Appearance</Text>
                      <Text style={styles.toggleDetail}>Launcher icon and name</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <Pressable onPress={() => setSettingsPanel('security')} style={styles.menuRow}>
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>Security</Text>
                      <Text style={styles.toggleDetail}>Alerts and lock-screen text</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <Pressable onPress={() => setSettingsPanel('recovery')} style={styles.menuRow}>
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>Recovery</Text>
                      <Text style={styles.toggleDetail}>Identity and recovery keys</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <Pressable onPress={() => setSettingsPanel('access')} style={styles.menuRow}>
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>Access</Text>
                      <Text style={styles.toggleDetail}>Calculator PIN and emergency wipe</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <View style={styles.divider} />
                  <Pressable
                    onPress={() => {
                      setSettingsOpen(false);
                      onOpenLegalPrivacy();
                    }}
                    style={styles.legalLink}
                  >
                    <Text style={styles.legalLinkText}>Privacy, support & legal</Text>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setSettingsOpen(false);
                      onOpenAccountDeletion();
                    }}
                    style={styles.legalLink}
                  >
                    <Text style={styles.legalLinkText}>Account deletion</Text>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                  <Pressable onPress={() => setSettingsOpen(false)} style={styles.closeSettings}>
                    <Text style={styles.cancel}>Close</Text>
                  </Pressable>
                </>
              ) : null}

              {settingsPanel === 'appearance' ? (
                <>
                  <Pressable onPress={() => setSettingsPanel('menu')} style={styles.backRow}>
                    <Text style={styles.backTxt}>‹ Settings</Text>
                  </Pressable>
                  <Text style={styles.modalTitle}>App Appearance</Text>
                  <Text style={styles.settingsCopy}>
                    Choose how NEVULA appears on the Android home screen. This does not change your protected content or calculator access code.
                  </Text>
                  <Pressable
                    disabled={iconSaving}
                    onPress={() => void selectLauncherIcon('calculator')}
                    style={[styles.iconChoice, launcherIconMode === 'calculator' && styles.iconChoiceActive]}
                  >
                    <Image source={require('../../assets/calculator-icon-inset.png')} style={styles.iconChoiceImage} />
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>Hidden mode</Text>
                      <Text style={styles.toggleDetail}>Calculator icon and Calculator name</Text>
                    </View>
                    <View style={[styles.radio, launcherIconMode === 'calculator' && styles.radioActive]} />
                  </Pressable>
                  <Pressable
                    disabled={iconSaving}
                    onPress={() => void selectLauncherIcon('nevula')}
                    style={[styles.iconChoice, launcherIconMode === 'nevula' && styles.iconChoiceActive]}
                  >
                    <Image source={require('../../assets/icon.png')} style={styles.iconChoiceImage} />
                    <View style={styles.toggleCopy}>
                      <Text style={styles.toggleTitle}>NEVULA mode</Text>
                      <Text style={styles.toggleDetail}>NEVULA icon and NEVULA name</Text>
                    </View>
                    <View style={[styles.radio, launcherIconMode === 'nevula' && styles.radioActive]} />
                  </Pressable>
                </>
              ) : null}

              {settingsPanel === 'security' ? (
                <>
                  <Pressable onPress={() => setSettingsPanel('menu')} style={styles.backRow}>
                    <Text style={styles.backTxt}>‹ Settings</Text>
                  </Pressable>
                  <Text style={styles.modalTitle}>Security</Text>

                  <Text style={styles.settingsSection}>TOR / ORBOT</Text>
                  <Text style={styles.settingsCopy}>
                    NEVULA works fully without Tor. Open a chat and tap Invite to add someone from your contacts — that is how groups are made. Tor chats stay locked after confirm; invitees must accept Orbot before they can join.
                  </Text>
                  <ToggleRow
                    title="NevTOR"
                    detail={
                      nevTorBusy
                        ? 'Updating…'
                        : nevTorOn
                          ? (nevTorSnapshot.connection === 'connected' && nevTorSnapshot.torReady
                            ? 'On — Tor connected'
                            : (nevTorSnapshot.lastError
                              ? `On — ${nevTorSnapshot.lastError}`
                              : 'On — waiting for Orbot'))
                          : 'Off — normal connection'
                    }
                    value={nevTorOn}
                    onChange={() => { void toggleNevTor(); }}
                    styles={styles}
                  />
                  {nevTorOn ? (
                    <Pressable
                      disabled={nevTorBusy}
                      onPress={() => {
                        void (async () => {
                          try {
                            setNevTorBusy(true);
                            await nevTorManager.refresh();
                          } catch (error: any) {
                            Alert.alert('NevTOR', error?.message ?? 'Could not recheck Orbot.');
                          } finally {
                            setNevTorBusy(false);
                          }
                        })();
                      }}
                      style={styles.secondarySave}
                    >
                      <Text style={styles.secondarySaveText}>{nevTorBusy ? '…' : 'Recheck Orbot'}</Text>
                    </Pressable>
                  ) : null}

                  <Text style={styles.settingsSection}>DISGUISED PUSH NOTIFICATIONS</Text>
                  <Text style={styles.settingsCopy}>Lock-screen alerts never show NEVULA, appointment titles, notes or message content.</Text>
                  <ToggleRow
                    title="Push notifications"
                    detail="Master switch for all alerts"
                    value={notificationPrefs.enabled}
                    onChange={(enabled) => {
                      setPushSaveFlash(false);
                      setNotificationPrefs((current) => ({ ...current, enabled }));
                    }}
                    styles={styles}
                  />
                  {notificationPrefs.enabled ? (
                    <>
                      <ToggleRow
                        title="Calendar & reminders"
                        detail="Appointments, tasks and recurring reminders"
                        value={notificationPrefs.calendarReminders}
                        onChange={(calendarReminders) => {
                          setPushSaveFlash(false);
                          setNotificationPrefs((current) => ({ ...current, calendarReminders }));
                        }}
                        styles={styles}
                      />
                      <ToggleRow
                        title="Contact requests"
                        detail="Calculator-style alert when someone wants to pair"
                        value={notificationPrefs.contactRequests}
                        onChange={(contactRequests) => {
                          setPushSaveFlash(false);
                          setNotificationPrefs((current) => ({ ...current, contactRequests }));
                        }}
                        styles={styles}
                      />
                      <Text style={styles.textChoiceLabel}>MESSAGES — WHAT APPEARS ON THE PHONE</Text>
                      <Text style={styles.settingsCopy}>
                        With push on, new messages always alert. Choose badge-only or a disguised Calculator line.
                      </Text>
                      <Pressable
                        onPress={() => {
                          setPushSaveFlash(false);
                          setNotificationPrefs((current) => ({ ...current, badgeOnly: true }));
                        }}
                        style={[styles.textChoice, notificationPrefs.badgeOnly && styles.textChoiceActive]}
                      >
                        <View style={[styles.radio, notificationPrefs.badgeOnly && styles.radioActive]} />
                        <Text style={styles.textChoiceText}>Badge only — no notification text</Text>
                      </Pressable>
                      {DISGUISED_NOTIFICATION_TEXTS.map((text) => (
                        <Pressable
                          key={text}
                          onPress={() => {
                            setPushSaveFlash(false);
                            setNotificationPrefs((current) => ({ ...current, badgeOnly: false, disguisedText: text }));
                          }}
                          style={[
                            styles.textChoice,
                            !notificationPrefs.badgeOnly && notificationPrefs.disguisedText === text && styles.textChoiceActive,
                          ]}
                        >
                          <View
                            style={[
                              styles.radio,
                              !notificationPrefs.badgeOnly && notificationPrefs.disguisedText === text && styles.radioActive,
                            ]}
                          />
                          <Text style={styles.textChoiceText}>{text}</Text>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.settingsCopy}>Turn on push notifications to choose badge-only or a disguised Calculator text for messages and calendar.</Text>
                  )}
                  <Pressable
                    disabled={notificationSaving}
                    onPress={savePushSettings}
                    style={[styles.save, pushSaveFlash && styles.saveFlash]}
                  >
                    <Text style={styles.saveTxt}>
                      {notificationSaving ? 'Saving…' : pushSaveFlash ? 'Saved' : 'Save push settings'}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {settingsPanel === 'recovery' ? (
                <>
                  <Pressable onPress={() => setSettingsPanel('menu')} style={styles.backRow}>
                    <Text style={styles.backTxt}>‹ Settings</Text>
                  </Pressable>
                  <Text style={styles.modalTitle}>Recovery</Text>
                  <Text style={styles.settingsCopy}>
                    Recovery transfers only your NEVULA ID; all private content and contacts remain device-only and are not restored.
                  </Text>
                  <Pressable onPress={() => void showPersonalKeys()} style={styles.secondarySave}>
                    <Text style={styles.secondarySaveText}>View identity & recovery</Text>
                  </Pressable>
                </>
              ) : null}

              {settingsPanel === 'access' ? (
                <>
                  <Pressable onPress={() => setSettingsPanel('menu')} style={styles.backRow}>
                    <Text style={styles.backTxt}>‹ Settings</Text>
                  </Pressable>
                  <Text style={styles.modalTitle}>Access</Text>
                  <Text style={styles.settingsCopy}>{PIN_POLICY}. Use only the calculator keys below.</Text>

                  <Text style={styles.settingsSection}>CALCULATOR ACCESS</Text>
                  <Text style={styles.settingsCopy}>New PIN code for calculator access.</Text>
                  <Pressable onPress={() => setCodeField('new')} style={[styles.padField, codeField === 'new' && styles.padFieldOn]}>
                    <Text style={[styles.padFieldTxt, !newCode && styles.padFieldHint]}>{newCode || 'New PIN for calculator'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setCodeField('confirm')} style={[styles.padField, codeField === 'confirm' && styles.padFieldOn]}>
                    <Text style={[styles.padFieldTxt, !confirmCode && styles.padFieldHint]}>{confirmCode || 'Confirm calculator PIN'}</Text>
                  </Pressable>
                  {(codeField === 'new' || codeField === 'confirm') && (
                    <>
                      <PinKeypad onKey={insertKey} value={codeField === 'confirm' ? confirmCode : newCode} />
                      <Pressable disabled={saving} onPress={saveCode} style={styles.secondarySave}>
                        <Text style={styles.secondarySaveText}>{saving ? 'Saving…' : 'Save calculator PIN'}</Text>
                      </Pressable>
                    </>
                  )}

                  <View style={styles.divider} />
                  <Text style={styles.settingsSection}>EMERGENCY WIPE</Text>
                  <Text style={styles.settingsCopy}>
                    New combination for emergency wipe. If you enter this on the calculator lock screen and press =, all local NEVULA data on this phone is erased. This works offline on this phone and does not need a server connection. It does not delete the online account.
                  </Text>
                  <Pressable onPress={() => setCodeField('delete')} style={[styles.padField, codeField === 'delete' && styles.padFieldOn]}>
                    <Text style={[styles.padFieldTxt, !deleteCode && styles.padFieldHint]}>{deleteCode || 'New emergency wipe code'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setCodeField('deleteConfirm')}
                    style={[styles.padField, codeField === 'deleteConfirm' && styles.padFieldOn]}
                  >
                    <Text style={[styles.padFieldTxt, !confirmDeleteCode && styles.padFieldHint]}>
                      {confirmDeleteCode || 'Confirm emergency wipe code'}
                    </Text>
                  </Pressable>
                  {(codeField === 'delete' || codeField === 'deleteConfirm') && (
                    <>
                      <PinKeypad onKey={insertKey} value={codeField === 'deleteConfirm' ? confirmDeleteCode : deleteCode} />
                      <Pressable disabled={saving} onPress={saveDeleteCode} style={styles.dangerSave}>
                        <Text style={styles.dangerSaveText}>{saving ? 'Saving…' : 'Save emergency wipe code'}</Text>
                      </Pressable>
                    </>
                  )}
                </>
              ) : null}
            </ScrollView>
          </View>
          </GestureDetector>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ToggleRow({
  title,
  detail,
  value,
  onChange,
  styles,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDetail}>{detail}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </Pressable>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.bg,
    },
    statusSpacer: {
      height: androidStatusInset(12),
      backgroundColor: p.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingBottom: 10,
      paddingTop: 4,
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.border,
      backgroundColor: p.bg,
    },
    brandHit: {
      borderRadius: 22,
    },
    topBarMid: { flex: 1 },
    body: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    panicBtn: {
      minWidth: 36,
      height: 30,
      borderRadius: 8,
      paddingHorizontal: 6,
      backgroundColor: '#c62828',
      alignItems: 'center',
      justifyContent: 'center',
    },
    panicTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
    chip: {
      height: 30,
      minWidth: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipTxt: { color: p.muted, fontSize: 10, fontWeight: '700' },
    topMailBtn: {
      height: 30,
      minWidth: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    topMailGlyph: { color: p.accent, fontSize: 14, fontWeight: '700' },
    topUnreadChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 30,
      borderRadius: 8,
      paddingHorizontal: 8,
      backgroundColor: 'rgba(78,163,255,0.2)',
      borderWidth: 1,
      borderColor: '#4ea3ff',
    },
    topUnreadGlyph: { color: '#4ea3ff', fontSize: 13, fontWeight: '700' },
    topUnreadText: { color: '#4ea3ff', fontSize: 12, fontWeight: '900' },
    hero: {
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    wordmark: { color: BRAND_EYEBROW, fontSize: 22, fontWeight: '200', letterSpacing: 1.2 },
    heroTitle: { color: p.text, fontSize: 20, fontWeight: 'bold', marginTop: 12, marginBottom: 4, textAlign: 'center' },
    heroCopy: { color: BRAND_EYEBROW, fontSize: 11, lineHeight: 16, marginBottom: 10, textAlign: 'center' },
    heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    heroUnread: {
      borderColor: '#4ea3ff',
      backgroundColor: 'rgba(78,163,255,0.12)',
      shadowColor: '#4ea3ff',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 4,
    },
    heroUnreadText: { color: '#4ea3ff', fontSize: 11, fontWeight: '800', flexShrink: 1 },
    heroUnreadChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: 'rgba(78,163,255,0.2)',
      borderWidth: 1,
      borderColor: '#4ea3ff',
    },
    heroUnreadChipGlyph: { color: '#4ea3ff', fontSize: 16, fontWeight: '700' },
    heroUnreadChipText: { color: '#4ea3ff', fontSize: 14, fontWeight: '900' },
    heroOpen: { color: p.accent, fontSize: 11, fontWeight: '700' },
    grid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    module: {
      flex: 1,
      minHeight: 96,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 10,
    },
    moduleGlyphWrap: { height: 28, marginBottom: 10, justifyContent: 'center' },
    cal: {
      width: 26,
      height: 26,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: p.muted,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 2,
      overflow: 'hidden',
    },
    calBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: p.text },
    calDay: { color: p.text, fontSize: 9, fontWeight: '800' },
    cameraGlyph: {
      width: 27,
      height: 20,
      borderWidth: 1.7,
      borderColor: p.text,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraTop: {
      position: 'absolute',
      top: -5,
      width: 11,
      height: 5,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
      backgroundColor: p.text,
    },
    cameraLens: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.7, borderColor: p.text },
    notesGlyph: { color: p.text, fontSize: 20, lineHeight: 22 },
    modTitle: { color: p.text, fontSize: 13, fontWeight: '650', marginBottom: 2 },
    modCopy: { color: p.muted, fontSize: 10, lineHeight: 13 },
    pressed: { opacity: 0.75 },
    bottom: { marginTop: 0, paddingBottom: 12, gap: 8 },
    displayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: p.surfaceAlt,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    displayLabel: { color: p.muted, fontSize: 9, fontWeight: '650', letterSpacing: 0.6 },
    keyBox: {
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 40,
      justifyContent: 'center',
      gap: 2,
    },
    keyCaption: {
      color: p.muted,
      fontSize: 9,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    keyIdLarge: {
      color: p.text,
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.2,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      gap: 3,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 8,
      padding: 2,
    },
    segmentBtn: { flex: 1, paddingVertical: 4, borderRadius: 6, alignItems: 'center' },
    segmentOn: { backgroundColor: p.accentSoft },
    segmentTxt: { color: p.muted, fontSize: 10, fontWeight: '650' },
    segmentTxtOn: { color: p.accent },
    modeRow: { flexDirection: 'row', gap: 8 },
    modeBubble: {
      flex: 1,
      minHeight: 64,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 10,
      justifyContent: 'space-between',
    },
    modeBubbleOn: { borderColor: p.accent },
    modeBubbleTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modeTitle: { color: p.text, fontSize: 11, fontWeight: '650', flexShrink: 1, paddingRight: 4 },
    modeOnionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 8,
      minHeight: 28,
    },
    modeOnionLeft: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingRight: 4, gap: 4 },
    modeDetail: { color: p.muted, fontSize: 9, lineHeight: 12, flexShrink: 1, paddingRight: 4 },
    modeOnionRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
    orbotHint: { color: p.accent, fontSize: 10, fontWeight: '700' },
    orbotStatus: { color: p.muted, fontSize: 9, fontWeight: '600', marginTop: 2 },
    orbotStatusActive: { color: p.accent },
    linkPlus: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkPlusTxt: { color: p.accent, fontSize: 14, fontWeight: '650', lineHeight: 16 },
    toggle: { width: 28, height: 16, borderRadius: 9, backgroundColor: p.border, padding: 2 },
    toggleOn: { backgroundColor: p.accent },
    toggleKnob: { width: 12, height: 12, borderRadius: 7, backgroundColor: '#fff' },
    toggleKnobOn: { alignSelf: 'flex-end' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.76)', justifyContent: 'center', padding: 22 },
    modal: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 26, padding: 22 },
    settingsModal: { maxHeight: '88%' },
    modalTitle: { color: p.text, fontSize: 22, fontWeight: '800' },
    modalCopy: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 20 },
    settingsSection: { color: p.accent, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 20, marginBottom: 6 },
    settingsCopy: { color: p.muted, fontSize: 10, lineHeight: 15, marginBottom: 13 },
    padField: {
      backgroundColor: p.surfaceAlt,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 15,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 8,
      minHeight: 48,
      justifyContent: 'center',
    },
    padFieldOn: { borderColor: p.accent },
    padFieldTxt: { color: p.text, fontSize: 18, fontWeight: '300', letterSpacing: 1 },
    padFieldHint: { color: p.muted, fontSize: 14, fontWeight: '400', letterSpacing: 0 },
    padFieldError: { borderColor: p.danger },
    errorText: { color: p.danger, fontSize: 11, marginTop: -2, marginBottom: 8 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 8 },
    cancel: { color: p.muted, fontWeight: '700' },
    save: { backgroundColor: p.accent, borderRadius: 13, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
    saveFlash: { backgroundColor: '#2f8f5b' },
    saveTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
    secondarySave: { borderWidth: 1, borderColor: p.border, borderRadius: 13, paddingVertical: 11, alignItems: 'center' },
    secondarySaveText: { color: p.accent, fontSize: 10, fontWeight: '800' },
    dangerSave: { borderWidth: 1, borderColor: p.danger, backgroundColor: p.surfaceAlt, borderRadius: 13, paddingVertical: 11, alignItems: 'center' },
    dangerSaveText: { color: p.danger, fontSize: 10, fontWeight: '800' },
    divider: { height: 1, backgroundColor: p.border, marginTop: 20 },
    toggleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: p.border },
    toggleCopy: { flex: 1, paddingRight: 12 },
    toggleTitle: { color: p.text, fontSize: 11, fontWeight: '800' },
    toggleDetail: { color: p.muted, fontSize: 8.5, marginTop: 3 },
    disabledGroup: { opacity: 0.35 },
    textChoiceLabel: { color: p.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 18, marginBottom: 7 },
    textChoice: {
      minHeight: 52,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: p.border,
      padding: 11,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 7,
    },
    textChoiceActive: { borderColor: p.accent, backgroundColor: p.accentSoft },
    radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: p.muted, marginRight: 10 },
    radioActive: { borderWidth: 4, borderColor: p.accent },
    textChoiceText: { flex: 1, color: p.muted, fontSize: 10, lineHeight: 14 },
    legalLink: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    menuRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: p.border,
      paddingVertical: 8,
    },
    backRow: { marginBottom: 8, paddingVertical: 4 },
    backTxt: { color: p.accent, fontSize: 14, fontWeight: '700' },
    legalLinkText: { color: p.text, fontSize: 11, fontWeight: '700' },
    chev: { color: p.muted, fontSize: 22 },
    closeSettings: { height: 42, alignItems: 'center', justifyContent: 'center' },
    securityLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderTopWidth: 1, borderTopColor: p.border },
    securityLineLabel: { color: p.muted, fontSize: 11 },
    securityLineValue: { color: p.text, fontSize: 11, fontWeight: '800' },
    keyLabel: { color: p.accent, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, marginTop: 12 },
    personalKey: { color: p.text, fontSize: 14, fontWeight: '900', letterSpacing: 0.8, marginTop: 6 },
    deleteKey: { color: '#efbd67' },
    recoveryKey: { color: p.accent, fontSize: 10 },
    keyWarning: { color: '#9a7540', fontSize: 10, lineHeight: 15, marginTop: 16 },
    panicModalIcon: { color: p.danger, fontSize: 34, marginBottom: 8 },
    panicContinue: { backgroundColor: p.danger, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
    panicContinueText: { color: '#fff', fontWeight: '900' },
    iconChoice: {
      minHeight: 70,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: p.border,
      padding: 9,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    iconChoiceActive: { borderColor: p.accent, backgroundColor: p.accentSoft },
    iconChoiceImage: { width: 48, height: 48, borderRadius: 11, marginRight: 11 },
  });
}
