// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, BackHandler, Linking, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import CalculatorGate from './src/components/CalculatorGate';
import AppearanceSetup, { InitialSetup } from './src/components/AppearanceSetup';
import NevulaHome from './src/screens/NevulaHome';
import NevulaIntro from './src/screens/NevulaIntro';
import MessagesScreen from './src/screens/MessagesScreen';
import NotesScreen from './src/screens/NotesScreen';
import CameraScreen from './src/screens/CameraScreen';
import AccountDeletionScreen from './src/screens/AccountDeletionScreen';
import DeletionCodeSetup from './src/screens/DeletionCodeSetup';
import LegalPrivacyScreen from './src/screens/LegalPrivacyScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import { getLockoutState, hasExistingInstallData, loadUnlockCode, loadWipeCode, pinError, pinsMatch, recordFailedPin, recordUnlockSuccess, saveUnlockCode, saveWipeCode, wipePinError } from './src/lib/unlock';
import { wipeAllVaultData } from './src/lib/wipe';
import { refillUpcomingReminders } from './src/lib/calendar';
import { startMessageAlertListener } from './src/lib/messageAlerts';
import { registerRemotePushToken } from './src/lib/remotePush';
import { getNotificationPreferences } from './src/lib/notificationPreferences';
import { ensureNevulaIdentity, retractPublishedDirectoryIfSignedIn, watchPublishedDirectoryRetract } from './src/lib/identity';
import { acknowledgeDeletionCode, createDeletionCode, resumePendingDeletionSetup } from './src/lib/accountDeletion';
import { clearRevealedVaultCache } from './src/lib/media';
import { cancelVoiceRecording, clearVoicePlaybackCache } from './src/lib/voiceMessages';
import { shouldHoldAppLock, setVaultUnlocked } from './src/lib/appLock';
import UnlockSessionPicker from './src/components/UnlockSessionPicker';
import {
  clearUnlockSession,
  isUnlockSessionActiveSync,
  loadUnlockSession,
  startUnlockSession,
  type UnlockSessionOptionId,
} from './src/lib/unlockSession';
import * as Notifications from 'expo-notifications';
import { clearStoredNotificationBadge } from './src/lib/notificationPreferences';
import { ensurePersonalDeleteKey } from './src/lib/personalDeleteKey';
import { LauncherIconMode, loadLauncherIconMode, saveLauncherIconMode } from './src/lib/launcherIcon';
import { enforcePrivateContentExpiry, recordPrivateAccess } from './src/lib/inactivityExpiry';
import { ensureIdentityRecovery, recoverIdentity } from './src/lib/identityRecovery';
import { parseContactInvite } from './shared/contactInvite';
import { clearPendingContactInvite, loadPendingContactInvite, savePendingContactInvite } from './src/lib/pendingContactInvite';
import { DisplayThemeProvider, useDisplayTheme } from './src/lib/displayTheme';

type Stage = 'locked' | 'deletionSetup' | 'intro' | 'home' | 'messages' | 'notes' | 'calendar' | 'camera' | 'accountDeletion' | 'legalPrivacy';

/** Splash plays once per process start; later calculator→PIN unlocks skip it. */
let coldStartSplashPending = true;

export default function App() {
  return (
    <DisplayThemeProvider>
      <AppBody />
    </DisplayThemeProvider>
  );
}

function AppBody() {
  const { theme, palette } = useDisplayTheme();
  const [stage, setStage] = useState<Stage>('locked');
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [unlockCode, setUnlockCode] = useState<string | null>(null);
  const [wipeCode, setWipeCode] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [deletionSetup, setDeletionSetup] = useState<{ userId: string; nevulaId: string; deletionCode: string } | null>(null);
  const [setupCredentials, setSetupCredentials] = useState<{ nevulaId: string; deleteKey: string; recoveryId: string; recoveryKey: string } | null>(null);
  const [launcherIconMode, setLauncherIconMode] = useState<LauncherIconMode | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const appState = useRef(AppState.currentState);
  const stageRef = useRef(stage);
  const sessionExpiresAtRef = useRef<number | null>(null);
  stageRef.current = stage;
  sessionExpiresAtRef.current = sessionExpiresAt;

  useEffect(() => {
    let disposed = false;
    let receivedEvent = false;
    const receive = (url: string | null) => {
      const token = url ? parseContactInvite(url) : null;
      if (!token || disposed) return;
      setPendingInvite(token);
      savePendingContactInvite(token).catch(() => undefined);
    };
    const subscription = Linking.addEventListener('url', event => { receivedEvent = true; receive(event.url); });
    Promise.all([Linking.getInitialURL(), loadPendingContactInvite()]).then(([url, saved]) => {
      if (disposed || receivedEvent) return;
      if (url && parseContactInvite(url)) receive(url);
      else if (saved) setPendingInvite(saved);
    }).catch(() => undefined);
    return () => { disposed = true; subscription.remove(); };
  }, []);

  // Never navigate past the calculator/PIN or first-install setup from a URL.
  useEffect(() => {
    if (pendingInvite && ['home', 'notes', 'calendar', 'legalPrivacy'].includes(stage)) setStage('messages');
  }, [pendingInvite, stage]);
  const dismissInvite = () => {
    setPendingInvite(null);
    clearPendingContactInvite().catch(() => undefined);
  };

  const enterVault = () => {
    setVaultUnlocked(true);
    clearStoredNotificationBadge().catch(() => undefined);
    Notifications.setBadgeCountAsync(0).catch(() => undefined);
    if (coldStartSplashPending) {
      coldStartSplashPending = false;
      setStage('intro');
      return;
    }
    setStage('home');
  };

  const lockVault = () => {
    void clearUnlockSession();
    setSessionExpiresAt(null);
    setShowSessionPicker(false);
    setStage('locked');
    setVaultUnlocked(false);
    cancelVoiceRecording().catch(() => undefined);
    clearRevealedVaultCache().catch(() => undefined);
    clearVoicePlaybackCache().catch(() => undefined);
  };

  const beginUnlockSession = async (optionId: UnlockSessionOptionId) => {
    const session = await startUnlockSession(optionId);
    setSessionExpiresAt(session.expiresAt);
    setShowSessionPicker(false);
    enterVault();
  };

  const refreshLock = async () => {
    const lock = await getLockoutState();
    setLockedUntil(lock.lockedUntil);
    return lock;
  };

  useEffect(() => {
    enforcePrivateContentExpiry()
      .then(async () => Promise.all([loadUnlockCode(), loadWipeCode(), getLockoutState(), loadLauncherIconMode()]))
      .then(async ([code, storedWipeCode, lock, storedLauncherIconMode]) => {
        if (!code && await hasExistingInstallData()) {
          await wipeAllVaultData();
        }
        let unlock = await loadUnlockCode();
        let wipe = await loadWipeCode();
        let launcher = storedLauncherIconMode ?? (await loadLauncherIconMode());
        if (!launcher) {
          await saveLauncherIconMode('nevula');
          launcher = 'nevula';
        }
        setUnlockCode(unlock);
        setWipeCode(wipe);
        setLockedUntil(lock.lockedUntil);
        setLauncherIconMode(launcher);
        // Re-apply launcher + recents icon/label so App view matches Settings → Appearance.
        if (launcher) await saveLauncherIconMode(launcher).catch(() => undefined);
        if (unlock) {
          ensureNevulaIdentity()
            .then(async (identity) => {
              const { resetMessagingHistoryOnce } = await import('./src/lib/messagingReset');
              await resetMessagingHistoryOnce(identity.userId).catch(() => undefined);
            })
            .catch(() => undefined);
          const session = await loadUnlockSession();
          if (session) {
            setSessionExpiresAt(session.expiresAt);
            setVaultUnlocked(true);
            clearStoredNotificationBadge().catch(() => undefined);
            Notifications.setBadgeCountAsync(0).catch(() => undefined);
            if (coldStartSplashPending) {
              coldStartSplashPending = false;
              setStage('intro');
            } else {
              setStage('home');
            }
          }
        }
        retractPublishedDirectoryIfSignedIn().catch(() => undefined);
      })
      .catch(() => undefined)
      .finally(() => setBootstrapped(true));
  }, []);

  useEffect(() => {
    const stopAlerts = startMessageAlertListener();
    const stopRetract = watchPublishedDirectoryRetract();
    return () => {
      stopAlerts();
      stopRetract();
    };
  }, []);

  // Warm Messages list cache on the dashboard so opening chats is instant (local only).
  useEffect(() => {
    if (stage !== 'home') return;
    void (async () => {
      const identity = await ensureNevulaIdentity().catch(() => null);
      if (!identity?.userId) return;
      const { listChatListItems, listContacts, listContactRequests } = await import('./src/lib/messaging');
      const { loadContactAliases } = await import('./src/lib/contactAliases');
      const { loadVerifiedContacts } = await import('./src/lib/verifiedContacts');
      const { loadBlockedContacts } = await import('./src/lib/blockedContacts');
      const { listChatNevTorRequiredKeys } = await import('./src/lib/nevtor');
      const { loadChatListPrefs, sortChatsByPrefs } = await import('./src/lib/chatListPrefs');
      const { saveMessagesListCache } = await import('./src/lib/messagesListCache');
      const [nextContacts, nextChats, requestBundle, aliases, verifiedMap, blocked, torKeys, prefs] = await Promise.all([
        listContacts(identity.userId),
        listChatListItems(identity.userId),
        listContactRequests(identity.userId),
        loadContactAliases(identity.userId),
        loadVerifiedContacts(identity.userId),
        loadBlockedContacts(identity.userId),
        listChatNevTorRequiredKeys(identity.userId),
        loadChatListPrefs(identity.userId),
      ]);
      const rawRequests = requestBundle.pending;
      const mapped = nextContacts.map(contact => ({
        ...contact,
        alias: aliases[contact.userId] ?? null,
        verification: verifiedMap.get(contact.userId) ?? null,
        blocked: blocked.has(contact.userId),
      }));
      const mappedChats = nextChats.map(chat => ({
        ...chat,
        alias: chat.userId ? (aliases[chat.userId] ?? null) : null,
        verification: chat.userId ? (verifiedMap.get(chat.userId) ?? null) : null,
        blocked: chat.userId ? blocked.has(chat.userId) : false,
      }));
      const incoming = rawRequests.filter(r =>
        r.receiver_id === identity.userId
        && r.status === 'pending'
        && !blocked.has(r.sender_id)
        && !nextContacts.some(contact => contact.userId === r.sender_id),
      );
      await saveMessagesListCache({
        userId: identity.userId,
        savedAt: Date.now(),
        contacts: mapped,
        chats: sortChatsByPrefs(mappedChats, prefs),
        requests: incoming.map(r => ({ ...r, senderNevulaId: r.senderNevulaId ?? 'Unknown NEVULA ID' })),
        listPrefs: prefs,
        torChatKeys: [...torKeys],
      });
    })().catch(() => undefined);
  }, [stage]);

  // Re-register FCM after unlock so background Calculator push works without reopening Settings.
  useEffect(() => {
    if (stage !== 'home' && stage !== 'messages') return;
    void (async () => {
      const prefs = await getNotificationPreferences().catch(() => null);
      if (!prefs?.enabled) return;
      const identity = await ensureNevulaIdentity().catch(() => null);
      if (!identity?.userId) return;
      await registerRemotePushToken(identity.userId, prefs).catch(() => undefined);
    })();
  }, [stage]);

  useEffect(() => {
    const timer = setInterval(() => {
      enforcePrivateContentExpiry()
        .then(expired => {
          if (!expired) return;
          void clearUnlockSession();
          setSessionExpiresAt(null);
          setStage('locked');
          setVaultUnlocked(false);
          clearRevealedVaultCache().catch(() => undefined);
        })
        .catch(() => undefined);
    }, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (stageRef.current === 'locked' || showSessionPicker) return;
      const expires = sessionExpiresAtRef.current;
      if (expires == null) return;
      if (!isUnlockSessionActiveSync(expires)) lockVault();
    }, 5_000);
    return () => clearInterval(timer);
  }, [showSessionPicker]);

  useEffect(() => {
    const onStateChange = (nextState: AppStateStatus) => {
      const leavingForeground = appState.current === 'active' && nextState !== 'active';
      const returning = appState.current !== 'active' && nextState === 'active';
      if (leavingForeground) {
        if (shouldHoldAppLock()) {
          appState.current = nextState;
          return;
        }
        if (isUnlockSessionActiveSync(sessionExpiresAtRef.current)) {
          appState.current = nextState;
          return;
        }
        lockVault();
      }
      if (returning) {
        if (sessionExpiresAtRef.current != null && !isUnlockSessionActiveSync(sessionExpiresAtRef.current)) {
          lockVault();
        }
        enforcePrivateContentExpiry()
          .then(expired => {
            if (expired) {
              void clearUnlockSession();
              setSessionExpiresAt(null);
              setStage('locked');
              setVaultUnlocked(false);
              return;
            }
            refillUpcomingReminders().catch(() => undefined);
          })
          .catch(() => undefined);
      }
      appState.current = nextState;
    };
    const subscription = AppState.addEventListener('change', onStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = stageRef.current;
      if (current === 'messages' || current === 'notes' || current === 'calendar' || current === 'accountDeletion' || current === 'legalPrivacy') {
        setStage('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const changeUnlockCode = async (nextCode: string) => {
    const error = pinError(nextCode);
    if (error) throw new Error(error);
    await saveUnlockCode(nextCode);
    setUnlockCode(nextCode);
  };

  const changeWipeCode = async (nextCode: string) => {
    const error = wipePinError(nextCode);
    if (error) throw new Error(error);
    if (unlockCode && pinsMatch(nextCode, unlockCode)) throw new Error('The deletion code must differ from the unlock code.');
    await saveWipeCode(nextCode);
    setWipeCode(nextCode);
  };

  const panicWipe = async () => {
    dismissInvite();
    try {
      await wipeAllVaultData();
    } finally {
      await clearUnlockSession();
      setSessionExpiresAt(null);
      setShowSessionPicker(false);
      setUnlockCode(null);
      setWipeCode(null);
      setLockedUntil(null);
      setVaultUnlocked(false);
      setStage('locked');
    }
  };

  const onSetup = async (code: string) => {
    if (await hasExistingInstallData()) await wipeAllVaultData();
    await saveUnlockCode(code);
    await recordUnlockSuccess();
    await recordPrivateAccess();
    setUnlockCode(code);
    setLockedUntil(null);
    const identity = await ensureNevulaIdentity();
    const recovery = await ensureIdentityRecovery(identity);
    const deletionCode = await createDeletionCode(identity);
    const deleteKey = await ensurePersonalDeleteKey(identity.userId, identity.nevulaId);
    setSetupCredentials({ nevulaId: identity.nevulaId, deleteKey, ...recovery });
    setDeletionSetup({ userId: identity.userId, nevulaId: identity.nevulaId, deletionCode });
    setStage('deletionSetup');
  };

  const finishDeletionSetup = async () => {
    if (!deletionSetup) return;
    await acknowledgeDeletionCode(deletionSetup.userId);
    setDeletionSetup(null);
    setStage('locked');
    setShowSessionPicker(true);
  };

  const onUnlock = async () => {
    await enforcePrivateContentExpiry();
    await recordUnlockSuccess();
    await recordPrivateAccess();
    const pending = await resumePendingDeletionSetup();
    if (pending) {
      setDeletionSetup(pending);
      setStage('deletionSetup');
      return;
    }
    refillUpcomingReminders().catch(() => undefined);
    setShowSessionPicker(true);
  };

  const onFailedPin = async () => {
    const result = await recordFailedPin();
    if (result.action === 'wipe') {
      dismissInvite();
      try {
        await wipeAllVaultData();
      } finally {
        await clearUnlockSession();
        setSessionExpiresAt(null);
        setUnlockCode(null);
        setLockedUntil(null);
        setVaultUnlocked(false);
        setStage('locked');
      }
      return;
    }
    setLockedUntil(result.lockedUntil);
    await refreshLock();
  };

  const changeLauncherIcon = async (mode: LauncherIconMode) => {
    await saveLauncherIconMode(mode);
    setLauncherIconMode(mode);
  };

  const completeInitialSetup = async (setup: InitialSetup) => {
    if (!setup.unlockCode) {
      await changeLauncherIcon(setup.launcherIconMode);
      return;
    }
    const accessError = pinError(setup.unlockCode);
    if (accessError) throw new Error(accessError);
    if (setup.wipeCode) {
      const deleteError = wipePinError(setup.wipeCode);
      if (deleteError) throw new Error(deleteError);
      if (pinsMatch(setup.unlockCode, setup.wipeCode)) throw new Error('The deletion code must differ from the access code.');
    }
    // Setup must never hang on Tor — clearnet for identity creation.
    try {
      const { nevTorManager } = await import('./src/lib/nevtor');
      await nevTorManager.setRoutingMode('OFF');
    } catch {
      // Continue; anonymous sign-in still attempted.
    }
    if (await hasExistingInstallData()) await wipeAllVaultData();
    let identity;
    try {
      const recovered = setup.recoveryId && setup.recoveryKey
        ? await recoverIdentity({ recoveryId: setup.recoveryId, recoveryKey: setup.recoveryKey })
        : null;
      identity = recovered?.identity ?? await ensureNevulaIdentity();
      const recovery = recovered
        ? { recoveryId: setup.recoveryId!, recoveryKey: setup.recoveryKey! }
        : await ensureIdentityRecovery(identity);
      const deleteKey = await ensurePersonalDeleteKey(identity.userId, identity.nevulaId);
      const deletionCode = await createDeletionCode(identity);
      await saveUnlockCode(setup.unlockCode);
      if (setup.wipeCode) await saveWipeCode(setup.wipeCode);
      await saveLauncherIconMode(setup.launcherIconMode);
      await recordUnlockSuccess();
      await recordPrivateAccess();
      setUnlockCode(setup.unlockCode);
      setWipeCode(setup.wipeCode ?? null);
      setLauncherIconMode(setup.launcherIconMode);
      setLockedUntil(null);
      setSetupCredentials({ nevulaId: identity.nevulaId, deleteKey, ...recovery });
      setDeletionSetup({ userId: identity.userId, nevulaId: identity.nevulaId, deletionCode });
      setStage('deletionSetup');
    } catch (error: any) {
      const detail = error?.message ?? String(error ?? 'unknown');
      throw new Error(
        detail.includes('network') || detail.includes('fetch') || detail.includes('Failed to fetch')
          ? `Setup needs an internet connection (NevTOR off). ${detail}`
          : detail,
      );
    }
  };

  // Unlock calculator is always black. Light palette only after vault unlock.
  const vaultChrome = stage === 'home' || stage === 'messages' || stage === 'notes' || stage === 'calendar' || stage === 'camera' || stage === 'accountDeletion' || stage === 'legalPrivacy';
  const shellBg = vaultChrome ? palette.bg : '#000000';
  const statusStyle = vaultChrome && theme === 'light' ? 'dark' : 'light';

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: shellBg }]}>
      <StatusBar style={statusStyle} />
      {bootstrapped && (!unlockCode || !launcherIconMode) && <AppearanceSetup iconOnly={!!unlockCode} onComplete={completeInitialSetup} />}
      {bootstrapped && unlockCode && launcherIconMode && stage === 'locked' && !showSessionPicker && (
        <CalculatorGate
          unlockCode={unlockCode}
          wipeCode={wipeCode}
          lockedUntil={lockedUntil}
          onUnlock={onUnlock}
          onSetup={onSetup}
          onFailedPin={onFailedPin}
          onPanicWipe={panicWipe}
        />
      )}
      <UnlockSessionPicker visible={showSessionPicker} onChoose={(id) => { void beginUnlockSession(id); }} />
      {stage === 'deletionSetup' && deletionSetup && <DeletionCodeSetup deletionCode={deletionSetup.deletionCode} nevulaId={deletionSetup.nevulaId} onConfirmed={finishDeletionSetup} />}
      {stage === 'intro' && <NevulaIntro onFinished={() => setStage('home')} />}
      {launcherIconMode && stage === 'home' && <NevulaHome launcherIconMode={launcherIconMode} onChangeLauncherIcon={changeLauncherIcon} initialCredentials={setupCredentials} onCredentialsShown={()=>setSetupCredentials(null)} onChangeUnlockCode={changeUnlockCode} onChangeWipeCode={changeWipeCode} onVerifyUnlockCode={candidate=>!!unlockCode&&pinsMatch(candidate,unlockCode)} onPanicWipe={panicWipe} onOpenAccountDeletion={() => setStage('accountDeletion')} onOpenLegalPrivacy={() => setStage('legalPrivacy')} onOpenMessages={() => setStage('messages')} onOpenNotes={() => setStage('notes')} onOpenCalendar={() => setStage('calendar')} onOpenCamera={() => setStage('camera')} />}
      {stage === 'messages' && <MessagesScreen onBack={() => setStage('home')} inviteToken={pendingInvite} onInviteDismiss={dismissInvite} />}
      {stage === 'notes' && <NotesScreen onBack={() => setStage('home')} onOpenMessages={() => setStage('messages')} />}
      {stage === 'calendar' && <CalendarScreen onBack={() => setStage('home')} onOpenMessages={() => setStage('messages')} />}
      {stage === 'camera' && <CameraScreen onBack={() => setStage('home')} onOpenMessages={() => setStage('messages')} />}
      {stage === 'accountDeletion' && (
        <AccountDeletionScreen
          onBack={() => setStage('home')}
          onVerifyUnlockCode={(candidate) => !!unlockCode && pinsMatch(candidate, unlockCode)}
          onPanicWipe={panicWipe}
        />
      )}
      {stage === 'legalPrivacy' && <LegalPrivacyScreen onBack={() => setStage('home')} />}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000000' } });
