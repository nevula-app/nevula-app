// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

export type { NevTorConnectionState, NevTorRoutingMode, NevTorSnapshot, PrivacyTransport } from './types';
export {
  NevTorBlockedError,
  labelForNevTorSnapshot,
  chipForNevTorSnapshot,
  modeLabel,
} from './types';
export { nevTorManager, NevTorManager } from './manager';
export { createNevTorGatedFetch } from './gate';
export { useNevTorSnapshot } from './hooks';
export {
  encodeNevTorCapability,
  tryParseNevTorCapability,
  encodeChatNevTorRequire,
  tryParseChatNevTorRequire,
  isNevTorCapabilityPlaintext,
  type PeerNevTorCapability,
  type PeerChatNevTorRequire,
} from './capability';
export {
  chatRequiresNevTor,
  getMyChatNevTorRequire,
  getPeerChatNevTorRequire,
  hasMyChatNevTorDecision,
  listChatNevTorRequiredPeers,
  listChatNevTorRequiredKeys,
  setMyChatNevTorRequire,
  setPeerChatNevTorRequire,
} from './chatRequire';
export { TorExitProbeTransport, DirectPrivacyTransport } from './transport';
export { getPeerNevTorStatus, setPeerNevTorStatus } from './peerStatus';
export { nevTorCapabilitySync } from './sync';
export { NEVTOR_PHASE2_SCOPE } from './scope';
