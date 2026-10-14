// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRAND_EYEBROW, HomePalette, useDisplayTheme } from '../lib/displayTheme';
import { ActivityIndicator, Alert, BackHandler, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScrollView, Swipeable } from 'react-native-gesture-handler';
import { androidStatusInset } from '../lib/statusInset';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ensureNevulaIdentity, getCachedNevulaIdentity, NevulaIdentity } from '../lib/identity';
import { loadContactAliases, saveContactAlias } from '../lib/contactAliases';
import { checkContactKeys, forgetContactKeys, rememberContactKeys } from '../lib/contactKeys';
import { loadVerifiedContacts, markContactVerified, unverifyContact, type VerificationMethod } from '../lib/verifiedContacts';
import { loadChatModulation, saveChatModulation } from '../lib/chatModulation';
import { hideMessageForMe, loadHiddenMessageIds } from '../lib/hiddenMessages';
import { createPairingQrPayload, formatNevulaIdInput, parsePairingQrPayload } from '../lib/pairing';
import { loadMessagesListCache, peekMessagesListCache, saveMessagesListCache } from '../lib/messagesListCache';
import VoiceMessageBubble from '../components/VoiceMessageBubble';
import ChatMediaBubble from '../components/ChatMediaBubble';
import MicButtonGlyph from '../components/MicButtonGlyph';
import PaperclipGlyph from '../components/PaperclipGlyph';
import OrbotOnionMark from '../components/OrbotOnionMark';
import { androidBottomInset } from '../lib/insets';
import {
  MAX_VOICE_MS,
  VOICE_MODES,
  cancelVoiceRecording,
  formatVoiceClock,
  isVoiceCaptureAvailable,
  parseVoicePayload,
  playVoicePayload,
  prepareVoiceEngine,
  sendDisguisedVoice,
  startVoiceRecording,
  stopAndDisguiseVoice,
  stopVoicePlayback,
} from '../lib/voiceMessages';
import type { VoiceMode } from '../lib/voiceMessages';
import { askDevicePermission } from '../lib/devicePermission';
import { listVaultItems, revealVaultItem, type VaultItem } from '../lib/media';
import { parseVaultMediaPayload, sendVaultItem } from '../lib/vaultMedia';
import {
  Contact,
  ContactRequest,
  ChatListItem,
  DecryptedMessage,
  DEFAULT_RETENTION,
  RetentionSetting,
  announceThreadInvite,
  confirmThreadMembership,
  createConversationWith,
  deleteEncryptedMessageForEveryone,
  findUserByNevulaId,
  getProfileByUserId,
  getConversationRetention,
  getDefaultRetention,
  getActivePublicKeys,
  inviteToChat,
  confirmPendingThreadMember,
  leaveChatThread,
  listChatListItems,
  listContactRequests,
  listContacts,
  loadConversationMessages,
  loadConversationMessagesLocal,
  cancelOutgoingContactRequest,
  dismissIncomingContactRequest,
  respondToContactRequest,
  retentionToMs,
  setConversationRetention,
  setDefaultRetention,
  sendContactRequest,
  sendEncryptedMessage,
  sendEncryptedThreadMessage,
  sendPairingAck,
  sendPairingDecline,
  subscribeToConversation,
} from '../lib/messaging';

function chatLocaleDe() {
  try {
    return (Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase().startsWith('de');
  } catch {
    return false;
  }
}

function sendStatusCopy() {
  if (chatLocaleDe()) {
    return {
      pending: 'wird gesendet…',
      sent: '✓ · ',
      failed: 'fehlgeschlagen – tippen zum Wiederholen · ',
      failTitle: 'Senden fehlgeschlagen',
      failBody: 'Die Nachricht wurde nicht gesendet.',
      retry: 'Erneut senden',
      ok: 'OK',
    };
  }
  return {
    pending: 'sending…',
    sent: '✓ · ',
    failed: 'failed — tap to retry · ',
    failTitle: 'Encrypted send failed',
    failBody: 'Message was not sent.',
    retry: 'Retry',
    ok: 'OK',
  };
}

function mergeThreadMessages(current: DecryptedMessage[], next: DecryptedMessage[], hidden: Set<string>) {
  const deliveryById = new Map(
    current.filter(row => row.delivery).map(row => [row.id, row.delivery!] as const),
  );
  const pendingLocal = current.filter(row => row.delivery === 'pending' || row.delivery === 'failed');
  const merged = next
    .filter(item => !hidden.has(item.id))
    .map(item => {
      const delivery = deliveryById.get(item.id);
      return delivery ? { ...item, delivery } : item;
    });
  for (const local of pendingLocal) {
    if (!merged.some(row => row.id === local.id || (row.plaintext === local.plaintext && row.senderId === local.senderId && row.delivery === 'sent'))) {
      merged.push(local);
    }
  }
  return merged;
}
import { createDmThread, getChatThread, markThreadConfirmed, upsertChatThread } from '../lib/chatThreads';
import {
  loadChatListPrefs,
  pinnedToneFor,
  reorderChatInList,
  setChatPinned,
  sortChatsByPrefs,
  type ChatListPrefs,
} from '../lib/chatListPrefs';
import ChatListSwipeRow from '../components/ChatListSwipeRow';
import {
  acknowledgeInAppUnreadAfterOpeningChat,
  acknowledgeAllInAppUnreadOrphans,
  setActiveUnreadChatPeer,
  subscribeInAppUnreadSnapshot,
  unreadCountLabel,
  unreadLabel,
} from '../lib/inAppUnread';
import { consumeInboxQuiet } from '../lib/messageAlerts';
import { resetMessagingHistoryOnce } from '../lib/messagingReset';
import { listSealedInboxForConversation } from '../lib/sealedInbox';
import { supabase } from '../lib/supabase';
import { loadBlockedContacts, setContactBlocked } from '../lib/blockedContacts';
import { resetRatchetSession } from '../lib/sessionRatchet';
import { clearOutgoingPairing } from '../lib/localPairing';
import { removeLocalContact } from '../lib/localContacts';
import PublicContactInvite from '../components/PublicContactInvite';
import { parseContactInvite } from '../../shared/contactInvite';
import {
  getPeerNevTorStatus,
  nevTorCapabilitySync,
  nevTorManager,
  useNevTorSnapshot,
  type PeerNevTorCapability,
  chatRequiresNevTor,
  getMyChatNevTorRequire,
  getPeerChatNevTorRequire,
  hasMyChatNevTorDecision,
  listChatNevTorRequiredKeys,
  setMyChatNevTorRequire,
  encodeChatNevTorRequire,
} from '../lib/nevtor';
import { openOrbotApp as launchOrbot } from '../lib/openOrbot';
import AvatarFace from '../components/AvatarFace';
import AvatarSheet from '../components/AvatarSheet';
import {
  avatarCopy,
  captureAvatar,
  clearSelfAvatar,
  peerAvatarUri,
  pickPhoneAvatar,
  prepareAvatarFile,
  selfAvatarUri,
  subscribeAvatars,
} from '../lib/profileAvatar';
import { publishProfileAvatar } from '../lib/messaging';

type Props = { onBack: () => void; inviteToken?: string | null; onInviteDismiss?: () => void };
type Tab = 'chats' | 'contacts';
type PendingView = ContactRequest & {
  senderNevulaId: string;
  source?: 'public_invite';
  trust?: 'in_person' | 'key';
  rechat?: boolean;
  conversationId?: string;
  tor?: boolean;
};
type UiContact = Contact & { alias: string | null; verification: VerificationMethod | null; blocked: boolean };
type UiChat = ChatListItem & { alias: string | null; verification: VerificationMethod | null; blocked: boolean };

function groupPeopleLabel(memberCount: number) {
  const n = Math.max(1, memberCount);
  return n === 1 ? '1 Nevula Member' : `${n} Nevula Members`;
}

function labelFor(contact: { alias: string | null; displayName: string | null; nevulaId: string; title?: string | null; kind?: string; memberIds?: string[] }) {
  if (contact.kind === 'group') {
    // List + chat header: member count only — never NVL IDs / keys in the bubble.
    return groupPeopleLabel((contact.memberIds?.length ?? 0) + 1);
  }
  return (
    contact.alias?.trim()
    || contact.nevulaId?.trim()
    || 'Unnamed contact'
  );
}

/** NEVULA ID / key only when no private alias is set. */
function hasChosenName(contact: { alias: string | null; displayName?: string | null; title?: string | null; kind?: string }) {
  if (contact.kind === 'group') return true;
  return Boolean(contact.alias?.trim());
}

/** Secondary line only for blocked — groups show count as the primary label only. */
function chatListSubtitle(chat: {
  alias: string | null;
  blocked?: boolean;
  kind?: string;
  memberIds?: string[];
  title?: string | null;
}) {
  if (chat.blocked) return 'Blocked on this device';
  return null;
}

export default function MessagesScreen({ onBack, inviteToken, onInviteDismiss }: Props) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const conversationRef = useRef<ScrollView>(null);
  const scrollChatToEnd = useCallback((animated = true) => {
    const run = () => conversationRef.current?.scrollToEnd({ animated });
    requestAnimationFrame(run);
    setTimeout(run, 40);
    setTimeout(run, 160);
  }, []);
  const voiceFinishingRef = useRef(false);
  const mountedRef = useRef(true);
  const voiceModeRef = useRef<VoiceMode | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [identity, setIdentity] = useState<NevulaIdentity | null>(null);
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);
  const [peerAvatars, setPeerAvatars] = useState<Record<string, string>>({});
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [avatarVault, setAvatarVault] = useState(false);
  const [avatarPhotos, setAvatarPhotos] = useState<VaultItem[]>([]);
  const [contacts, setContacts] = useState<UiContact[]>([]);
  const refreshAvatars = useCallback(async (list: UiContact[]) => {
    setSelfAvatar(await selfAvatarUri().catch(() => null));
    const next: Record<string, string> = {};
    for (const contact of list) {
      const uri = await peerAvatarUri(contact.userId).catch(() => null);
      if (uri) next[contact.userId] = uri;
    }
    setPeerAvatars(next);
  }, []);
  useEffect(() => { void refreshAvatars(contacts); }, [contacts, refreshAvatars]);
  useEffect(() => subscribeAvatars(() => { void refreshAvatars(contacts); }), [contacts, refreshAvatars]);
  const shareAvatar = useCallback(async (plaintext: string) => {
    if (!identity) return;
    await publishProfileAvatar(identity.userId, plaintext);
  }, [identity]);
  const saveAvatarResult = useCallback(async (prepared: { plaintext: string } | null) => {
    if (!prepared) return;
    setSelfAvatar(await selfAvatarUri().catch(() => null));
    await shareAvatar(prepared.plaintext);
    setAvatarSheet(false);
    setAvatarVault(false);
  }, [shareAvatar]);
  const onAvatarGallery = useCallback(async () => {
    try { await saveAvatarResult(await pickPhoneAvatar()); }
    catch (error: any) { Alert.alert(avatarCopy().title, error?.message ?? avatarCopy().failed); }
  }, [saveAvatarResult]);
  const onAvatarCamera = useCallback(async () => {
    try { await saveAvatarResult(await captureAvatar()); }
    catch (error: any) { Alert.alert(avatarCopy().title, error?.message ?? avatarCopy().failed); }
  }, [saveAvatarResult]);
  const onAvatarRemove = useCallback(async () => {
    try {
      const cleared = await clearSelfAvatar();
      setSelfAvatar(null);
      await shareAvatar(cleared.plaintext);
      setAvatarSheet(false);
    } catch (error: any) {
      Alert.alert(avatarCopy().title, error?.message ?? avatarCopy().failed);
    }
  }, [shareAvatar]);
  const onAvatarNevula = useCallback(async () => {
    try {
      const photos = (await listVaultItems()).filter(item => item.kind === 'photo');
      setAvatarPhotos(photos);
      setAvatarSheet(false);
      setAvatarVault(true);
    } catch (error: any) {
      Alert.alert(avatarCopy().title, error?.message ?? avatarCopy().failed);
    }
  }, []);
  const onAvatarVaultPhoto = useCallback(async (item: VaultItem) => {
    try { await saveAvatarResult(await prepareAvatarFile(await revealVaultItem(item))); }
    catch (error: any) { Alert.alert(avatarCopy().title, error?.message ?? avatarCopy().failed); }
  }, [saveAvatarResult]);
  const [chats, setChats] = useState<UiChat[]>([]);
  const [requests, setRequests] = useState<PendingView[]>([]);
  const [outgoingPending, setOutgoingPending] = useState<Array<{ peerUserId: string; label: string }>>([]);
  const [activeChat, setActiveChat] = useState<UiChat | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePick, setInvitePick] = useState<Set<string>>(() => new Set());
  const [newChatPeerId, setNewChatPeerId] = useState<string | null>(null);
  const [listPrefs, setListPrefs] = useState<ChatListPrefs>({ pinned: [], order: [], hidden: [] });
  const [chatListScrollLock, setChatListScrollLock] = useState(false);
  const [swipeCloseSignal, setSwipeCloseSignal] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragDyRef = useRef(0);
  const filteredChatsRef = useRef<UiChat[]>([]);
  const pairingPromptedRef = useRef<Set<string>>(new Set());
  const pairingDeclineNotifiedRef = useRef<Set<string>>(new Set());
  const rechatAnnouncedRef = useRef<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('chats');
  const [query, setQuery] = useState('');
  const [newId, setNewId] = useState('NVL-');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const setupHoldRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [inboxLoading, setInboxLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showMyId, setShowMyId] = useState(false);
  const [showPublicLink, setShowPublicLink] = useState(false);
  const [scannedInvite, setScannedInvite] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerLive, setScannerLive] = useState(false);
  const [qrScanned, setQrScanned] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showDefaultRetention, setShowDefaultRetention] = useState(false);
  const [showChatRetention, setShowChatRetention] = useState(false);
  const [defaultRetention, setDefaultRetentionState] = useState<RetentionSetting>(DEFAULT_RETENTION);
  const [chatRetention, setChatRetention] = useState<RetentionSetting | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<UiContact | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [failedVoiceId, setFailedVoiceId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode | null>(null);
  const [showModulation, setShowModulation] = useState(false);
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [requestSentInfo, setRequestSentInfo] = useState<{ label: string; detail: string; status: 'pending' | 'confirmed' } | null>(null);
  const [incomingRequestModal, setIncomingRequestModal] = useState<PendingView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DecryptedMessage | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [nevTorBusy, setNevTorBusy] = useState(false);
  const [peerNevTor, setPeerNevTor] = useState<PeerNevTorCapability | null>(null);
  const [chatRequireMine, setChatRequireMine] = useState(false);
  const [chatRequirePeer, setChatRequirePeer] = useState(false);
  const [torChatKeys, setTorChatKeys] = useState<Set<string>>(() => new Set());
  const nevTorSnapshot = useNevTorSnapshot();
  const torLive =
    nevTorSnapshot.routingMode !== 'OFF'
    && nevTorSnapshot.torReady
    && nevTorSnapshot.connection === 'connected';
  const chatNeedsTor = chatRequiresNevTor(chatRequireMine, chatRequirePeer) || Boolean(activeChat?.torRequired);
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const torAskPeerRef = useRef<string | null>(null);
  const setChatRequireRef = useRef<(required: boolean) => Promise<void>>(async () => undefined);
  voiceModeRef.current = voiceMode;

  useEffect(() => {
    let cancelled = false;
    if (!identity || !activeChat) {
      setPeerNevTor(null);
      setChatRequireMine(false);
      setChatRequirePeer(false);
      return;
    }
    const requireKey = activeChat.conversationId;
    const peerId = activeChat.userId || activeChat.memberIds[0] || '';
    void Promise.all([
      peerId ? getPeerNevTorStatus(identity.userId, peerId) : Promise.resolve(null),
      getMyChatNevTorRequire(identity.userId, requireKey),
      getPeerChatNevTorRequire(identity.userId, requireKey),
      hasMyChatNevTorDecision(identity.userId, requireKey),
      getChatThread(identity.userId, requireKey),
    ]).then(([status, mine, peer, decided, thread]) => {
      if (cancelled) return;
      setPeerNevTor(status);
      setChatRequireMine(mine || thread?.torRequired === true);
      setChatRequirePeer(peer);
      setTorChatKeys(prev => {
        const next = new Set(prev);
        if (mine || peer || thread?.torRequired) next.add(requireKey);
        else next.delete(requireKey);
        return next;
      });
      // Invited to a Tor chat: must confirm Orbot rules before writing.
      if (thread?.torRequired && thread.confirmations[identity.userId] !== true) {
        const askKey = `confirm:${requireKey}`;
        if (torAskPeerRef.current === askKey) return;
        torAskPeerRef.current = askKey;
        Alert.alert(
          'Join Orbot chat?',
          'This chat requires Orbot. Confirm to enter — the same Tor rules apply and cannot be turned off later.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Confirm Orbot',
              onPress: () => {
                void confirmThreadMembership({ myUserId: identity.userId, conversationId: requireKey })
                  .then(() => refresh(identity))
                  .catch((error: any) => Alert.alert('NevTOR', error?.message ?? 'Could not confirm.'));
              },
            },
          ],
          { cancelable: false },
        );
        return;
      }
      // Legacy default DM: one-time Orbot question (only for non-invite threads).
      if (activeChat.strictConfirm || decided || torAskPeerRef.current === requireKey) return;
      if (activeChat.kind === 'group') return;
      torAskPeerRef.current = requireKey;
      Alert.alert(
        'Orbot for this chat?',
        'Require Orbot so messages in this chat can only be opened when Tor is connected. NEVULA still works fully without Tor if you choose No.',
        [
          { text: 'No — without Tor', style: 'cancel', onPress: () => { void setChatRequireRef.current(false); } },
          { text: 'Yes — require Orbot', onPress: () => { void setChatRequireRef.current(true); } },
        ],
        { cancelable: false },
      );
    });
    const timer = setInterval(() => {
      void Promise.all([
        peerId ? getPeerNevTorStatus(identity.userId, peerId) : Promise.resolve(null),
        getPeerChatNevTorRequire(identity.userId, requireKey),
        getChatThread(identity.userId, requireKey),
      ]).then(([status, peer, thread]) => {
        if (cancelled) return;
        setPeerNevTor(status);
        setChatRequirePeer(peer);
        if (thread?.torRequired) setChatRequireMine(true);
        setTorChatKeys(prev => {
          const next = new Set(prev);
          if (peer || thread?.torRequired) next.add(requireKey);
          return next;
        });
        if (thread) {
          const mineOk = thread.confirmations[identity.userId] === true || !thread.torRequired;
          setActiveChat(current => current && current.conversationId === requireKey
            ? {
                ...current,
                kind: thread.memberIds.length > 1 ? 'group' : current.kind,
                memberIds: thread.memberIds,
                writeReady: mineOk,
                pendingConfirms: [identity.userId, ...thread.memberIds].filter(id => thread.confirmations[id] !== true).length,
                pendingMemberIds: Object.keys(thread.pendingMembers ?? {}),
                torRequired: thread.torRequired,
                strictConfirm: thread.torRequired || thread.memberIds.length > 1 || current.strictConfirm,
              }
            : current);
        }
      });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [identity?.userId, activeChat?.conversationId, messages.length]);

  const refresh = async (id = identity) => {
    if (!id) return;
    // Do not full-consume here — that blocks the UI for minutes over Tor.
    const requestBundle = await listContactRequests(id.userId);
    const [nextContacts, nextChats, aliases, verifiedMap, blocked, torKeys, prefs] = await Promise.all([
      listContacts(id.userId),
      listChatListItems(id.userId),
      loadContactAliases(id.userId),
      loadVerifiedContacts(id.userId),
      loadBlockedContacts(id.userId),
      listChatNevTorRequiredKeys(id.userId),
      loadChatListPrefs(id.userId),
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
    setContacts(mapped);
    setListPrefs(prefs);
    setChats(sortChatsByPrefs(mappedChats, prefs));
    setTorChatKeys(torKeys);
    setActiveChat(current => {
      if (!current) return current;
      return mappedChats.find(chat => chat.conversationId === current.conversationId) ?? current;
    });
    const incoming = rawRequests.filter(r => r.receiver_id === id.userId && r.status === 'pending' && !blocked.has(r.sender_id) && !nextContacts.some(contact => contact.userId === r.sender_id));
    const enriched = await Promise.all(incoming.map(async request => {
      const profile = await getProfileByUserId(request.sender_id);
      return { ...request, senderNevulaId: profile?.nevula_id ?? request.senderNevulaId ?? 'Unknown NEVULA ID' };
    }));
    setRequests(enriched);
    const { listOutgoingPairings } = await import('../lib/localPairing');
    const outgoing = await listOutgoingPairings(id.userId).catch(() => []);
    const knownIds = new Set(nextContacts.map(c => c.userId));
    const outgoingRows = await Promise.all(
      outgoing
        .filter(row => !knownIds.has(row.peerUserId))
        .map(async row => {
          const profile = await getProfileByUserId(row.peerUserId).catch(() => null);
          return {
            peerUserId: row.peerUserId,
            label: profile?.nevula_id ?? 'Pending contact',
          };
        }),
    );
    setOutgoingPending(outgoingRows);
    for (const decline of requestBundle.declines) {
      if (pairingDeclineNotifiedRef.current.has(decline.blobId)) continue;
      pairingDeclineNotifiedRef.current.add(decline.blobId);
      Alert.alert(
        'Request declined',
        `${decline.nevulaId || 'They'} declined your contact request. No chat was created.`,
      );
    }
    void saveMessagesListCache({
      userId: id.userId,
      savedAt: Date.now(),
      contacts: mapped,
      chats: sortChatsByPrefs(mappedChats, prefs),
      requests: enriched,
      listPrefs: prefs,
      torChatKeys: [...torKeys],
    });
    // Surface pairing requests immediately — modal with Accept / Decline.
    // A rechat request opens the chat and shows Accept / Decline there.
    for (const request of enriched) {
      if (pairingPromptedRef.current.has(request.id)) continue;
      pairingPromptedRef.current.add(request.id);
      if (request.rechat) {
        const chat = mappedChats.find(item => item.conversationId === request.conversationId || item.userId === request.sender_id);
        if (chat) {
          setTab('chats');
          setActiveChat(chat);
        }
        continue;
      }
      setIncomingRequestModal(request);
      setTab('contacts');
      void (async () => {
        try {
          const prefs = await import('../lib/notificationPreferences').then(m => m.getNotificationPreferences());
          if (prefs.enabled && prefs.contactRequests !== false) {
            const { presentDisguisedMessageAlert } = await import('../lib/messageAlerts');
            await presentDisguisedMessageAlert().catch(() => undefined);
          }
        } catch {
          // Optional push only.
        }
      })();
      break;
    }
  };

  useEffect(() => {
    let mounted = true;
    const safety = setTimeout(() => {
      if (!mounted || setupHoldRef.current) return;
      setLoading(false);
    }, 18_000);

    (async () => {
      try {
        setBootError(null);
        setLoading(false);
        const warm = getCachedNevulaIdentity();
        if (warm) {
          setIdentity(warm);
          const snap = peekMessagesListCache(warm.userId) ?? await loadMessagesListCache(warm.userId).catch(() => null);
          if (mounted && snap) {
            setContacts(snap.contacts as UiContact[]);
            setChats(snap.chats as UiChat[]);
            setRequests(snap.requests as PendingView[]);
            setListPrefs(snap.listPrefs);
            setTorChatKeys(new Set(snap.torChatKeys));
            setLoading(false);
          }
        }

        const nextIdentity = await ensureNevulaIdentity();
        if (!mounted) return;
        setIdentity(nextIdentity);
        if (!warm) {
          const snap = await loadMessagesListCache(nextIdentity.userId).catch(() => null);
          if (mounted && snap) {
            setContacts(snap.contacts as UiContact[]);
            setChats(snap.chats as UiChat[]);
            setRequests(snap.requests as PendingView[]);
            setListPrefs(snap.listPrefs);
            setTorChatKeys(new Set(snap.torChatKeys));
            setLoading(false);
          }
        }
        const wiped = await resetMessagingHistoryOnce(nextIdentity.userId).catch(() => false);
        if (wiped && mounted) {
          setMessages([]);
          setUnreadCount(0);
          setUnreadByConversation({});
          Alert.alert(
            'Chat history cleared',
            'All stuck/old messages, badges and Calculator alerts were wiped. Contacts stay. Send a short new test both ways (NevTOR/Orbot only if the chat requires it).',
          );
        }
        void nevTorManager.bootstrap().catch(() => undefined);
        nevTorCapabilitySync.bind({
          myUserId: nextIdentity.userId,
          send: (params) => sendEncryptedMessage({ ...params, skipOutbox: true }),
          listContacts: (userId) => listContacts(userId),
        });
        getDefaultRetention(nextIdentity.userId).then(value => { if (mounted) setDefaultRetentionState(value); }).catch(() => undefined);
        await refresh(nextIdentity).catch(error => {
          if (!mounted || setupHoldRef.current) return;
          const msg = String(error?.message ?? '');
          if (/network|fetch|Failed to fetch/i.test(msg)) {
            setBootError('Opening chats is taking too long. Check the connection, or turn NevTOR off and retry.');
          }
        });
      } catch (error: any) {
        if (mounted && !setupHoldRef.current) {
          const msg = String(error?.message ?? '');
          if (/network|fetch|Failed to fetch/i.test(msg)) {
            setBootError('Opening chats is taking too long. Check the connection, or turn NevTOR off and retry.');
          }
        }
      } finally {
        clearTimeout(safety);
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
      clearTimeout(safety);
    };
  }, [bootAttempt]);

  useEffect(() => {
    mountedRef.current = true;
    prepareVoiceEngine().catch(() => undefined);
    const stopUnread = subscribeInAppUnreadSnapshot(snap => {
      setUnreadCount(snap.count);
      setUnreadByConversation(snap.byConversation);
    });
    return () => {
      mountedRef.current = false;
      voiceFinishingRef.current = false;
      stopUnread();
      setActiveUnreadChatPeer(null);
      cancelVoiceRecording().catch(() => undefined);
      stopVoicePlayback().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    setActiveUnreadChatPeer(activeChat?.conversationId ?? null, {
      ackOnArrive: Boolean(activeChat) && (!chatNeedsTor || torLive),
    });
    return () => setActiveUnreadChatPeer(null);
  }, [activeChat?.conversationId, chatNeedsTor, torLive]);

  // While browsing the chat list (or home path into Messages), keep pulling sealed inbox.
  useEffect(() => {
    if (!identity?.userId || activeChat) return;
    const pull = () => {
      void (async () => {
        await consumeInboxQuiet(identity.userId).catch(() => undefined);
        // Drop peerless leftovers while browsing the list — they stick on the dashboard otherwise.
        await acknowledgeAllInAppUnreadOrphans().catch(() => undefined);
      })();
    };
    pull();
    const timer = setInterval(pull, 12_000);
    return () => clearInterval(timer);
  }, [identity?.userId, activeChat?.conversationId]);

  const clearUnreadForOpenChat = async (inboundIds: string[]) => {
    if (!activeChat || !identity) return;
    const sealed = await listSealedInboxForConversation(
      identity.userId,
      activeChat.conversationId,
      activeChat.memberIds?.length ? activeChat.memberIds : (activeChat.userId ? [activeChat.userId] : undefined),
    ).catch(() => [] as { id: string }[]);
    await acknowledgeInAppUnreadAfterOpeningChat(
      activeChat.conversationId,
      inboundIds,
      sealed.map(item => item.id),
    ).catch(() => undefined);
  };

  const reloadActiveChat = async () => {
    if (!activeChat || !identity) return;
    setInboxLoading(true);
    const safety = setTimeout(() => {
      if (mountedRef.current) setInboxLoading(false);
    }, 8000);
    try {
      const [next, hidden] = await Promise.all([
        loadConversationMessages(activeChat.conversationId, identity.userId, activeChat.userId || activeChat.memberIds[0], {
          memberIds: activeChat.memberIds,
        }),
        loadHiddenMessageIds(identity.userId),
      ]);
      if (!mountedRef.current) return;
      hiddenIdsRef.current = new Set(hidden);
      setMessages(current => mergeThreadMessages(current, next, hiddenIdsRef.current));
      // Opening the thread always clears that peer's unread — even if Tor-locked UI.
      const inboundIds = next
        .filter(item => item.senderId !== identity.userId)
        .map(item => item.id);
      await clearUnreadForOpenChat(inboundIds);
    } finally {
      clearTimeout(safety);
      if (mountedRef.current) setInboxLoading(false);
    }
  };

  const recheckChatTor = async () => {
    // Recheck only — never auto-enable NevTOR from the onion.
    if (nevTorSnapshot.routingMode === 'OFF') {
      Alert.alert('NevTOR', 'NevTOR is off. Use the NevTOR switch to turn it on, then Recheck.');
      return;
    }
    if (nevTorBusy) return;
    try {
      setNevTorBusy(true);
      await nevTorManager.refresh();
      if (activeChat?.userId) {
        await nevTorCapabilitySync.announceToPeer({
          userId: activeChat.userId,
          conversationId: activeChat.conversationId,
        }).catch(() => undefined);
        await reloadActiveChat().catch(() => undefined);
      }
      const snap = nevTorManager.getSnapshot();
      if (!(snap.torReady && snap.connection === 'connected')) {
        Alert.alert(
          'Orbot',
          snap.lastError ?? 'Orbot is not confirmed yet. Open Orbot, start the VPN, then tap the onion again.',
        );
      }
    } catch (error: any) {
      Alert.alert('NevTOR', error?.message ?? 'Could not recheck Orbot.');
    } finally {
      setNevTorBusy(false);
    }
  };

  const toggleChatNevTor = async () => {
    // Same behavior as Dashboard: allow OFF even if busy; Orbot alert when enabling.
    if (nevTorBusy && nevTorSnapshot.routingMode === 'OFF') return;
    try {
      setNevTorBusy(true);
      if (nevTorSnapshot.routingMode !== 'OFF') {
        await nevTorManager.setRoutingMode('OFF');
      } else {
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
              {
                text: 'Open Orbot',
                onPress: () => {
                  void (async () => {
                    const result = await launchOrbot();
                    if (result !== 'opened') {
                      Alert.alert(
                        'Orbot',
                        'Orbot is not installed or could not be opened. Install Orbot, start its VPN, then return here and tap Recheck.',
                      );
                    }
                  })();
                },
              },
              {
                text: 'Recheck',
                onPress: () => {
                  void recheckChatTor();
                },
              },
            ],
          );
        }
      }
      if (activeChat?.userId) {
        await nevTorCapabilitySync.announceToPeer({
          userId: activeChat.userId,
          conversationId: activeChat.conversationId,
        }).catch(() => undefined);
      }
    } catch (error: any) {
      Alert.alert('NevTOR', error?.message ?? 'Could not update NevTOR.');
    } finally {
      setNevTorBusy(false);
    }
  };

  useEffect(() => {
    if (!activeChat || !identity) return;
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const applyMessages = async (next: DecryptedMessage[], hidden: string[]) => {
      if (!alive) return;
      hiddenIdsRef.current = new Set(hidden);
      setMessages(current => mergeThreadMessages(current, next, hiddenIdsRef.current));
      const inboundIds = next
        .filter(item => item.senderId !== identity.userId)
        .map(item => item.id);
      void clearUnreadForOpenChat(inboundIds);
    };
    const load = async (opts?: { quiet?: boolean }) => {
      const quiet = opts?.quiet === true;
      try {
        if (!quiet) {
          const localPeer = activeChat.userId || activeChat.memberIds[0];
          if (!localPeer) return;
          const [local, hiddenLocal] = await Promise.all([
            loadConversationMessagesLocal(identity.userId, localPeer, activeChat.conversationId),
            loadHiddenMessageIds(identity.userId),
          ]);
          await applyMessages(local, hiddenLocal);
          if (mountedRef.current) setInboxLoading(local.length === 0);
        }
        const syncPeer = activeChat.userId || activeChat.memberIds[0];
        if (!syncPeer) return;
        const safety = setTimeout(() => {
          if (alive && mountedRef.current) setInboxLoading(false);
        }, 8_000);
        try {
          const [next, hidden] = await Promise.all([
            loadConversationMessages(
              activeChat.conversationId,
              identity.userId,
              syncPeer,
              { memberIds: activeChat.memberIds, skipLegacyNetwork: true },
            ),
            loadHiddenMessageIds(identity.userId),
          ]);
          if (!alive) return;
          await applyMessages(next, hidden);
        } catch (error: any) {
          if (alive && !quiet && mountedRef.current) {
            const msg = String(error?.message ?? '');
            if (/network|fetch|Failed to fetch/i.test(msg)) {
              Alert.alert('Could not open chat', 'Opening this chat is taking too long. Check the connection and retry.');
            }
          }
        } finally {
          clearTimeout(safety);
          if (alive && mountedRef.current) setInboxLoading(false);
        }
      } catch {
        if (alive && mountedRef.current) setInboxLoading(false);
      }
    };
    load();
    // Tor/Orbot often drops realtime — poll so inbound blobs still appear.
    // Quiet polls skip the full "Refreshing…" spinner; local paint already shown.
    const poll = setInterval(() => { void load({ quiet: true }); }, 5000);
    const scheduleLoad = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void load({ quiet: true }); }, 600);
    };
    const channel = subscribeToConversation(activeChat.conversationId, scheduleLoad, identity.userId);
    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [activeChat?.conversationId, identity?.userId, chatNeedsTor, torLive]);

  useEffect(() => {
    if (!activeChat || !identity) {
      setChatRetention(null);
      setVoiceMode(null);
      setShowModulation(false);
      return;
    }
    getConversationRetention(identity.userId, activeChat.conversationId)
      .then(setChatRetention)
      .catch(error => Alert.alert('Retention settings unavailable', error?.message ?? 'Please try again.'));
    loadChatModulation(identity.userId, activeChat.conversationId)
      .then(mode => setVoiceMode(mode))
      .catch(() => setVoiceMode(null));
    const peerForKeys = activeChat.userId || activeChat.memberIds[0];
    if (!peerForKeys || activeChat.kind === 'group') return;
    getActivePublicKeys(peerForKeys)
      .then(async keys => {
        const status = await checkContactKeys(identity.userId, peerForKeys, keys);
        if (status !== 'changed' || !mountedRef.current) return;
        await unverifyContact(identity.userId, peerForKeys);
        if (!mountedRef.current) return;
        setContacts(current => current.map(contact => contact.userId === peerForKeys ? { ...contact, verification: null } : contact));
        setActiveChat(current => current && current.userId === peerForKeys ? { ...current, verification: null } : current);
        Alert.alert(
          'Device key changed',
          'This contact published a different device key. The verified mark was removed and the old secure session will not be reused. If they did not get a new phone, scan their pairing QR in person before you trust this chat.',
          [
            { text: 'Keep warning', style: 'cancel' },
            {
              text: 'Accept new key',
              onPress: () => {
                void (async () => {
                  const { resetRatchetSession } = await import('../lib/sessionRatchet');
                  await resetRatchetSession(identity.userId, peerForKeys);
                  await rememberContactKeys(identity.userId, peerForKeys, keys);
                })().catch(() => undefined);
              },
            },
          ],
        );
      })
      .catch(() => undefined);
  }, [activeChat?.conversationId, identity?.userId]);

  useEffect(() => {
    if (!identity) return;
    const reloadRequests = () => refresh(identity).catch(() => undefined);
    const channel = supabase
      .channel(`pairing-inbox:${identity.userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_requests', filter: `receiver_id=eq.${identity.userId}` },
        reloadRequests,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_requests', filter: `sender_id=eq.${identity.userId}` },
        reloadRequests,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_blobs', filter: `recipient_id=eq.${identity.userId}` },
        reloadRequests,
      )
      .subscribe();
    const fallback = setInterval(reloadRequests, 5_000);
    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [identity?.userId]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardOpen(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      scrollChatToEnd(true);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollChatToEnd]);

  useEffect(() => {
    if (!activeChat) return;
    scrollChatToEnd(messages.length > 0);
  }, [activeChat?.conversationId, messages.length, scrollChatToEnd]);

  useEffect(() => {
    if (!voiceRecording) return;
    const started = Date.now();
    const tick = setInterval(() => {
      const next = Math.min(MAX_VOICE_MS, Date.now() - started);
      setVoiceElapsed(next);
      if (next >= MAX_VOICE_MS) {
        clearInterval(tick);
        finishVoiceCapture().catch(() => undefined);
      }
    }, 200);
    return () => clearInterval(tick);
  }, [voiceRecording]);

  useEffect(() => {
    if (!playingVoiceId) return;
    const item = messages.find(message => message.id === playingVoiceId);
    const payload = item ? parseVoicePayload(item.plaintext) : null;
    const timer = setTimeout(() => {
      setPlayingVoiceId(current => current === playingVoiceId ? null : current);
    }, (payload?.durationMs ?? 1000) + 120);
    return () => clearTimeout(timer);
  }, [playingVoiceId, messages]);

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = contacts;
    if (!needle) return visible;
    return visible.filter(contact =>
      labelFor(contact).toLowerCase().includes(needle) || contact.nevulaId.toLowerCase().includes(needle),
    );
  }, [contacts, query]);

  const filteredChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const visible = chats.filter(chat => !chat.blocked && !listPrefs.hidden.includes(chat.conversationId));
    const sorted = sortChatsByPrefs(visible, listPrefs);
    if (!needle) return sorted;
    return sorted.filter(chat =>
      labelFor(chat).toLowerCase().includes(needle)
      || chat.nevulaId.toLowerCase().includes(needle)
      || (chat.title ?? '').toLowerCase().includes(needle),
    );
  }, [chats, query, listPrefs]);
  filteredChatsRef.current = filteredChats;

  const applyListPrefs = (prefs: ChatListPrefs) => {
    setListPrefs(prefs);
    setChats(current => {
      const sorted = sortChatsByPrefs(current, prefs);
      const userId = identity?.userId;
      if (userId) {
        void saveMessagesListCache({
          userId,
          savedAt: Date.now(),
          contacts,
          chats: sorted,
          requests,
          listPrefs: prefs,
          torChatKeys: [...torChatKeys],
        }).catch(() => undefined);
      }
      return sorted;
    });
  };

  const handleChatPin = async (chat: UiChat) => {
    if (!identity) return;
    const pinned = listPrefs.pinned.includes(chat.conversationId);
    const prefs = await setChatPinned(identity.userId, chat.conversationId, !pinned);
    applyListPrefs(prefs);
    setSwipeCloseSignal(n => n + 1);
  };

  const handleChatDelete = async (chat: UiChat) => {
    if (!identity) return;
    try {
      await leaveChatThread({
        myUserId: identity.userId,
        conversationId: chat.conversationId,
        memberIds: chat.memberIds?.length ? chat.memberIds : chat.userId ? [chat.userId] : [],
      });
      const prefs = await loadChatListPrefs(identity.userId);
      applyListPrefs(prefs);
      if (activeChat?.conversationId === chat.conversationId) closeChat();
      setSwipeCloseSignal(n => n + 1);
      await refresh(identity).catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Could not delete chat', error?.message ?? 'Please try again.');
    }
  };

  const ROW_H = 68;
  const dragSessionRef = useRef<{ id: string; pinned: boolean } | null>(null);
  const listPrefsRef = useRef(listPrefs);
  listPrefsRef.current = listPrefs;
  const finishChatDragRef = useRef<() => void>(() => undefined);

  finishChatDragRef.current = () => {
    void (async () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      const dy = dragDyRef.current;
      const userId = identity?.userId;
      setDragId(null);
      setDragDy(0);
      dragDyRef.current = 0;
      setChatListScrollLock(false);
      if (!session || !userId) return;

      const list = filteredChatsRef.current;
      const chat = list.find(c => c.conversationId === session.id);
      if (!chat) return;

      const prefsNow = listPrefsRef.current;
      const pinnedSet = new Set(prefsNow.pinned);
      const isPinned = pinnedSet.has(chat.conversationId);
      const group = list.filter(c => pinnedSet.has(c.conversationId) === isPinned);
      const fromInGroup = group.findIndex(c => c.conversationId === chat.conversationId);
      if (fromInGroup < 0) return;
      // Commit when moved at least ~1/4 of a row so intermediate slots stick.
      const delta = Math.round(dy / ROW_H);
      const toInGroup = Math.max(0, Math.min(group.length - 1, fromInGroup + delta));
      if (toInGroup === fromInGroup) return;
      const visibleIds = list.map(c => c.conversationId);
      // Optimistic UI before SecureStore write completes.
      const optimistic = [...group.map(c => c.conversationId)];
      const [moved] = optimistic.splice(fromInGroup, 1);
      if (moved) optimistic.splice(toInGroup, 0, moved);
      const optimisticPrefs: ChatListPrefs = {
        ...prefsNow,
        pinned: isPinned ? optimistic : prefsNow.pinned,
        order: isPinned
          ? [...optimistic, ...visibleIds.filter(id => !pinnedSet.has(id))]
          : [...prefsNow.pinned.filter(id => visibleIds.includes(id)), ...optimistic],
      };
      applyListPrefs(optimisticPrefs);
      const prefs = await reorderChatInList(userId, chat.conversationId, toInGroup, visibleIds);
      applyListPrefs(prefs);
    })();
  };

  const startChatDrag = (chat: UiChat) => {
    dragSessionRef.current = {
      id: chat.conversationId,
      pinned: listPrefs.pinned.includes(chat.conversationId),
    };
    dragDyRef.current = 0;
    setDragDy(0);
    setDragId(chat.conversationId);
    setChatListScrollLock(true);
    setSwipeCloseSignal(n => n + 1);
  };

  const openAliasEditor = (contact: UiContact) => {
    setEditingContact(contact);
    setAliasDraft(contact.alias ?? '');
  };

  const handleSaveAlias = async () => {
    if (!identity || !editingContact || busy) return;
    setBusy(true);
    try {
      const alias = await saveContactAlias(identity.userId, editingContact.userId, aliasDraft);
      setContacts(current => current.map(contact => contact.userId === editingContact.userId ? { ...contact, alias: alias || null } : contact));
      setActiveChat(current => current?.userId === editingContact.userId ? { ...current, alias: alias || null } : current);
      setEditingContact(null);
    } catch (error: any) {
      Alert.alert('Could not save alias', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pairFromPayload = async (raw: string, method: VerificationMethod) => {
    if (!identity) return;
    const pairing = parsePairingQrPayload(raw);
    if (pairing.userId === identity.userId) throw new Error('You cannot pair this device with itself.');

    const keys = [{ fingerprint: pairing.fingerprint, p256Spki: pairing.p256Spki, kemPk: pairing.kemPk }];
    await rememberContactKeys(identity.userId, pairing.userId, keys);
    // One scan is enough: this phone stores Trusted now; after they Accept (or if already
    // connected), an intro-ack syncs Trusted onto their phone too.
    await markContactVerified(identity.userId, pairing.userId, method);
    const result = await sendContactRequest(identity.userId, pairing.userId, {
      trust: method,
      peerSpki: pairing.p256Spki,
    });
    const label = pairing.nevulaId || 'Contact';
    if (result.outcome === 'accepted' || result.outcome === 'already_connected') {
      setRequestSentInfo({
        label,
        status: 'confirmed',
        detail: 'Contact confirmed on both sides. They are on your contact list — open them when you want to chat.',
      });
    } else if (result.outcome === 'already_sent') {
      setRequestSentInfo({
        label,
        status: 'pending',
        detail: 'Request already pending. Waiting for them to Accept or Decline on their phone.',
      });
    } else {
      setRequestSentInfo({
        label,
        status: 'pending',
        detail: 'Request sent. Waiting for them to Accept or Decline. No chat opens until you choose one later.',
      });
    }
    // Never block the success UI on a slow list refresh.
    void refresh(identity).catch(() => undefined);
  };

  const handleSendRequest = async () => {
    if (!identity || !newId.trim()) return;
    setBusy(true);
    try {
      const raw = newId.trim();
      const publicToken = parseContactInvite(raw);
      if (publicToken) {
        setScannedInvite(publicToken); setShowAdd(false); setNewId('NVL-');
        return;
      }
      if (/nevula:\/\//i.test(raw) || /[?&]v=[23]&/i.test(raw) || raw.includes('pair?')) {
        await pairFromPayload(raw, 'key');
        setNewId('NVL-');
        setShowAdd(false);
        return;
      }
      const profile = await findUserByNevulaId(raw);
      if (!profile) throw new Error('No local contact has this NEVULA ID. Scan their pairing QR, or paste their pairing link under Enter Key manually.');
      const result = await sendContactRequest(identity.userId, profile.user_id);
      setNewId('NVL-');
      setShowAdd(false);
      await refresh(identity);
      if (result.outcome === 'accepted' || result.outcome === 'already_connected') {
        setRequestSentInfo({
          label: profile.nevula_id || raw,
          status: 'confirmed',
          detail: 'Contact confirmed on both sides. They are on your contact list — open them when you want to chat.',
        });
      } else if (result.outcome === 'already_sent') {
        setRequestSentInfo({
          label: profile.nevula_id || raw,
          status: 'pending',
          detail: 'Request already pending. Waiting for them to Accept or Decline on their phone.',
        });
      } else {
        setRequestSentInfo({
          label: profile.nevula_id || raw,
          status: 'pending',
          detail: 'Request sent. Waiting for them to Accept or Decline. No chat opens until you choose one later.',
        });
      }
    } catch (error: any) {
      Alert.alert('Contact request failed', error?.message ?? 'Could not send request.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!showScanner) {
      setScannerLive(false);
      return;
    }
    const timer = setTimeout(() => setScannerLive(true), 300);
    return () => clearTimeout(timer);
  }, [showScanner]);

  const openPairingScanner = async () => {
    // Ask before the scanner window opens. A full-screen camera view covers
    // the Android permission sheet, which leaves a black preview.
    setupHoldRef.current = true;
    try {
      const granted = await askDevicePermission(cameraPermission, requestCameraPermission, 'Camera');
      if (!granted) return;
      setQrScanned(false);
      setShowScanner(true);
    } finally {
      setupHoldRef.current = false;
    }
  };

  const handleScannedPairingCode = async (data: string) => {
    if (!identity || qrScanned || busy) return;
    setQrScanned(true);
    setBusy(true);
    try {
      const publicToken = parseContactInvite(data);
      if (publicToken) {
        setScannedInvite(publicToken); setShowScanner(false);
        return;
      }
      await pairFromPayload(data, 'in_person');
      setShowScanner(false);
    } catch (error: any) {
      Alert.alert('Could not pair', error?.message ?? 'The QR code could not be verified.');
      setQrScanned(false);
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (request: PendingView) => {
    if (!identity || busy) return;
    setBusy(true);
    try {
      // Contact only — do not open a chat. listChatListItems no longer invents a DM.
      await createConversationWith(request.sender_id, identity.userId, {
        nevulaId: request.senderNevulaId !== 'Unknown NEVULA ID' ? request.senderNevulaId : undefined,
        displayName: request.senderNevulaId !== 'Unknown NEVULA ID' ? request.senderNevulaId : undefined,
      });
      // QR / key pairing: Verified on BOTH phones. Public invite stays unmarked.
      if (request.source !== 'public_invite') {
        const method = request.trust === 'key' ? 'key' : 'in_person';
        await markContactVerified(identity.userId, request.sender_id, method);
        await sendPairingAck(identity.userId, request.sender_id, method);
      } else {
        await sendPairingAck(identity.userId, request.sender_id);
      }
      await respondToContactRequest(request.id, 'accepted');
      if (request.rechat && request.conversationId) {
        const { clearPendingThreadMember } = await import('../lib/chatThreads');
        await clearPendingThreadMember(identity.userId, request.conversationId, request.sender_id).catch(() => undefined);
      }
      setIncomingRequestModal(null);
      if (request.rechat) {
        await refresh(identity);
        return;
      }
      setActiveChat(null);
      setTab('contacts');
      await refresh(identity);
      Alert.alert(
        'Contact confirmed',
        'Contact confirmed on both sides. They are on your contact list. No chat was started — open New chat when you want to message them.',
      );
    } catch (error: any) {
      Alert.alert('Could not accept request', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDeletePending = (onDelete: () => void) => {
    Alert.alert(
      'Delete request?',
      'This removes the pending request from this phone and from the server.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
    );
  };

  const deleteOutgoingPending = async (peerUserId: string) => {
    if (!identity || busy) return;
    setBusy(true);
    try {
      await cancelOutgoingContactRequest(identity.userId, peerUserId);
      await refresh(identity);
    } catch (error: any) {
      Alert.alert('Could not delete request', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const deleteIncomingPending = async (request: PendingView) => {
    if (!identity || busy) return;
    setBusy(true);
    try {
      await dismissIncomingContactRequest(request.id);
      if (incomingRequestModal?.id === request.id) setIncomingRequestModal(null);
      await refresh(identity);
    } catch (error: any) {
      Alert.alert('Could not delete request', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async (request: PendingView) => {
    if (!identity || busy) return;
    setBusy(true);
    try {
      await sendPairingDecline(identity.userId, request.sender_id).catch(() => undefined);
      await respondToContactRequest(request.id, 'declined');
      if (request.rechat && request.conversationId) {
        const { hideChatFromList } = await import('../lib/chatListPrefs');
        const { removeChatThread } = await import('../lib/chatThreads');
        await hideChatFromList(identity.userId, request.conversationId);
        await removeChatThread(identity.userId, request.conversationId);
        if (activeChat?.conversationId === request.conversationId) setActiveChat(null);
      }
      await refresh(identity);
      setIncomingRequestModal(null);
      if (!request.rechat) setTab('contacts');
      Alert.alert('Request declined', request.rechat
        ? 'You declined. The chat stays closed until they ask again.'
        : 'You declined this contact request. No chat was created.');
    } catch (error: any) {
      Alert.alert('Could not decline request', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const closeChat = () => {
    voiceFinishingRef.current = false;
    setVoiceRecording(false);
    setVoiceProcessing(false);
    setVoiceElapsed(0);
    setPlayingVoiceId(null);
    setFailedVoiceId(null);
    setShowModulation(false);
    setVoiceMode(null);
    setDeleteTarget(null);
    setShowMembers(false);
    setShowInvite(false);
    setShowVaultPicker(false);
    setShowChatRetention(false);
    cancelVoiceRecording().catch(() => undefined);
    stopVoicePlayback().catch(() => undefined);
    setActiveChat(null);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (deleteTarget) { setDeleteTarget(null); return true; }
      if (showVaultPicker) { setShowVaultPicker(false); return true; }
      if (showInvite) { setShowInvite(false); return true; }
      if (showMembers) { setShowMembers(false); return true; }
      if (showModulation) { setShowModulation(false); return true; }
      if (showChatRetention) { setShowChatRetention(false); return true; }
      if (showSecurity) { setShowSecurity(false); return true; }
      if (showDefaultRetention) { setShowDefaultRetention(false); return true; }
      if (incomingRequestModal) { setIncomingRequestModal(null); return true; }
      if (requestSentInfo) { setRequestSentInfo(null); return true; }
      if (activeChat) { closeChat(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [
    activeChat,
    deleteTarget,
    showVaultPicker,
    showInvite,
    showMembers,
    showModulation,
    showChatRetention,
    showSecurity,
    showDefaultRetention,
    incomingRequestModal,
    requestSentInfo,
  ]);

  const toggleVoice = async (item: DecryptedMessage) => {
    const payload = parseVoicePayload(item.plaintext);
    if (!payload) return;
    try {
      if (playingVoiceId === item.id) {
        await stopVoicePlayback();
        setPlayingVoiceId(null);
        return;
      }
      setFailedVoiceId(null);
      setPlayingVoiceId(item.id);
      await playVoicePayload(item.id, payload);
    } catch {
      setPlayingVoiceId(null);
      setFailedVoiceId(item.id);
    }
  };

  const chooseModulation = async (mode: VoiceMode) => {
    if (!identity || !activeChat) return;
    setVoiceMode(mode);
    setShowModulation(false);
    await saveChatModulation(identity.userId, activeChat.conversationId, mode).catch(() => undefined);
  };

  const handleSendVoice = async (result: { uri: string; durationMs: number; mime: string }) => {
    if (!identity || !activeChat) throw new Error('Chat is not ready.');
    if (!ensureChatWriteReady()) throw new Error('Waiting for everyone to confirm this chat.');
    if (!ensureChatTorReady()) throw new Error('NevTOR required for this chat.');
    const mode = voiceModeRef.current;
    if (!mode) throw new Error('Please choose a speaking voice first.');
    const expiresAt = new Date(Date.now() + retentionToMs(chatRetention ?? defaultRetention)).toISOString();
    const peerId = activeChat.userId || activeChat.memberIds[0];
    if (!peerId) throw new Error('Chat has no recipient.');
    if (activeChat.kind === 'group' || activeChat.memberIds.length > 1) {
      // Voice fan-out: send per member via disguised helper once each.
      for (const recipientUserId of activeChat.memberIds) {
        await sendDisguisedVoice({
          conversationId: activeChat.conversationId,
          senderId: identity.userId,
          recipientUserId,
          expiresAt,
          result,
          mode,
        });
      }
    } else {
      await sendDisguisedVoice({
        conversationId: activeChat.conversationId,
        senderId: identity.userId,
        recipientUserId: peerId,
        expiresAt,
        result,
        mode,
      });
    }
    const voiced = await loadConversationMessages(
      activeChat.conversationId,
      identity.userId,
      peerId,
      { memberIds: activeChat.memberIds },
    );
    setMessages(current => mergeThreadMessages(current, voiced, hiddenIdsRef.current));
  };

  const finishVoiceCapture = async () => {
    if (voiceFinishingRef.current) return;
    voiceFinishingRef.current = true;
    setVoiceRecording(false);
    setVoiceProcessing(true);
    try {
      const mode = voiceModeRef.current;
      if (!mode) throw new Error('Please choose a speaking voice first.');
      const result = await stopAndDisguiseVoice(mode);
      await handleSendVoice(result);
    } catch (error: any) {
      await cancelVoiceRecording().catch(() => undefined);
      Alert.alert('Voice message failed', error?.message ?? 'Could not re-speak the message.');
    } finally {
      voiceFinishingRef.current = false;
      setVoiceProcessing(false);
      setVoiceElapsed(0);
    }
  };

  const toggleMic = async () => {
    if (busy || voiceProcessing) return;
    if (voiceRecording) {
      await finishVoiceCapture();
      return;
    }
    if (!voiceMode) {
      setShowModulation(true);
      return;
    }
    if (!isVoiceCaptureAvailable()) {
      Alert.alert('Voice messages unavailable', 'Voice messages need the native NEVULA Android build.');
      return;
    }
    const granted = await askDevicePermission(micPermission, requestMicPermission, 'Microphone');
    if (!mountedRef.current || !granted) return;
    Keyboard.dismiss();
    stopVoicePlayback().catch(() => undefined);
    setPlayingVoiceId(null);
    try {
      setVoiceElapsed(0);
      await startVoiceRecording();
      setVoiceRecording(true);
    } catch (error: any) {
      Alert.alert('Voice message failed', error?.message ?? 'Could not start recording.');
    }
  };

  const openVaultPicker = async () => {
    if (busy || voiceRecording || voiceProcessing) return;
    try {
      setVaultItems(await listVaultItems());
      setSelectedVaultIds([]);
      setShowVaultPicker(true);
    } catch (error: any) {
      Alert.alert('Gallery unavailable', error?.message ?? 'Could not open the private gallery.');
    }
  };

  const handleSendVaultItems = async () => {
    if (!identity || !activeChat || busy) return;
    if (!ensureChatWriteReady()) return;
    if (!ensurePendingMembersReady()) return;
    if (!ensureChatTorReady()) return;
    const selected = vaultItems.filter(item => selectedVaultIds.includes(item.id));
    if (!selected.length) return;
    setShowVaultPicker(false);
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + retentionToMs(chatRetention ?? defaultRetention)).toISOString();
      const recipients = activeChat.memberIds.length ? activeChat.memberIds : [activeChat.userId].filter(Boolean);
      for (const item of selected) {
        for (const recipientUserId of recipients) {
          await sendVaultItem({
            conversationId: activeChat.conversationId,
            senderId: identity.userId,
            recipientUserId,
            expiresAt,
            item,
          });
        }
      }
      const sentMedia = await loadConversationMessages(
        activeChat.conversationId,
        identity.userId,
        activeChat.userId || activeChat.memberIds[0],
        { memberIds: activeChat.memberIds },
      );
      setMessages(current => mergeThreadMessages(current, sentMedia, hiddenIdsRef.current));
    } catch (error: any) {
      Alert.alert('Could not send selected media', error?.message ?? 'Choose smaller photos, videos or files from the NEVULA Gallery.');
    } finally {
      setSelectedVaultIds([]);
      setBusy(false);
    }
  };

  const handleDeleteContact = async (target: { userId: string }) => {
    if (!identity || busy) return;
    Alert.alert(
      'Delete contact',
      'This removes the pairing on this phone. They are not blocked. If they message you again, authentication has to happen again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const peerId = target.userId;
              setBusy(true);
              try {
                await unverifyContact(identity.userId, peerId);
                await forgetContactKeys(identity.userId, peerId);
                await resetRatchetSession(identity.userId, peerId);
                await clearOutgoingPairing(identity.userId, peerId);
                await saveContactAlias(identity.userId, peerId, '');
                await removeLocalContact(identity.userId, peerId);
                await supabase
                  .from('contact_requests')
                  .delete()
                  .or(`and(sender_id.eq.${identity.userId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${identity.userId})`)
                  .then(() => undefined, () => undefined);
                const dms = chats.filter(chat => chat.kind !== 'group' && chat.userId === peerId);
                for (const chat of dms) {
                  await leaveChatThread({
                    myUserId: identity.userId,
                    conversationId: chat.conversationId,
                    memberIds: chat.memberIds?.length ? chat.memberIds : [peerId],
                  }).catch(() => undefined);
                }
                setContacts(current => current.filter(contact => contact.userId !== peerId));
                setChats(current => current.filter(chat => !(chat.kind !== 'group' && chat.userId === peerId)));
                setRequests(current => current.filter(request => request.sender_id !== peerId && request.receiver_id !== peerId));
                if (activeChat?.userId === peerId) closeChat();
                setEditingContact(null);
              } catch (error: any) {
                Alert.alert('Could not delete contact', error?.message ?? 'Please try again.');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const handleToggleBlock = async () => {
    if (!identity || !editingContact || busy) return;
    const target = editingContact;
    const nextBlocked = !target.blocked;
    setBusy(true);
    try {
      await setContactBlocked(identity.userId, target.userId, nextBlocked);
      setContacts(current => current.map(contact => contact.userId === target.userId ? { ...contact, blocked: nextBlocked } : contact));
      if (nextBlocked && activeChat?.userId === target.userId) closeChat();
      setEditingContact(null);
      Alert.alert(nextBlocked ? 'Contact blocked' : 'Contact unblocked', nextBlocked ? 'This contact no longer appears in chats or pairing requests on this device.' : 'This contact can appear in chats again.');
    } catch (error: any) {
      Alert.alert('Could not update block status', error?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const ensureChatWriteReady = () => {
    if (!activeChat?.torRequired) return true;
    if (activeChat.writeReady) return true;
    Alert.alert(
      'Orbot chat',
      'Confirm Orbot to enter this chat before you can write. The same Tor rules apply to everyone.',
    );
    return false;
  };

  const ensurePendingMembersReady = () => {
    if (!activeChat?.pendingMemberIds?.length) return true;
    Alert.alert(
      'Confirm new members',
      'Someone new was invited into this chat. Confirm their key below before you can write together.',
    );
    return false;
  };

  const confirmPendingMember = (memberId: string) => {
    if (!identity || !activeChat) return;
    void (async () => {
      try {
        setBusy(true);
        const thread = await confirmPendingThreadMember({
          myUserId: identity.userId,
          conversationId: activeChat.conversationId,
          memberId,
        });
        await refresh(identity);
        if (thread) {
          setActiveChat(current => current && current.conversationId === thread.conversationId
            ? {
                ...current,
                kind: thread.memberIds.length > 1 ? 'group' : current.kind,
                memberIds: thread.memberIds,
                pendingMemberIds: Object.keys(thread.pendingMembers ?? {}),
              }
            : current);
        }
        Alert.alert('Contact confirmed', 'They are on your contact list for this chat now.');
      } catch (error: any) {
        Alert.alert('Could not confirm', error?.message ?? 'Scan their pairing QR, then try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const ensureChatTorReady = () => {
    if (!chatNeedsTor) return true;
    if (torLive) return true;
    Alert.alert('NevTOR', 'Turn on NevTOR and Orbot to send messages in this chat.');
    return false;
  };

  const setChatRequire = async (required: boolean) => {
    if (!identity || !activeChat) return;
    try {
      // Once Tor was locked for this chat (and peer confirmed), do not unlock.
      if (!required && (chatRequireMine || chatRequirePeer || activeChat.torRequired)) {
        Alert.alert('NevTOR', 'Orbot for this chat is locked after confirmation and cannot be turned off here.');
        return;
      }
      setNevTorBusy(true);
      const requireKey = activeChat.conversationId;
      await setMyChatNevTorRequire(identity.userId, requireKey, required);
      await upsertChatThread(identity.userId, {
        conversationId: requireKey,
        kind: activeChat.kind,
        memberIds: activeChat.memberIds,
        title: activeChat.title,
        torRequired: required,
        confirmations: { [identity.userId]: true },
        createdAt: new Date().toISOString(),
      });
      await markThreadConfirmed(identity.userId, requireKey, identity.userId);
      setChatRequireMine(required);
      setTorChatKeys(prev => {
        const next = new Set(prev);
        if (required || chatRequirePeer) next.add(requireKey);
        else next.delete(requireKey);
        return next;
      });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const peerId = activeChat.userId || activeChat.memberIds[0];
      if (peerId) {
        await sendEncryptedMessage({
          conversationId: requireKey,
          senderId: identity.userId,
          recipientUserId: peerId,
          plaintext: encodeChatNevTorRequire(required, new Date().toISOString(), requireKey),
          expiresAt,
          skipOutbox: true,
        });
      }
    } catch (error: any) {
      Alert.alert('NevTOR', error?.message ?? 'Could not update chat setting.');
    } finally {
      setNevTorBusy(false);
    }
  };
  setChatRequireRef.current = setChatRequire;

  const sendChatPlaintext = async (value: string, reuseMessageId?: string) => {
    if (!identity || !activeChat || activeChat.blocked || !value || busy) return;
    if (!ensureChatWriteReady()) return;
    if (!ensurePendingMembersReady()) return;
    if (!ensureChatTorReady()) return;
    const expiresAt = new Date(Date.now() + retentionToMs(chatRetention ?? defaultRetention)).toISOString();
    const recipientUserId = activeChat.userId || activeChat.memberIds[0];
    if (!recipientUserId && activeChat.kind !== 'group') return;
    const messageId = reuseMessageId && /^[0-9a-f-]{36}$/i.test(reuseMessageId)
      ? reuseMessageId
      : globalThis.crypto.randomUUID();
    const localId = messageId;
    const createdAt = new Date().toISOString();
    if (!reuseMessageId) setMessage('');
    setBusy(true);
    setMessages(current => [
      ...current.filter(row => row.id !== localId),
      {
        id: localId,
        senderId: identity.userId,
        plaintext: value,
        createdAt,
        expiresAt,
        delivery: 'pending',
      },
    ]);
    try {
      const sent = activeChat.kind === 'group' || activeChat.memberIds.length > 1
        ? await sendEncryptedThreadMessage({
            conversationId: activeChat.conversationId,
            senderId: identity.userId,
            memberIds: activeChat.memberIds,
            plaintext: value,
            expiresAt,
          })
        : await sendEncryptedMessage({
            conversationId: activeChat.conversationId,
            senderId: identity.userId,
            recipientUserId: recipientUserId!,
            plaintext: value,
            expiresAt,
            messageId,
          });
      setMessages(current => current.map(item => item.id === localId
        ? {
            id: sent.id,
            senderId: identity.userId,
            plaintext: value,
            createdAt: sent.created_at,
            expiresAt: sent.expires_at,
            delivery: 'sent',
          }
        : item));
    } catch (error: any) {
      setMessages(current => current.map(item => item.id === localId
        ? { ...item, delivery: 'failed' }
        : item));
      const copy = sendStatusCopy();
      Alert.alert(
        copy.failTitle,
        error?.message ?? copy.failBody,
        [
          { text: copy.ok },
          { text: copy.retry, onPress: () => { void sendChatPlaintext(value, messageId); } },
        ],
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendMessage = async () => {
    if (voiceRecording) {
      await finishVoiceCapture();
      return;
    }
    await sendChatPlaintext(message.trim());
  };

  const removeFromThread = (messageId: string) => {
    if (playingVoiceId === messageId) {
      stopVoicePlayback().catch(() => undefined);
      setPlayingVoiceId(null);
    }
    setMessages(current => current.filter(messageItem => messageItem.id !== messageId));
  };

  const handleDeleteForEveryone = async () => {
    if (!identity || !deleteTarget || deleteTarget.senderId !== identity.userId || deletingMessageId) return;
    const item = deleteTarget;
    setDeleteTarget(null);
    setDeletingMessageId(item.id);
    try {
      await deleteEncryptedMessageForEveryone(item.id, identity.userId);
      removeFromThread(item.id);
    } catch (error: any) {
      Alert.alert('Could not delete message', error?.message ?? 'Please try again.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleDeleteForMe = async () => {
    if (!identity || !deleteTarget || deletingMessageId) return;
    const item = deleteTarget;
    setDeleteTarget(null);
    setDeletingMessageId(item.id);
    try {
      await hideMessageForMe(identity.userId, item.id);
      hiddenIdsRef.current.add(item.id);
      removeFromThread(item.id);
    } catch (error: any) {
      Alert.alert('Could not delete message', error?.message ?? 'Please try again.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const startExtraDm = (peer: UiContact, torRequired: boolean) => {
    if (!identity || busy) return;
    void (async () => {
      try {
        setBusy(true);
        const existingUi = chats.find(
          (chat) =>
            chat.kind === 'dm'
            && chat.userId === peer.userId
            && Boolean(chat.torRequired) === torRequired,
        );
        if (existingUi) {
          setShowNewChat(false);
          setNewChatPeerId(null);
          setActiveChat(existingUi);
          await announceThreadInvite({
            thread: {
              conversationId: existingUi.conversationId,
              kind: 'dm',
              memberIds: [peer.userId],
              title: null,
              torRequired,
              confirmations: {},
              createdAt: new Date().toISOString(),
            },
            senderId: identity.userId,
            onlyMemberIds: [peer.userId],
          }).catch(() => undefined);
          return;
        }
        const thread = await createDmThread({
          myUserId: identity.userId,
          peerUserId: peer.userId,
          torRequired,
        });
        // Open immediately so the user is not staring at a silent Tor/without prompt.
        setShowNewChat(false);
        setNewChatPeerId(null);
        setActiveChat({
          conversationId: thread.conversationId,
          kind: 'dm',
          userId: peer.userId,
          memberIds: [peer.userId],
          nevulaId: peer.nevulaId,
          displayName: peer.displayName,
          title: null,
          torRequired,
          writeReady: false,
          pendingConfirms: 1,
          pendingMemberIds: [],
          strictConfirm: true,
          alias: peer.alias,
          verification: peer.verification,
          blocked: peer.blocked,
        });
        await announceThreadInvite({ thread, senderId: identity.userId });
        await refresh(identity);
      } catch (error: any) {
        Alert.alert('Could not start chat', error?.message ?? 'Please try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const invitePeople = () => {
    if (!identity || !activeChat) return;
    const inviteeIds = [...invitePick];
    if (!inviteeIds.length) {
      Alert.alert('Invite', 'Pick at least one contact.');
      return;
    }
    void (async () => {
      try {
        setBusy(true);
        const thread = await inviteToChat({
          myUserId: identity.userId,
          conversationId: activeChat.conversationId,
          inviteeIds,
          seedPeerUserId: activeChat.userId || activeChat.memberIds[0],
          torRequired: activeChat.torRequired || chatRequireMine || chatRequirePeer,
          title: activeChat.title,
        });
        await refresh(identity);
        setShowInvite(false);
        setInvitePick(new Set());
        const labels = thread.memberIds.map(id => {
          const c = contacts.find(item => item.userId === id);
          return c ? labelFor(c) : '…';
        });
        setActiveChat(current => current && current.conversationId === thread.conversationId
          ? {
              ...current,
              kind: thread.memberIds.length > 1 ? 'group' : current.kind,
              userId: thread.memberIds.length > 1 ? '' : (thread.memberIds[0] || current.userId),
              memberIds: thread.memberIds,
              title: thread.title || (thread.memberIds.length > 1 ? labels.slice(0, 3).join(', ') : current.title),
              nevulaId: thread.title || (thread.memberIds.length > 1 ? 'Group' : current.nevulaId),
              displayName: thread.title,
              torRequired: thread.torRequired,
              writeReady: true,
              pendingConfirms: [identity.userId, ...thread.memberIds].filter(id => thread.confirmations[id] !== true).length,
              pendingMemberIds: Object.keys(thread.pendingMembers ?? {}),
              strictConfirm: thread.memberIds.length > 1 || current.strictConfirm,
            }
          : current);
        Alert.alert(
          thread.memberIds.length > 1 ? 'Group updated' : 'Invited',
          activeChat.torRequired || chatRequireMine || chatRequirePeer
            ? 'Everyone must confirm Orbot for this Tor chat. Each person must also confirm any new member’s key in the chat before you can write together.'
            : 'This is now a group on your phone. Everyone else must open Messages so the invite arrives, then confirm any new person in the chat before you can write together.',
        );
      } catch (error: any) {
        Alert.alert('Could not invite', error?.message ?? 'Please try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  if (loading && chats.length === 0 && contacts.length === 0) {
    return (
      <SafeAreaView style={[s.container, s.safeContainer, s.center]}>
        <ActivityIndicator />
        <Text style={s.muted}>Opening secure chats…</Text>
      </SafeAreaView>
    );
  }

  if (bootError && !showScanner && chats.length === 0 && contacts.length === 0 && !loading) {
    return (
      <SafeAreaView style={[s.container, s.safeContainer, s.center]}>
        <Text style={s.muted}>{bootError}</Text>
        <Pressable
          onPress={() => {
            setBootError(null);
            setLoading(true);
            setBootAttempt((n) => n + 1);
          }}
          style={s.acceptButton}
        >
          <Text style={s.acceptText}>Retry</Text>
        </Pressable>
        <Pressable onPress={onBack} style={s.modalClose}>
          <Text style={s.modalCloseText}>Back</Text>
        </Pressable>
        <Pressable onPress={() => { void openPairingScanner(); }} style={s.primaryAction}>
          <Text style={s.primaryText}>▣ Scan QR</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (activeChat && identity) {
    const composerPad = keyboardOpen ? 12 : 10 + androidBottomInset();
    // Match NotesScreen: Android KAV height shrink keeps compose+send above the IME.
    // Do not also add full keyboardHeight as marginBottom (that double-lifted / half-covered on OEMs).
    const headerSub = activeChat.torRequired && !activeChat.writeReady
      ? 'Confirm Orbot to join'
      : activeChat.kind === 'group'
        ? null
        : hasChosenName(activeChat)
          ? null
          : activeChat.nevulaId;
    const memberRows = activeChat.kind === 'group'
      ? [
          ...(identity
            ? [{
              id: identity.userId,
              label: 'You',
              sub: identity.nevulaId,
            }]
            : []),
          ...activeChat.memberIds.map((id) => {
            const contact = contacts.find(c => c.userId === id);
            const pendingLabel = activeChat.pendingMemberLabels?.[id];
            const key = contact?.nevulaId || pendingLabel || id.slice(0, 8);
            const nick = contact?.alias?.trim() || null;
            return {
              id,
              label: nick || key,
              sub: nick ? key : null,
            };
          }),
        ]
      : [];
    return <SafeAreaView style={[s.container,s.safeContainer]}>
      <KeyboardAvoidingView
        style={s.keyboardLayout}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
      <View style={s.chatHeader}>
        <View style={s.chatHeaderTop}>
          <Pressable onPress={closeChat} style={s.iconButton}><Text style={s.backText}>‹</Text></Pressable>
          <Pressable onPress={() => setAvatarSheet(true)} accessibilityRole="button" accessibilityLabel={avatarCopy().title} style={{ marginRight: 8 }}>
            <AvatarFace uri={selfAvatar} size={36} borderColor={p.border} backgroundColor={p.surfaceAlt} iconColor={p.muted} />
          </Pressable>
          <Pressable
            style={s.headerCopy}
            onPress={() => {
              if (activeChat.kind === 'group') {
                setShowMembers(true);
                return;
              }
              const peer = contacts.find(contact => contact.userId === activeChat.userId);
              if (peer) openAliasEditor(peer);
            }}
            accessibilityRole="button"
            accessibilityLabel={activeChat.kind === 'group' ? 'Show members' : 'Contact'}
          >
            <View style={s.nameRow}>
              <Text style={s.chatName} numberOfLines={1}>{labelFor(activeChat)}</Text>
            </View>
            {headerSub ? (
              <Text style={[s.small, chatNeedsTor && s.torChatActive]} numberOfLines={1}>{headerSub}</Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => {
              setInvitePick(new Set());
              setShowInvite(true);
            }}
            style={s.securityFlat}
            accessibilityLabel="Invite to chat"
          >
            <Text style={s.securityTitle}>INVITE</Text>
          </Pressable>
        </View>
        <View style={[s.securityBar, s.securityBarInChat]}>
          <View style={[s.securityBarLeft, { zIndex: 3 }]}>
            <Pressable onPress={() => setShowModulation(true)} style={s.securityFlat}>
              <Text style={s.securityTitle}>VOICE</Text>
              <Text style={s.securitySub}>{VOICE_MODES.find(item => item.id === voiceMode)?.label ?? 'CHOOSE'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowSecurity(true)}
              style={[s.nvl3Chip, s.nvl3ChipOn, { zIndex: 3, elevation: 0 }]}
              accessibilityRole="button"
              accessibilityLabel="NVL3-QR encryption info"
              hitSlop={6}
            >
              <Text style={[s.nvl3ChipText, s.nvl3ChipTextOn]}>NVL3-QR</Text>
            </Pressable>
          </View>
          <View style={[s.securityBarTorMid, { zIndex: 1 }]} pointerEvents="box-none">
            {chatNeedsTor ? (
              <>
                <OrbotOnionMark compact size={18} onPress={() => { void recheckChatTor(); }} />
                <Pressable
                  disabled={nevTorBusy && nevTorSnapshot.routingMode === 'OFF'}
                  onPress={() => { void toggleChatNevTor(); }}
                  style={[s.torModeBubble, s.torInlineToggleSpaced, nevTorSnapshot.routingMode !== 'OFF' && s.torModeBubbleOn]}
                  accessibilityLabel={nevTorSnapshot.routingMode !== 'OFF' ? 'NevTOR on' : 'NevTOR off'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: nevTorSnapshot.routingMode !== 'OFF' }}
                >
                  <Text style={s.torModeTitle}>NevTOR</Text>
                  <View style={[s.torToggle, nevTorSnapshot.routingMode !== 'OFF' && s.torToggleOn]}>
                    <View style={[s.torToggleKnob, nevTorSnapshot.routingMode !== 'OFF' && s.torToggleKnobOn]} />
                  </View>
                </Pressable>
              </>
            ) : (
              <View style={s.securityBarTorSpacer} />
            )}
          </View>
          <Pressable onPress={() => setShowChatRetention(true)} style={[s.securityFlat, s.securityFlatEnd]}>
            <Text style={s.securityTitle}>BURNING</Text>
            <Text style={s.securitySub}>{formatRetention(chatRetention ?? defaultRetention)}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        ref={conversationRef}
        style={s.conversation}
        contentContainerStyle={s.conversationContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => scrollChatToEnd(false)}
        onLayout={() => scrollChatToEnd(false)}
      >
        {chatNeedsTor && !torLive ? (
          <Pressable
            onPress={() => { void reloadActiveChat(); }}
            style={s.torWaitBanner}
            accessibilityLabel={unreadCount > 0 ? unreadLabel(unreadCount) : 'Turn on NevTOR and Orbot'}
          >
            <Text style={s.torWaitBannerTitle}>
              {unreadCount > 0 ? unreadLabel(unreadCount) : 'Messages waiting'}
            </Text>
            <Text style={s.torWaitBannerCopy}>
              {nevTorSnapshot.routingMode !== 'OFF' && !torLive
                ? (nevTorSnapshot.lastError
                  ?? 'NevTOR is On, but Orbot is not confirmed yet. Tap Recheck on the onion, then tap here.')
                : 'Turn on NevTOR and Orbot to open them. Tap here to retry.'}
            </Text>
          </Pressable>
        ) : null}
        {activeChat.torRequired && !activeChat.writeReady ? (
          <View style={s.torWaitBanner}>
            <Text style={s.torWaitBannerTitle}>Confirm Orbot to join</Text>
            <Text style={s.torWaitBannerCopy}>
              This is a Tor chat. Confirm Orbot to enter — the same rules apply and stay locked.
            </Text>
          </View>
        ) : null}
        {requests.filter(request => request.rechat && (request.sender_id === activeChat.userId || request.conversationId === activeChat.conversationId)).map(request => (
          <View key={request.id} style={s.torWaitBanner}>
            <Text style={s.torWaitBannerTitle}>Contact request</Text>
            <Text style={s.torWaitBannerCopy}>
              You deleted this contact. They opened the chat again. Accept to continue here, or Decline.
            </Text>
            <Pressable disabled={busy} onPress={() => { void handleAccept(request); }} style={[s.acceptButton, { marginTop: 10 }, busy && s.disabledButton]}>
              <Text style={s.acceptText}>{busy ? 'Working…' : 'Accept'}</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => { void handleDecline(request); }} style={[s.blockButton, { marginTop: 8 }, busy && s.disabledButton]}>
              <Text style={s.blockButtonText}>Decline</Text>
            </Pressable>
          </View>
        ))}
        {activeChat.pendingMemberIds?.length && !requests.some(request => request.rechat && request.sender_id === activeChat.userId) ? (
          <View style={s.torWaitBanner}>
            <Text style={s.torWaitBannerTitle}>New person in this chat</Text>
            <Text style={s.torWaitBannerCopy}>
              Confirm their device key to add them to your contacts. Until then the group cannot write together.
            </Text>
            {activeChat.pendingMemberIds.map(memberId => {
              const label = activeChat.pendingMemberLabels?.[memberId]
                || contacts.find(c => c.userId === memberId)?.nevulaId
                || 'New member';
              return (
                <Pressable
                  key={memberId}
                  disabled={busy}
                  onPress={() => confirmPendingMember(memberId)}
                  style={[s.acceptButton, { marginTop: 10 }, busy && s.disabledButton]}
                >
                  <Text style={s.acceptText}>{busy ? 'Confirming…' : `Confirm ${label}`}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {inboxLoading ? <Text style={s.empty}>Refreshing chat…</Text> : null}
        {messages.length === 0 && unreadCount > 0 && !inboxLoading && !(chatNeedsTor && !torLive) ? (
          <Text style={s.empty}>
            A message arrived but could not be opened yet. Tap the onion to Recheck, then reopen this chat. If it still fails, ask them to send again after both phones update.
          </Text>
        ) : null}
        {messages.length === 0 && unreadCount === 0 && !(chatNeedsTor && !torLive) && !inboxLoading && <Text style={s.empty}>No messages yet. This chat is ready for encrypted messaging.</Text>}
        {messages.map(item => {
          const mine = item.senderId === identity.userId;
          const locked = chatNeedsTor && !torLive && !mine;
          const voice = !locked ? parseVoicePayload(item.plaintext) : null;
          const media = !locked ? parseVaultMediaPayload(item.plaintext) : null;
          const status = sendStatusCopy();
          return <Pressable key={item.id} disabled={locked || deletingMessageId === item.id || (mine && item.delivery === 'pending')} onPress={mine && item.delivery === 'failed' ? () => { void sendChatPlaintext(item.plaintext, item.id); } : voice ? () => toggleVoice(item) : undefined} onLongPress={() => setDeleteTarget(item)} delayLongPress={450} style={[s.bubble, mine ? s.sentBubble : s.receivedBubble, deletingMessageId === item.id && s.deletingBubble, locked && s.torLockedBubble]}>
            {locked ? (
              <Text style={s.torLockedText}>Turn on NevTOR and Orbot to open this message.</Text>
            ) : voice ? (
              <VoiceMessageBubble payload={voice} mine={mine} active={playingVoiceId === item.id} failed={failedVoiceId === item.id}/>
            ) : media ? (
              <ChatMediaBubble id={item.id} payload={media} mine={mine} />
            ) : (
              <Text style={mine ? s.sentText : s.receivedText}>{item.plaintext}</Text>
            )}
            <Text style={mine ? s.sentTime : s.receivedTime}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {mine && item.delivery === 'pending' ? `${status.pending} · ` : null}{mine && item.delivery === 'sent' ? status.sent : null}{mine && item.delivery === 'failed' ? status.failed : null}burns {item.expiresAt ? formatExpiry(item.expiresAt) : 'automatically'}</Text>
          </Pressable>;
        })}
      </ScrollView>
      {voiceRecording ? <View style={s.composerTools}><Text style={s.voiceClock}>{formatVoiceClock(voiceElapsed)} / 1:00</Text></View> : null}
      <View style={[s.composer, { paddingBottom: composerPad }]}>
        <Pressable
          onPress={openVaultPicker}
          disabled={busy || voiceProcessing || voiceRecording || (activeChat.torRequired && !activeChat.writeReady)}
          style={s.attachButton}
          accessibilityLabel="Attach file or photo"
        >
          <PaperclipGlyph color={p.accent} />
        </Pressable>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Encrypted message"
          placeholderTextColor={p.muted}
          style={s.composerInput}
          multiline
          scrollEnabled
          textAlignVertical="top"
          blurOnSubmit={false}
          onFocus={() => scrollChatToEnd(true)}
          editable={!voiceRecording && !voiceProcessing && !(activeChat.torRequired && !activeChat.writeReady)}
        />
        {message.trim().length > 0 && !voiceRecording ? (
          <Pressable
            onPress={handleSendMessage}
            disabled={busy || voiceProcessing || (activeChat.torRequired && !activeChat.writeReady)}
            style={s.sendButton}
            accessibilityLabel="Send message"
          >
            <Text style={s.sendButtonText}>{busy ? '…' : '↑'}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={toggleMic}
            disabled={busy || voiceProcessing || (activeChat.torRequired && !activeChat.writeReady)}
            style={[s.micButton, voiceRecording && s.micButtonLive]}
            accessibilityLabel={voiceRecording ? 'Stop recording' : 'Record voice message'}
          >
            <MicButtonGlyph recording={voiceRecording} color={voiceRecording ? '#fff' : p.accent} />
          </Pressable>
        )}
      </View>
      <Modal visible={voiceProcessing} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={s.waitBackdrop}>
          <View style={s.waitCard}>
            <ActivityIndicator color={p.accent} size="large" />
            <Text style={s.waitTitle}>Please wait</Text>
            <Text style={s.waitCopy}>Your words are being re-spoken by a synthetic voice. The original recording is discarded.</Text>
          </View>
        </View>
      </Modal>
      <Modal visible={showModulation} transparent animationType="fade" onRequestClose={() => { if (voiceMode) setShowModulation(false); }}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Choose a speaking voice</Text>
            <Text style={s.modalCopy}>
              Your words are understood on this phone, then spoken again by a synthetic voice. What is sent is that new speech only — not a disguised version of your recording. The original take is discarded and cannot be recovered from the voice note. Change the voice anytime with Voice at the top right.
            </Text>
            {VOICE_MODES.map(item => (
              <Pressable key={item.id} onPress={() => chooseModulation(item.id)} style={[s.modalPrimary, voiceMode === item.id && s.modulationChosen]}>
                <Text style={s.modalPrimaryText}>{item.label}</Text>
              </Pressable>
            ))}
            {voiceMode ? <Pressable onPress={() => setShowModulation(false)} style={s.modalClose}><Text style={s.modalCloseText}>Cancel</Text></Pressable> : null}
          </View>
        </View>
      </Modal>
      <SecurityModal visible={showSecurity} onClose={() => setShowSecurity(false)} fingerprint={identity.fingerprint}/>
      <Modal visible={showMembers} transparent animationType="fade" onRequestClose={() => setShowMembers(false)}>
        <View style={s.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMembers(false)} />
          <View style={[s.sheetCard, { paddingBottom: 10 + androidBottomInset() }]}>
            <Text style={s.sheetTitle}>{labelFor(activeChat)}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {memberRows.map((row) => (
                <View key={row.id} style={s.memberRow}>
                  <Text style={s.memberName} numberOfLines={1}>{row.label}</Text>
                  {row.sub ? <Text style={s.memberSub} numberOfLines={1}>{row.sub}</Text> : null}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setShowMembers(false)} style={s.sheetRow}>
              <Text style={s.sheetCancel}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showVaultPicker} transparent animationType="fade" onRequestClose={() => setShowVaultPicker(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Send from Gallery</Text>
            <Text style={s.modalCopy}>Tap one or more previews, then send them together. Media is selected from your private NEVULA Gallery.</Text>
            <ScrollView style={s.vaultPickList} contentContainerStyle={s.vaultPickGrid}>
              {vaultItems.length === 0 ? <Text style={s.empty}>The private gallery is empty.</Text> : vaultItems.map(item => (
                <Pressable key={item.id} onPress={() => setSelectedVaultIds(current=>current.includes(item.id)?current.filter(id=>id!==item.id):[...current,item.id])} style={[s.vaultPickTile,selectedVaultIds.includes(item.id)&&s.vaultPickSelected]}>
                  <VaultPickerPreview item={item}/>
                  <View style={[s.vaultCheck,selectedVaultIds.includes(item.id)&&s.vaultCheckOn]}><Text style={s.vaultCheckText}>{selectedVaultIds.includes(item.id)?'✓':''}</Text></View>
                  <Text style={s.vaultPickName} numberOfLines={1}>{item.originalName ?? (item.kind==='photo'?'Private photo':item.kind==='video'?'Private video':'Private file')}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable disabled={!selectedVaultIds.length||busy} onPress={handleSendVaultItems} style={[s.modalPrimary,(!selectedVaultIds.length||busy)&&s.disabledButton]}><Text style={s.modalPrimaryText}>{busy?'Sending…':selectedVaultIds.length?`Send ${selectedVaultIds.length} selected`:'Select media to send'}</Text></Pressable>
            <Pressable onPress={() => setShowVaultPicker(false)} style={s.modalClose}><Text style={s.modalCloseText}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={s.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />
          <View style={[s.sheetCard, { paddingBottom: 10 + androidBottomInset() }]}>
            <Text style={s.sheetTitle}>Delete message?</Text>
            {deleteTarget && identity && deleteTarget.senderId === identity.userId ? (
              <Pressable onPress={handleDeleteForEveryone} style={s.sheetRow}>
                <Text style={s.sheetDanger}>Delete for everyone</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={handleDeleteForMe} style={s.sheetRow}>
              <Text style={s.sheetDanger}>Delete for me</Text>
            </Pressable>
            <Pressable onPress={() => setDeleteTarget(null)} style={s.sheetRow}>
              <Text style={s.sheetCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={showInvite} transparent animationType="fade" onRequestClose={() => setShowInvite(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Invite to this chat</Text>
            <Text style={s.modalCopy}>
              {activeChat.torRequired || chatRequireMine || chatRequirePeer
                ? 'Only people in your contact list. They must confirm Orbot before joining — same Tor rules as this chat.'
                : 'Only people in your contact list. They enter this chat normally.'}
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {contacts
                .filter(c => !c.blocked)
                .filter(c => c.userId !== identity.userId)
                .filter(c => c.userId !== activeChat.userId)
                .filter(c => !activeChat.memberIds.includes(c.userId))
                .map(contact => {
                  const on = invitePick.has(contact.userId);
                  return (
                    <Pressable
                      key={contact.userId}
                      onPress={() => {
                        setInvitePick(prev => {
                          const next = new Set(prev);
                          if (next.has(contact.userId)) next.delete(contact.userId);
                          else next.add(contact.userId);
                          return next;
                        });
                      }}
                      style={[s.pickRow, on && s.rowVerified]}
                    >
                      <Text style={s.rowName} numberOfLines={1}>{on ? '✓ ' : ''}{labelFor(contact)}</Text>
                      {!hasChosenName(contact) ? <Text style={s.small} numberOfLines={1}>{contact.nevulaId}</Text> : null}
                    </Pressable>
                  );
                })}
            </ScrollView>
            <Pressable
              disabled={busy || invitePick.size < 1}
              onPress={invitePeople}
              style={[s.modalPrimary, (busy || invitePick.size < 1) && s.disabledButton]}
            >
              <Text style={s.modalPrimaryText}>{busy ? 'Inviting…' : 'Send invite'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowInvite(false)} style={s.modalClose}>
              <Text style={s.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <RetentionModal visible={showChatRetention} title="Burning in this chat" copy="Choose how long messages stay before they burn. This applies only to this conversation. The Messages burning timer at the top right stays unchanged unless a chat uses it." initial={chatRetention ?? defaultRetention} inherited={!chatRetention} onClose={() => setShowChatRetention(false)} onSave={async (setting, useDefault) => { await setConversationRetention(identity.userId, activeChat.conversationId, useDefault ? null : setting); setChatRetention(useDefault ? null : setting); setShowChatRetention(false); }}/>
      </KeyboardAvoidingView>
      <AvatarSheet visible={avatarSheet} hasPicture={Boolean(selfAvatar)} backgroundColor={p.surfaceAlt} textColor={p.text} borderColor={p.border} dangerColor={p.danger} onClose={() => setAvatarSheet(false)} onGallery={() => { void onAvatarGallery(); }} onNevula={() => { void onAvatarNevula(); }} onCamera={() => { void onAvatarCamera(); }} onRemove={() => { void onAvatarRemove(); }} />
      <Modal visible={avatarVault} transparent animationType="fade" onRequestClose={() => setAvatarVault(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{avatarCopy().nevula}</Text>
            <ScrollView style={s.vaultPickList}>
              {avatarPhotos.length === 0 ? <Text style={s.empty}>{avatarCopy().empty}</Text> : avatarPhotos.map(item => (
                <Pressable key={item.id} onPress={() => { void onAvatarVaultPhoto(item); }} style={s.vaultPickRow}>
                  <Text style={s.vaultPickName} numberOfLines={1}>{item.originalName || 'Photo'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setAvatarVault(false)} style={s.modalClose}><Text style={s.modalCloseText}>{avatarCopy().close}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>;
  }

  return <SafeAreaView style={[s.container,s.safeContainer]}>
    <View style={s.header}>
      <Pressable onPress={onBack} style={s.iconButton}><Text style={s.backText}>{'\u2039'}</Text></Pressable>
      <Pressable onPress={() => setShowSecurity(true)} style={s.headerCopy}>
        <Text style={s.brandTitle}>NEVULA</Text>
      </Pressable>
    </View>
    <View style={s.securityBar}>
      <Pressable
        onPress={() => setShowSecurity(true)}
        style={s.nvl3Chip}
        accessibilityRole="button"
        accessibilityLabel="NVL3-QR encryption info"
        hitSlop={6}
      >
        <Text style={s.nvl3ChipText}>NVL3-QR</Text>
      </Pressable>
      <View style={s.securityBarMid} />
      <Pressable onPress={() => setShowDefaultRetention(true)} style={[s.securityFlat, s.securityFlatEnd]}>
        <Text style={s.securityTitle}>BURNING</Text>
        <Text style={s.securitySub}>{formatRetention(defaultRetention)}</Text>
      </Pressable>
    </View>

    <Pressable
      onPress={() => setAvatarSheet(true)}
      accessibilityRole="button"
      accessibilityLabel={avatarCopy().title}
      style={{ alignSelf: 'center', marginTop: 2, marginBottom: 14 }}
    >
      <AvatarFace uri={selfAvatar} size={72} borderColor={p.border} backgroundColor={p.surfaceAlt} iconColor={p.muted} />
    </Pressable>

    <View style={s.tabs}>
      <Pressable onPress={() => setTab('chats')} style={[s.tab, tab === 'chats' && s.tabActive]}><Text style={s.tabText}>Messages</Text></Pressable>
      <Pressable onPress={() => setTab('contacts')} style={[s.tab, tab === 'contacts' && s.tabActive]}>
        <Text style={s.tabText}>
          {(requests.length + outgoingPending.length) > 0
            ? `Contacts (${requests.length + outgoingPending.length})`
            : 'Contacts'}
        </Text>
      </Pressable>
    </View>

    <View style={s.searchWrap}><TextInput value={query} onChangeText={setQuery} placeholder={tab === 'chats' ? 'Search secure chats' : 'Search contacts or NEVULA ID'} placeholderTextColor={p.muted} style={s.search}/></View>
    {tab === 'chats' && (
      <View style={s.quickActions}>
        <Pressable onPress={() => { setNewChatPeerId(null); setShowNewChat(true); }} style={s.primaryAction}>
          <Text style={s.primaryText}>New chat</Text>
        </Pressable>
      </View>
    )}
    {tab === 'contacts' && <><View style={s.quickActions}>
      <Pressable onPress={openPairingScanner} style={s.primaryAction}><Text style={s.primaryText}>▣ Scan QR</Text></Pressable>
      <Pressable onPress={() => setShowMyId(true)} style={s.secondaryAction}><Text style={s.secondaryText}>My QR / Key</Text></Pressable>
    </View>
    <Pressable onPress={() => setShowPublicLink(true)} style={s.manualAction}><Text style={s.manualActionText}>Public contact link</Text></Pressable>
    <Pressable onPress={() => { setNewId(''); setShowAdd(true); }} style={s.manualAction}><Text style={s.manualActionText}>Enter Key manually</Text></Pressable></>}

    {tab === 'contacts' && requests.length > 0 && (
      <View style={s.requestSection}>
        <Text style={s.section}>PAIRING REQUESTS</Text>
        {requests.map(request => (
          <Pressable
            key={request.id}
            delayLongPress={450}
            onLongPress={() => confirmDeletePending(() => { void deleteIncomingPending(request); })}
            onPress={() => setIncomingRequestModal(request)}
            style={s.requestCard}
          >
            <View style={s.rowBody}>
              <Text style={s.rowName}>{request.senderNevulaId}</Text>
              <Text style={s.small}>Pending — tap to Accept or Decline. Hold to delete.</Text>
            </View>
            <View style={s.requestBadge}>
              <Text style={s.requestBadgeText}>1</Text>
            </View>
          </Pressable>
        ))}
      </View>
    )}
    {tab === 'contacts' && outgoingPending.length > 0 && (
      <View style={s.requestSection}>
        <Text style={s.section}>REQUESTS YOU SENT</Text>
        {outgoingPending.map(row => (
          <Pressable
            key={row.peerUserId}
            delayLongPress={450}
            onLongPress={() => confirmDeletePending(() => { void deleteOutgoingPending(row.peerUserId); })}
            style={s.requestCard}
          >
            <View style={s.rowBody}>
              <Text style={s.rowName}>{row.label}</Text>
              <Text style={s.small}>Pending — hold to delete</Text>
            </View>
            <View style={s.statusPill}>
              <Text style={s.statusPillText}>Pending</Text>
            </View>
          </Pressable>
        ))}
      </View>
    )}

    <Text style={s.section}>{tab === 'chats' ? 'SECURE CHATS' : 'PRIVATE CONTACT ALIASES'}</Text>
    <View style={{ flex: 1 }}>
    <ScrollView
      contentContainerStyle={s.list}
      scrollEnabled={!chatListScrollLock && !dragId}
      keyboardShouldPersistTaps="handled"
    >
      {tab === 'chats' ? (
        <>
          {filteredChats.length === 0 && <Text style={s.empty}>No secure chats yet.</Text>}
          {filteredChats.map(chat => {
            const chatUnread = unreadByConversation[chat.conversationId] ?? 0;
            const torChat = torChatKeys.has(chat.conversationId) || Boolean(chat.torRequired);
            const sub = chatListSubtitle(chat);
            const pinTone = pinnedToneFor(chat.conversationId, listPrefs.pinned);
            const pinned = Boolean(pinTone);
            let dragOffsetY = 0;
            if (dragId) {
              const prefsNow = listPrefs;
              const pinnedSet = new Set(prefsNow.pinned);
              const isPinned = pinnedSet.has(chat.conversationId);
              const group = filteredChats.filter(c => pinnedSet.has(c.conversationId) === isPinned);
              const fromInGroup = group.findIndex(c => c.conversationId === dragId);
              const myInGroup = group.findIndex(c => c.conversationId === chat.conversationId);
              if (fromInGroup >= 0 && myInGroup >= 0) {
                if (chat.conversationId === dragId) {
                  dragOffsetY = dragDy;
                } else {
                  const toInGroup = Math.max(0, Math.min(group.length - 1, fromInGroup + Math.round(dragDy / ROW_H)));
                  if (fromInGroup < toInGroup && myInGroup > fromInGroup && myInGroup <= toInGroup) {
                    dragOffsetY = -ROW_H;
                  } else if (fromInGroup > toInGroup && myInGroup < fromInGroup && myInGroup >= toInGroup) {
                    dragOffsetY = ROW_H;
                  }
                }
              }
            }
            return (
              <ChatListSwipeRow
                key={chat.conversationId}
                pinned={pinned}
                closeSignal={swipeCloseSignal}
                scrollLock={setChatListScrollLock}
                onPress={() => {
                  setActiveChat(chat);
                  if (!identity || chat.kind === 'group' || !chat.userId || chat.blocked) return;
                  if (rechatAnnouncedRef.current.has(chat.conversationId)) return;
                  rechatAnnouncedRef.current.add(chat.conversationId);
                  void announceThreadInvite({
                    thread: {
                      conversationId: chat.conversationId,
                      kind: 'dm',
                      memberIds: [chat.userId],
                      title: chat.title,
                      torRequired: Boolean(chat.torRequired),
                      confirmations: {},
                      createdAt: new Date().toISOString(),
                    },
                    senderId: identity.userId,
                    onlyMemberIds: [chat.userId],
                  }).catch(() => undefined);
                }}
                onTogglePin={() => { void handleChatPin(chat); }}
                onConfirmDelete={() => { void handleChatDelete(chat); }}
                onDragStart={() => startChatDrag(chat)}
                onDragMove={(dy) => {
                  dragDyRef.current = dy;
                  setDragDy(dy);
                }}
                onDragEnd={(dy) => {
                  dragDyRef.current = dy;
                  finishChatDragRef.current();
                }}
                dragging={dragId === chat.conversationId}
                dragOffsetY={dragOffsetY}
                style={[
                  s.row,
                  { minHeight: 68, borderRadius: 16, paddingVertical: 8 },
                  chatUnread > 0 && s.rowUnread,
                  pinTone && { borderColor: pinTone.border, backgroundColor: pinTone.background },
                ]}
              >
                <AvatarFace uri={chat.kind === 'group' ? null : peerAvatars[chat.userId] ?? null} size={46} borderColor={p.border} backgroundColor={p.surfaceAlt} iconColor={p.muted} />
                <View style={[s.rowBody, { marginLeft: 12 }]}>
                  <View style={s.nameRow}>
                    {pinTone ? <Text style={[s.pinMark, { color: pinTone.border }]}>📌</Text> : null}
                    <Text style={s.rowName} numberOfLines={1}>{labelFor(chat)}</Text>
                  </View>
                  {sub ? <Text style={s.small} numberOfLines={1}>{sub}</Text> : null}
                </View>
                {chatUnread > 0 ? (
                  <View style={s.rowUnreadChip} accessibilityLabel={unreadLabel(chatUnread)}>
                    <Text style={s.rowUnreadChipText}>{unreadCountLabel(chatUnread)}</Text>
                  </View>
                ) : null}
                {torChat ? (
                  <View style={s.rowOnion} pointerEvents="none">
                    <OrbotOnionMark compact size={16} />
                  </View>
                ) : null}
              </ChatListSwipeRow>
            );
          })}
        </>
      ) : (
        <>
          {filteredContacts.length === 0 && <Text style={s.empty}>No secure contacts yet.</Text>}
          {filteredContacts.map(contact => {
            const named = hasChosenName(contact);
            return (
            <Swipeable
              key={contact.userId}
              renderLeftActions={() => (
                <Pressable
                  onPress={() => { void handleDeleteContact(contact); }}
                  style={s.contactDeleteRail}
                  accessibilityLabel="Delete contact"
                >
                  <Text style={s.contactDeleteRailText}>Delete</Text>
                </Pressable>
              )}
              overshootLeft={false}
            >
            <Pressable onPress={() => openAliasEditor(contact)} style={[s.row, { minHeight: 68, borderRadius: 16, paddingVertical: 8 }]}>
              <AvatarFace uri={peerAvatars[contact.userId] ?? null} size={46} borderColor={p.border} backgroundColor={p.surfaceAlt} iconColor={p.muted} />
              <View style={[s.rowBody, { marginLeft: 12 }]}>
                <View style={s.nameRow}>
                  <Text style={s.rowName} numberOfLines={1}>{labelFor(contact)}</Text>
                </View>
                {!named || contact.blocked ? (
                  <Text style={s.small} numberOfLines={1}>
                    {contact.blocked ? 'Blocked on this device' : contact.nevulaId}
                  </Text>
                ) : null}
              </View>
              <Text style={s.lock}>Edit</Text>
            </Pressable>
            </Swipeable>
            );
          })}
        </>
      )}
    </ScrollView>
    </View>

    <Modal visible={Boolean(editingContact)} transparent animationType="fade" onRequestClose={() => setEditingContact(null)}>
      <KeyboardAvoidingView style={s.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modalBackdrop, { justifyContent: 'flex-end', paddingBottom: Math.max(12, keyboardHeight > 0 ? keyboardHeight : androidBottomInset()) }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.modalScrollBottom}
            showsVerticalScrollIndicator
            style={s.modalSheetScroll}
          >
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Private contact alias</Text>
              <View style={s.aliasWarning}>
                <Text style={s.aliasWarningTitle}>Please don't put real names.</Text>
                <Text style={s.aliasWarningText}>For your security, choose a private nickname that only means something to you. The alias stays on this device.</Text>
              </View>
              <TextInput
                value={aliasDraft}
                onChangeText={setAliasDraft}
                maxLength={40}
                autoCorrect={false}
                placeholder="Private nickname"
                placeholderTextColor={p.muted}
                style={s.idInput}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => { void handleSaveAlias(); }}
              />
              {editingContact ? <Text style={s.aliasId}>{editingContact.nevulaId}</Text> : null}
              <Pressable disabled={busy} onPress={handleSaveAlias} style={s.modalPrimary}>
                <Text style={s.modalPrimaryText}>{busy ? 'Saving…' : 'Save alias'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => editingContact && void handleDeleteContact(editingContact)} style={s.blockButton}>
                <Text style={s.blockButtonText}>Delete contact</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={handleToggleBlock} style={s.blockButton}>
                <Text style={s.blockButtonText}>{editingContact?.blocked ? 'Unblock contact' : 'Block contact'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => setEditingContact(null)} style={s.modalClose}>
                <Text style={s.modalCloseText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={showAdd} transparent animationType="fade" onRequestClose={() => setShowAdd(false)}>
      <KeyboardAvoidingView style={s.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modalBackdrop, { justifyContent: 'flex-end', paddingBottom: Math.max(12, keyboardHeight > 0 ? keyboardHeight : androidBottomInset()) }]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.modalScrollBottom}
            showsVerticalScrollIndicator
            style={s.modalSheetScroll}
          >
            <View style={s.modalSheet}>
              <Text style={s.modalTitle}>Add secure contact</Text>
              <Text style={s.modalCopy}>Paste their pairing link (from My QR / Key), or enter a known NEVULA ID to send a contact request.</Text>
              <TextInput
                value={newId}
                onChangeText={value => {
                  const trimmed = value.trim();
                  if (/nevula:/i.test(trimmed) || trimmed.includes('pair?') || trimmed.includes('://')) setNewId(value);
                  else setNewId(formatNevulaIdInput(value));
                }}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                placeholder="Paste pairing link or NVL-___-___-____"
                placeholderTextColor={p.muted}
                style={[s.idInput, s.idInputTall]}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => {
                  if (!busy && newId.trim().length >= 8) void handleSendRequest();
                }}
              />
              <Pressable
                disabled={busy || newId.trim().length < 8}
                onPress={handleSendRequest}
                style={[s.modalPrimary, (busy || newId.trim().length < 8) && s.disabledButton]}
              >
                <Text style={s.modalPrimaryText}>{busy ? 'Sending…' : 'Send request'}</Text>
              </Pressable>
              <Pressable onPress={() => setShowAdd(false)} style={s.modalClose}>
                <Text style={s.modalCloseText}>Close</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={Boolean(requestSentInfo)} transparent animationType="fade" onRequestClose={() => setRequestSentInfo(null)}>
      <View style={s.modalBackdrop}>
        <View style={s.statusCard}>
          <Text style={s.statusEyebrow}>CONTACT REQUEST</Text>
          <Text style={s.modalTitle}>{requestSentInfo?.status === 'confirmed' ? 'Contact confirmed' : 'Request sent'}</Text>
          {requestSentInfo?.label ? (
            <Text style={s.statusLabel} numberOfLines={2}>{requestSentInfo.label}</Text>
          ) : null}
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>{requestSentInfo?.status === 'confirmed' ? 'Confirmed' : 'Pending'}</Text>
          </View>
          <Text style={s.modalCopy}>{requestSentInfo?.detail}</Text>
          <Pressable
            onPress={() => {
              setRequestSentInfo(null);
              setShowAdd(false);
              setShowScanner(false);
              setTab('contacts');
            }}
            style={s.modalPrimary}
          >
            <Text style={s.modalPrimaryText}>Back to contacts</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(incomingRequestModal)} transparent animationType="fade" onRequestClose={() => setIncomingRequestModal(null)}>
      <View style={s.modalBackdrop}>
        <View style={s.statusCard}>
          <Text style={s.statusEyebrow}>CONTACT REQUEST</Text>
          <Text style={s.modalTitle}>Accept contact?</Text>
          <Text style={s.statusLabel} numberOfLines={2}>{incomingRequestModal?.senderNevulaId ?? 'Unknown'}</Text>
          <Text style={s.modalCopy}>
            They want to add you as a secure contact. Accept to confirm on both sides, or Decline to refuse. No chat opens automatically.
          </Text>
          <Pressable
            disabled={busy || !incomingRequestModal}
            onPress={() => { if (incomingRequestModal) void handleAccept(incomingRequestModal); }}
            style={[s.modalPrimary, busy && s.disabledButton]}
          >
            <Text style={s.modalPrimaryText}>{busy ? 'Working…' : 'Accept'}</Text>
          </Pressable>
          <Pressable
            disabled={busy || !incomingRequestModal}
            onPress={() => { if (incomingRequestModal) void handleDecline(incomingRequestModal); }}
            style={s.blockButton}
          >
            <Text style={s.blockButtonText}>Decline</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={() => setIncomingRequestModal(null)} style={s.modalClose}>
            <Text style={s.modalCloseText}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={showNewChat} transparent animationType="fade" onRequestClose={() => setShowNewChat(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{newChatPeerId ? 'Orbot for this chat?' : 'New chat'}</Text>
          {!newChatPeerId ? (
            <>
              <ScrollView style={{ maxHeight: 320 }}>
                {contacts.filter(c => !c.blocked).map(contact => (
                  <Pressable key={contact.userId} onPress={() => setNewChatPeerId(contact.userId)} style={s.pickRow}>
                    <Text style={s.rowName} numberOfLines={1}>{labelFor(contact)}</Text>
                    {!hasChosenName(contact) ? <Text style={s.small} numberOfLines={1}>{contact.nevulaId}</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={() => setShowNewChat(false)} style={s.modalClose}><Text style={s.modalCloseText}>Close</Text></Pressable>
            </>
          ) : (
            <>
              <Pressable
                disabled={busy}
                onPress={() => {
                  const peer = contacts.find(c => c.userId === newChatPeerId);
                  if (peer) startExtraDm(peer, true);
                }}
                style={s.modalPrimary}
              >
                <Text style={s.modalPrimaryText}>{busy ? 'Wird geöffnet…' : 'Yes — Orbot'}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => {
                  const peer = contacts.find(c => c.userId === newChatPeerId);
                  if (peer) startExtraDm(peer, false);
                }}
                style={s.modalPrimary}
              >
                <Text style={s.modalPrimaryText}>{busy ? 'Wird geöffnet…' : 'No — without Orbot'}</Text>
              </Pressable>
              <Pressable onPress={() => setNewChatPeerId(null)} style={s.modalClose}><Text style={s.modalCloseText}>Back</Text></Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>

    <Modal visible={showMyId} transparent animationType="fade" onRequestClose={() => setShowMyId(false)}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowMyId(false)} accessibilityLabel="Dismiss pairing code" />
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Your NEVULA pairing code</Text>
          <Text style={s.modalCopy}>Let the other person scan this code in person. After they scan and you accept their request, both phones are paired — they do not need to scan you back. The code contains your NEVULA ID, device fingerprint, and public device key, never your private key. You can also share the pairing link.</Text>
          {identity && <View style={s.qrWrap}><QRCode value={createPairingQrPayload(identity)} size={210} backgroundColor="#ffffff" color="#02050a"/></View>}
          <Text style={s.myId}>{identity?.nevulaId ?? 'Unavailable'}</Text>
          <Text style={s.modalCopy}>Device fingerprint</Text>
          <Text selectable style={s.fingerprint}>{identity?.fingerprint ?? 'Unavailable'}</Text>
          <Text style={s.modalCopy}>Pairing link</Text>
          <Text selectable style={s.fingerprint}>{identity ? createPairingQrPayload(identity) : 'Unavailable'}</Text>
          <Pressable onPress={() => setShowMyId(false)} style={s.modalPrimary}><Text style={s.modalPrimaryText}>Close</Text></Pressable>
        </View>
      </View>
    </Modal>
    {identity && (
      <PublicContactInvite
        visible={Boolean(inviteToken || scannedInvite || showPublicLink)}
        identity={identity}
        token={scannedInvite ?? inviteToken}
        onClose={() => {
          setShowPublicLink(false);
          setScannedInvite(null);
          onInviteDismiss?.();
        }}
        onSent={() => refresh(identity)}
      />
    )}
    <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}><View style={s.scannerScreen}>{scannerLive && <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={qrScanned ? undefined : result => handleScannedPairingCode(result.data)}/>}<SafeAreaView style={s.scannerOverlay} pointerEvents="box-none"><View style={s.scannerHeader}><Pressable onPress={() => setShowScanner(false)} style={s.iconButton}><Text style={s.backText}>×</Text></Pressable><View><Text style={s.eyebrow}>SECURE PAIRING</Text><Text style={s.scannerTitle}>Scan NEVULA QR</Text></View></View><View style={s.scanFrame}/><View style={s.scannerHint}><Text style={s.scannerHintText}>{busy ? 'Verifying device key…' : 'Place the other phone’s pairing code inside the frame.'}</Text></View></SafeAreaView></View></Modal>
    <SecurityModal visible={showSecurity} onClose={() => setShowSecurity(false)} fingerprint={identity?.fingerprint}/>
    {identity && <RetentionModal
      visible={showDefaultRetention}
      title="Burning timer"
      copy="This is how long messages stay before they burn in every chat that does not have its own timer. Changing it here does not overwrite a chat you already customized."
      initial={defaultRetention}
      onClose={() => setShowDefaultRetention(false)}
      onSave={async setting => {
        const next = await setDefaultRetention(identity.userId, setting);
        setDefaultRetentionState(next);
        setShowDefaultRetention(false);
      }}
    />}
    <AvatarSheet visible={avatarSheet} hasPicture={Boolean(selfAvatar)} backgroundColor={p.surfaceAlt} textColor={p.text} borderColor={p.border} dangerColor={p.danger} onClose={() => setAvatarSheet(false)} onGallery={() => { void onAvatarGallery(); }} onNevula={() => { void onAvatarNevula(); }} onCamera={() => { void onAvatarCamera(); }} onRemove={() => { void onAvatarRemove(); }} />
    <Modal visible={avatarVault} transparent animationType="fade" onRequestClose={() => setAvatarVault(false)}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{avatarCopy().nevula}</Text>
          <ScrollView style={s.vaultPickList}>
            {avatarPhotos.length === 0 ? <Text style={s.empty}>{avatarCopy().empty}</Text> : avatarPhotos.map(item => (
              <Pressable key={item.id} onPress={() => { void onAvatarVaultPhoto(item); }} style={s.vaultPickRow}>
                <Text style={s.vaultPickName} numberOfLines={1}>{item.originalName || 'Photo'}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setAvatarVault(false)} style={s.modalClose}><Text style={s.modalCloseText}>{avatarCopy().close}</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function VaultPickerPreview({item}:{item:VaultItem}){
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const[uri,setUri]=useState<string|null>(null);
  useEffect(()=>{let live=true;revealVaultItem(item).then(value=>{if(live)setUri(value);}).catch(()=>undefined);return()=>{live=false;};},[item]);
  if(!uri)return <View style={[s.vaultPreview,s.vaultPreviewLoading]}><ActivityIndicator size="small"/></View>;
  if(item.kind==='photo')return <Image source={{uri}} style={s.vaultPreview} resizeMode="cover"/>;
  if(item.kind==='video')return <VaultPickerVideo uri={uri}/>;
  return <View style={[s.vaultPreview,s.vaultFilePreview]}><Text style={s.vaultFileIcon}>▣</Text><Text style={s.vaultPickKind}>FILE</Text></View>;
}

function VaultPickerVideo({uri}:{uri:string}){
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const player=useVideoPlayer(uri,next=>{next.loop=false;next.muted=true;next.currentTime=.1;});
  return <View style={s.vaultPreview}><VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover"/><View style={s.vaultVideoPlay}><Text style={s.vaultVideoPlayText}>▶</Text></View></View>;
}

function formatRetention(setting: RetentionSetting) {
  const unit = setting.value === 1 ? setting.unit.slice(0, -1) : setting.unit;
  return `${setting.value} ${unit}`;
}

function formatExpiry(value: string) {
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining <= 0) return 'now';
  if (remaining < 3_600_000) return `in ${Math.max(1, Math.ceil(remaining / 60_000))}m`;
  if (remaining < 86_400_000) return `in ${Math.ceil(remaining / 3_600_000)}h`;
  return `in ${Math.ceil(remaining / 86_400_000)}d`;
}

function RetentionModal({ visible, title, copy, initial, inherited, onClose, onSave }: { visible: boolean; title: string; copy?: string; initial: RetentionSetting; inherited?: boolean; onClose: () => void; onSave: (setting: RetentionSetting, useDefault?: boolean) => Promise<void> }) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  const [value, setValue] = useState(String(initial.value));
  const [unit, setUnit] = useState<RetentionSetting['unit']>(initial.unit);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) { setValue(String(initial.value)); setUnit(initial.unit); } }, [visible, initial.value, initial.unit]);
  const max = unit === 'minutes' ? 40320 : unit === 'hours' ? 672 : 28;
  const save = async (useDefault = false) => {
    setSaving(true);
    try { await onSave({ value: Math.min(max, Math.max(1, Number(value) || 1)), unit }, useDefault); }
    catch (error: any) { Alert.alert('Could not save burning timer', error?.message ?? 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={s.modalBackdrop}><View style={s.modalCard}>
    <Text style={s.modalTitle}>{title}</Text>
    <Text style={s.modalCopy}>{copy ?? 'Messages always burn. Choose minutes, hours or days. The maximum is 28 days; burning cannot be turned off.'}</Text>
    <View style={s.retentionInputRow}><TextInput value={value} onChangeText={setValue} keyboardType="number-pad" style={s.durationInput}/><View style={s.unitRow}>{(['minutes','hours','days'] as const).map(item => <Pressable key={item} onPress={() => setUnit(item)} style={[s.unitButton, unit === item && s.unitButtonOn]}><Text style={[s.unitText, unit === item && s.unitTextOn]}>{item}</Text></Pressable>)}</View></View>
    <Text style={s.retentionHint}>Allowed range: 1–{max} {unit} · hard limit 28 days</Text>
    <Pressable disabled={saving} onPress={() => save(false)} style={s.modalPrimary}><Text style={s.modalPrimaryText}>{saving ? 'Saving…' : 'Save burning timer'}</Text></Pressable>
    {inherited !== undefined && <Pressable disabled={saving || inherited} onPress={() => save(true)} style={s.modalClose}><Text style={[s.modalCloseText, inherited && s.disabledText]}>{inherited ? 'Using Messages burning timer' : 'Use Messages burning timer'}</Text></Pressable>}
    <Pressable onPress={onClose} style={s.modalClose}><Text style={s.modalCloseText}>Cancel</Text></Pressable>
  </View></View></Modal>;
}

function SecurityModal({ visible, onClose, fingerprint }: { visible: boolean; onClose: () => void; fingerprint?: string }) {
  const { palette: p } = useDisplayTheme();
  const s = useMemo(() => makeStyles(p), [p]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>NVL3-QR Encryption</Text>
          <Text style={s.modalCopy}>
            Next-generation cryptographic protection combining quantum-resistant encryption with hardened end-to-end security. NVL3 protects every session with advanced key exchange, layered encryption and metadata-minimizing architecture.
          </Text>
          <View style={s.securityRow}><Text style={s.securityLabel}>Private keys</Text><Text style={s.securityValue}>This device only</Text></View>
          <View style={s.securityRow}><Text style={s.securityLabel}>Server retention</Text><Text style={s.securityValue}>Maximum 28 days</Text></View>
          {fingerprint ? <><Text style={s.securityLabel}>Device fingerprint</Text><Text selectable style={s.fingerprint}>{fingerprint}</Text></> : null}
          <Pressable onPress={onClose} style={s.modalPrimary}><Text style={s.modalPrimaryText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(p: HomePalette) {
  return StyleSheet.create({
    safeContainer:{paddingHorizontal:16,paddingTop:androidStatusInset(12),paddingBottom:Platform.OS==='android'?4:0},
    vaultPickGrid:{flexDirection:'row',flexWrap:'wrap',gap:9,paddingVertical:4},vaultPickTile:{width:'31%',borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,overflow:'hidden',paddingBottom:7},vaultPickSelected:{borderColor:p.accent,backgroundColor:p.accentSoft},vaultPreview:{width:'100%',aspectRatio:1,backgroundColor:p.surfaceAlt,overflow:'hidden'},vaultPreviewLoading:{alignItems:'center',justifyContent:'center'},vaultFilePreview:{alignItems:'center',justifyContent:'center'},vaultFileIcon:{color:p.accent,fontSize:25},vaultVideoPlay:{position:'absolute',inset:0,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(0,0,0,.16)'},vaultVideoPlayText:{color:'#fff',fontSize:22},vaultCheck:{position:'absolute',right:6,top:6,width:22,height:22,borderRadius:11,borderWidth:1,borderColor:p.text,backgroundColor:'rgba(0,0,0,.55)',alignItems:'center',justifyContent:'center'},vaultCheckOn:{backgroundColor:p.accent,borderColor:p.accent},vaultCheckText:{color:'#fff',fontSize:12,fontWeight:'900'},
    container:{flex:1,backgroundColor:p.bg,paddingHorizontal:20,paddingTop:androidStatusInset(8)},keyboardLayout:{flex:1},center:{alignItems:'center',justifyContent:'center',gap:14},header:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:10},chatHeader:{paddingBottom:12,borderBottomWidth:1,borderBottomColor:p.border},chatHeaderTop:{flexDirection:'row',alignItems:'center',position:'relative'},chatHeaderTorCenter:{position:'absolute',left:0,right:0,top:0,bottom:0,alignItems:'center',justifyContent:'center',zIndex:2},headerCopy:{flex:1,marginLeft:10},unreadBadge:{maxWidth:140,borderRadius:12,paddingHorizontal:10,paddingVertical:6,backgroundColor:'rgba(78,163,255,0.18)',borderWidth:1,borderColor:'#4ea3ff',shadowColor:'#4ea3ff',shadowOpacity:0.45,shadowRadius:8,shadowOffset:{width:0,height:0},elevation:3},unreadBadgeText:{color:'#4ea3ff',fontSize:10,fontWeight:'800',textAlign:'right'},unreadCountChip:{flexDirection:'row',alignItems:'center',gap:6,minWidth:40,borderRadius:14,paddingHorizontal:11,paddingVertical:8,backgroundColor:'rgba(78,163,255,0.2)',borderWidth:1,borderColor:'#4ea3ff'},unreadCountChipGlyph:{color:'#4ea3ff',fontSize:18,fontWeight:'700',lineHeight:20},unreadCountChipText:{color:'#4ea3ff',fontSize:14,fontWeight:'900'},rowUnread:{borderColor:'#4ea3ff'},rowUnreadChip:{minWidth:24,height:24,borderRadius:12,paddingHorizontal:7,backgroundColor:'#4ea3ff',alignItems:'center',justifyContent:'center',marginLeft:8},rowUnreadChipText:{color:'#fff',fontSize:12,fontWeight:'900'},rowOnion:{marginLeft:8,justifyContent:'center'},torWaitBanner:{marginBottom:12,borderRadius:14,borderWidth:1.5,borderColor:'#4ea3ff',backgroundColor:'rgba(78,163,255,0.16)',paddingHorizontal:14,paddingVertical:12,shadowColor:'#4ea3ff',shadowOpacity:0.55,shadowRadius:12,shadowOffset:{width:0,height:0},elevation:5},torWaitBannerTitle:{color:'#4ea3ff',fontSize:15,fontWeight:'800',marginBottom:4},torWaitBannerCopy:{color:'#9ec7ff',fontSize:12,lineHeight:17,fontWeight:'600'},securityBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14,minHeight:36},securityBarInChat:{marginTop:8,marginBottom:0},securityBarLeft:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:0},nvl3Chip:{height:30,minWidth:30,borderRadius:8,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:8,alignItems:'center',justifyContent:'center'},nvl3ChipOn:{borderColor:p.accent,backgroundColor:p.accent,shadowOpacity:0,shadowRadius:0,elevation:0},nvl3ChipText:{color:p.muted,fontSize:10,fontWeight:'700'},nvl3ChipTextOn:{color:'#fff'},torModeBubble:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,paddingVertical:7,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.surface},torModeBubbleOn:{borderColor:p.accent},torModeTitle:{color:p.text,fontSize:11,fontWeight:'650'},torToggle:{width:28,height:16,borderRadius:9,backgroundColor:p.border,padding:2},torToggleOn:{backgroundColor:p.accent},torToggleKnob:{width:12,height:12,borderRadius:7,backgroundColor:'#fff'},torToggleKnobOn:{alignSelf:'flex-end'},torInlineToggleSpaced:{marginLeft:18},memberRow:{paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:p.border},memberName:{color:p.text,fontSize:15,fontWeight:'700'},memberSub:{color:p.muted,fontSize:12,marginTop:2},securityBarMid:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},securityBarTorMid:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,paddingHorizontal:8,minHeight:36},securityBarTorSpacer:{width:8,height:8},securityFlat:{paddingHorizontal:2,paddingVertical:4,alignItems:'flex-start'},securityFlatEnd:{alignItems:'flex-end'},torChatActive:{color:'#4ea3ff',fontWeight:'700'},headerActions:{gap:5,alignItems:'stretch'},headerActionRow:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:5,marginTop:8},iconButton:{width:42,height:42,borderRadius:14,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center',backgroundColor:p.surface},backText:{color:p.text,fontSize:30,lineHeight:31},eyebrow:{color:BRAND_EYEBROW,fontSize:8,fontWeight:'900',letterSpacing:2},brandTitle:{color:BRAND_EYEBROW,fontSize:22,fontWeight:'200',letterSpacing:1.2},title:{color:p.text,fontFamily:'PlayfairDisplay-Regular',fontSize:22,letterSpacing:1.2,textTransform:'uppercase'},chatName:{color:p.text,fontSize:17,fontWeight:'800',flexShrink:1},nameRow:{flexDirection:'row',alignItems:'center',gap:7,minWidth:0},verifiedMark:{width:18,height:18,borderRadius:9,borderWidth:1,borderColor:'#8ec8ff',backgroundColor:'#1a5cb8',alignItems:'center',justifyContent:'center'},verifiedMarkKey:{borderColor:'#e9bd67',backgroundColor:'#5b4520'},verifiedGlyph:{color:'#e8f4ff',fontSize:11,fontWeight:'900',lineHeight:13},verifiedGlyphKey:{color:'#ffe6a8'},rowVerified:{borderColor:p.accent,backgroundColor:p.accentSoft},rowVerifiedKey:{borderColor:'#c9a227',backgroundColor:p.accentSoft},avatarVerified:{borderColor:p.accent,backgroundColor:p.accentSoft},avatarVerifiedKey:{borderColor:'#c9a227',backgroundColor:p.accentSoft},verifiedSub:{color:p.accent},verifiedSubKey:{color:'#a8841f'},securityPill:{borderWidth:1,borderColor:p.border,backgroundColor:p.accentSoft,borderRadius:13,paddingHorizontal:9,paddingVertical:6,alignItems:'center',minWidth:72},retentionHeader:{borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,borderRadius:13,paddingHorizontal:8,paddingVertical:5,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},retentionHeaderIcon:{color:p.muted,fontSize:12},securityTitle:{color:p.accent,fontSize:8,fontWeight:'900'},securitySub:{color:p.muted,fontSize:7,fontWeight:'900',marginTop:2},tabs:{flexDirection:'row',backgroundColor:p.surface,borderRadius:14,padding:4,borderWidth:1,borderColor:p.border,marginBottom:12},tab:{flex:1,height:38,borderRadius:11,alignItems:'center',justifyContent:'center'},tabActive:{backgroundColor:p.accentSoft},tabText:{color:p.text,fontSize:11,fontWeight:'800'},searchWrap:{height:48,borderRadius:16,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:13,justifyContent:'center'},search:{color:p.text,fontSize:12},quickActions:{flexDirection:'row',gap:9,marginTop:8,marginBottom:10},primaryAction:{flex:1,height:38,borderRadius:12,backgroundColor:p.accent,alignItems:'center',justifyContent:'center'},primaryText:{color:'white',fontSize:12,fontWeight:'800'},secondaryAction:{height:38,paddingHorizontal:17,borderRadius:12,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center'},secondaryText:{color:p.muted,fontSize:11,fontWeight:'700'},section:{color:p.muted,fontSize:9,fontWeight:'800',letterSpacing:1.7,marginBottom:6},list:{gap:4,paddingBottom:24},row:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:10,paddingVertical:6,flexDirection:'row',alignItems:'center'},pickRow:{minHeight:40,borderRadius:10,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,paddingHorizontal:12,paddingVertical:8,marginBottom:4,justifyContent:'center'},requestSection:{marginBottom:14},requestCard:{minHeight:52,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,paddingHorizontal:10,paddingVertical:8,flexDirection:'row',alignItems:'center'},avatar:{width:32,height:32,borderRadius:10,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,alignItems:'center',justifyContent:'center'},avatarText:{color:p.accent,fontWeight:'900',fontSize:13},rowBody:{flex:1,marginLeft:0},rowName:{color:p.text,fontSize:13,fontWeight:'800',flexShrink:1},pinMark:{fontSize:8,fontWeight:'900',letterSpacing:0.6,marginRight:4},small:{color:p.muted,fontSize:9,marginTop:1},lock:{color:p.accent,fontSize:13},acceptButton:{backgroundColor:p.accent,paddingHorizontal:13,paddingVertical:9,borderRadius:11},acceptText:{color:'white',fontSize:10,fontWeight:'800'},conversation:{flex:1,marginTop:10},conversationContent:{paddingBottom:18,gap:9},bubble:{maxWidth:'82%',borderRadius:17,paddingHorizontal:13,paddingVertical:10},sentBubble:{alignSelf:'flex-end',backgroundColor:p.accent},receivedBubble:{alignSelf:'flex-start',backgroundColor:p.surfaceAlt,borderWidth:1,borderColor:p.border},deletingBubble:{opacity:.42},sentText:{color:'#FFFFFF',fontSize:13,fontWeight:'600'},receivedText:{color:p.text,fontSize:13,fontWeight:'600'},sentTime:{color:'rgba(255,255,255,0.92)',fontSize:9,marginTop:5,alignSelf:'flex-end',fontWeight:'600'},receivedTime:{color:p.text,opacity:0.72,fontSize:9,marginTop:5,alignSelf:'flex-end',fontWeight:'600'},time:{color:p.muted,fontSize:8,marginTop:5,alignSelf:'flex-end'},composerTools:{flexDirection:'row',alignItems:'flex-end',gap:8,paddingVertical:8},voiceClock:{color:'#e24b4b',fontSize:12,fontWeight:'800',marginLeft:'auto'},composer:{flexDirection:'row',alignItems:'flex-end',gap:6},composerInput:{flex:1,minHeight:54,maxHeight:140,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,color:p.text,paddingHorizontal:14,paddingVertical:14,fontSize:15,lineHeight:20},attachButton:{width:34,height:34,borderRadius:11,alignItems:'center',justifyContent:'center',marginBottom:10},micButton:{width:34,height:34,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,alignItems:'center',justifyContent:'center',marginBottom:10},micButtonLive:{borderColor:'#e24b4b',backgroundColor:'#3a1010'},sendButton:{width:34,height:34,borderRadius:17,borderWidth:1.5,borderColor:p.accent,backgroundColor:'transparent',alignItems:'center',justifyContent:'center',marginBottom:10},sendButtonText:{color:p.accent,fontSize:16,fontWeight:'800',lineHeight:18},waitBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},waitCard:{width:'100%',maxWidth:320,borderRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:24,alignItems:'center',gap:10},waitTitle:{color:p.text,fontSize:18,fontWeight:'900',marginTop:6},waitCopy:{color:p.muted,fontSize:12,lineHeight:18,textAlign:'center'},sheetBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.55)',justifyContent:'flex-end'},sheetCard:{backgroundColor:p.surfaceAlt,borderTopLeftRadius:22,borderTopRightRadius:22,borderWidth:1,borderColor:p.border,paddingTop:18,paddingBottom:10,paddingHorizontal:8},sheetTitle:{color:p.text,fontSize:16,fontWeight:'800',textAlign:'center',paddingBottom:10},sheetRow:{minHeight:52,alignItems:'center',justifyContent:'center',borderTopWidth:1,borderTopColor:p.border},sheetDanger:{color:p.danger,fontSize:16,fontWeight:'700'},sheetCancel:{color:p.text,fontSize:16,fontWeight:'700'},torLockedBubble:{borderColor:p.danger,backgroundColor:p.surfaceAlt},torLockedText:{color:p.danger,fontSize:13,lineHeight:18,fontWeight:"600"},empty:{color:p.muted,fontSize:11,textAlign:'center',paddingVertical:22},muted:{color:p.muted,fontSize:11},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',alignItems:'center',justifyContent:'center',padding:22},modalKav:{flex:1},modalScroll:{flexGrow:1,justifyContent:'center',paddingVertical:16},modalScrollBottom:{flexGrow:1,justifyContent:'flex-end',paddingTop:24},modalSheetScroll:{maxHeight:'92%',width:'100%'},modalSheet:{width:'100%',maxWidth:420,alignSelf:'center',borderTopLeftRadius:22,borderTopRightRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:20,paddingBottom:24},statusCard:{width:'100%',maxWidth:420,borderRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:22,gap:4},statusEyebrow:{color:p.accent,fontSize:9,fontWeight:'900',letterSpacing:1.6,marginBottom:4},statusLabel:{color:p.text,fontSize:15,fontWeight:'800',marginTop:8},statusPill:{alignSelf:'flex-start',marginTop:10,marginBottom:4,borderRadius:999,paddingHorizontal:12,paddingVertical:5,backgroundColor:p.accentSoft,borderWidth:1,borderColor:p.accent},statusPillText:{color:p.accent,fontSize:10,fontWeight:'900',letterSpacing:0.8,textTransform:'uppercase'},requestBadge:{minWidth:22,height:22,borderRadius:11,backgroundColor:p.accent,alignItems:'center',justifyContent:'center',marginLeft:8},requestBadgeText:{color:'#fff',fontSize:11,fontWeight:'900'},modalCard:{width:'100%',maxWidth:420,borderRadius:22,borderWidth:1,borderColor:p.border,backgroundColor:p.surface,padding:20},modalTitle:{color:p.text,fontSize:18,fontWeight:'900'},modalCopy:{color:p.muted,fontSize:11,lineHeight:17,marginTop:9},idInput:{height:48,borderRadius:14,borderWidth:1,borderColor:p.border,color:p.text,paddingHorizontal:13,marginTop:15},idInputTall:{minHeight:88,height:undefined,paddingVertical:12,textAlignVertical:'top'},modalPrimary:{height:46,borderRadius:14,backgroundColor:p.accent,alignItems:'center',justifyContent:'center',marginTop:14},modulationChosen:{borderWidth:1,borderColor:p.accent},modalPrimaryText:{color:'white',fontSize:11,fontWeight:'900'},blockButton:{height:42,borderRadius:13,borderWidth:1,borderColor:p.danger,alignItems:'center',justifyContent:'center',marginTop:8},blockButtonText:{color:p.danger,fontSize:11,fontWeight:'900'},contactDeleteRail:{width:88,backgroundColor:p.danger,alignItems:'center',justifyContent:'center',borderRadius:16,marginBottom:8},contactDeleteRailText:{color:'#fff',fontSize:12,fontWeight:'800'},modalClose:{height:40,alignItems:'center',justifyContent:'center',marginTop:5},modalCloseText:{color:p.muted,fontSize:10},disabledText:{color:p.muted},retentionInputRow:{marginTop:16,gap:10},durationInput:{height:52,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,color:p.text,fontSize:20,fontWeight:'800',paddingHorizontal:14},unitRow:{flexDirection:'row',gap:7},unitButton:{flex:1,height:38,borderRadius:11,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center'},unitButtonOn:{backgroundColor:p.accentSoft,borderColor:p.accent},unitText:{color:p.muted,fontSize:9,fontWeight:'800',textTransform:'uppercase'},unitTextOn:{color:p.accent},retentionHint:{color:p.muted,fontSize:9,marginTop:10},myId:{color:p.accent,fontSize:20,fontWeight:'900',letterSpacing:1.2,marginTop:14},fingerprint:{color:p.muted,fontSize:9,lineHeight:15,marginTop:7},securityRow:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:p.border,paddingVertical:10,marginTop:4},securityLabel:{color:p.muted,fontSize:9,fontWeight:'700'},securityValue:{color:p.text,fontSize:9,fontWeight:'800'},manualAction:{height:38,borderRadius:12,borderWidth:1,borderColor:p.border,alignItems:'center',justifyContent:'center',marginTop:-12,marginBottom:18},manualActionText:{color:p.muted,fontSize:10,fontWeight:'800'},disabledButton:{opacity:.45},vaultPickList:{maxHeight:280,marginTop:12},vaultPickRow:{borderWidth:1,borderColor:p.border,borderRadius:12,paddingHorizontal:12,paddingVertical:11,marginBottom:8,backgroundColor:p.surface},vaultPickKind:{color:p.accent,fontSize:9,fontWeight:'900',letterSpacing:1},vaultPickName:{color:p.text,fontSize:12,fontWeight:'700',marginTop:4},qrWrap:{alignSelf:'center',padding:14,borderRadius:16,backgroundColor:'#fff',marginTop:16},scannerScreen:{flex:1,backgroundColor:'#000'},scannerOverlay:{flex:1,justifyContent:'space-between',padding:20,paddingTop:androidStatusInset(12)||12},scannerHeader:{flexDirection:'row',alignItems:'center',gap:12},scannerTitle:{color:'#fff',fontSize:20,fontWeight:'900'},scanFrame:{width:252,height:252,alignSelf:'center',borderRadius:28,borderWidth:3,borderColor:p.accent,backgroundColor:'transparent'},scannerHint:{alignSelf:'center',borderRadius:16,backgroundColor:'rgba(0,0,0,.86)',paddingHorizontal:18,paddingVertical:13,marginBottom:20},scannerHintText:{color:'#dce9fa',fontSize:11,textAlign:'center'},aliasWarning:{marginTop:14,borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.surfaceAlt,padding:12},aliasWarningTitle:{color:p.accent,fontSize:11,fontWeight:'900'},aliasWarningText:{color:p.muted,fontSize:10,lineHeight:15,marginTop:4},aliasId:{color:p.muted,fontSize:10,letterSpacing:1,marginTop:10,textAlign:'center'},
  });
}
