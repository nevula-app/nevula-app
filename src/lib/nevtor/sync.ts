// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { encodeNevTorCapability } from './capability';
import { nevTorManager } from './manager';
import type { NevTorSnapshot } from './types';

type AnnounceFn = (params: {
  conversationId: string;
  senderId: string;
  recipientUserId: string;
  plaintext: string;
  expiresAt: string;
}) => Promise<unknown>;

type ContactLike = { userId: string; conversationId: string };

/**
 * Pushes a Boolean-only NevTOR capability to each contact over the existing
 * sealed NVL3 channel. No public profile / global status table.
 */
export class NevTorCapabilitySync {
  private lastAnnouncedActive: boolean | null = null;
  private announceInFlight: Promise<void> | null = null;
  private send: AnnounceFn | null = null;
  private listContacts: ((userId: string) => Promise<ContactLike[]>) | null = null;
  private myUserId: string | null = null;
  private unsub: (() => void) | null = null;

  bind(params: {
    myUserId: string;
    send: AnnounceFn;
    listContacts: (userId: string) => Promise<ContactLike[]>;
  }) {
    this.myUserId = params.myUserId;
    this.send = params.send;
    this.listContacts = params.listContacts;
    if (!this.unsub) {
      this.unsub = nevTorManager.subscribe((snapshot) => {
        void this.onSnapshot(snapshot);
      });
    }
  }

  /** Force announce to one peer (e.g. when opening a chat). */
  async announceToPeer(peer: ContactLike) {
    if (!this.send || !this.myUserId) return;
    const snap = nevTorManager.getSnapshot();
    const active = snap.routingMode !== 'OFF' && snap.torReady && snap.connection === 'connected';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try {
      await this.send({
        conversationId: peer.conversationId,
        senderId: this.myUserId,
        recipientUserId: peer.userId,
        plaintext: encodeNevTorCapability(active),
        expiresAt,
      });
    } catch {
      // Capability is best-effort; chat must keep working.
    }
  }

  private async onSnapshot(snapshot: NevTorSnapshot) {
    const active = snapshot.routingMode !== 'OFF' && snapshot.torReady && snapshot.connection === 'connected';
    if (this.lastAnnouncedActive === active) return;
    // Don't spam contacts with "off" on every cold start.
    if (this.lastAnnouncedActive === null && !active) {
      this.lastAnnouncedActive = false;
      return;
    }
    if (this.announceInFlight) await this.announceInFlight;
    this.announceInFlight = this.broadcast(active).finally(() => {
      this.announceInFlight = null;
    });
    await this.announceInFlight;
  }

  private async broadcast(active: boolean) {
    if (!this.send || !this.listContacts || !this.myUserId) return;
    const contacts = await this.listContacts(this.myUserId).catch(() => []);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const plaintext = encodeNevTorCapability(active);
    await Promise.all(
      contacts.map((contact) =>
        this.send!({
          conversationId: contact.conversationId,
          senderId: this.myUserId!,
          recipientUserId: contact.userId,
          plaintext,
          expiresAt,
        }).catch(() => undefined),
      ),
    );
    this.lastAnnouncedActive = active;
  }
}

export const nevTorCapabilitySync = new NevTorCapabilitySync();
