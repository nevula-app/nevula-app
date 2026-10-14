// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Denny Almeida
//
// This file is part of NEVULA.
// NEVULA is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3.

import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = {
  alice: new Map<string, string>(),
  bob: new Map<string, string>(),
};
let active: Map<string, string> = stores.alice;

vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(async (key: string) => active.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { active.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { active.delete(key); }),
}));

vi.mock('react-native-quick-base64', () => ({
  fromByteArray: (value: Uint8Array) => Buffer.from(value).toString('base64'),
  toByteArray: (value: string) => new Uint8Array(Buffer.from(value, 'base64')),
}));

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

import { ensureP256Keys } from './messageCrypto';
import { ensureKemKeys } from './pqKem';
import {
  decryptNvl3,
  encryptNvl3 as sealNvl3,
  isNvl3Ciphertext,
  PeerKeyChangedError,
  resetRatchetSession,
  SessionRollbackError,
} from './sessionRatchet';

let aliceKem = '';
let bobKem = '';

async function encryptNvl3(params: Omit<Parameters<typeof sealNvl3>[0], 'peerKemPk'> & { peerKemPk?: string }) {
  const peerKemPk = params.peerKemPk ?? (params.peerUserId === 'alice' ? aliceKem : bobKem);
  return sealNvl3({ ...params, peerKemPk });
}

async function asAlice<T>(fn: () => Promise<T>) {
  active = stores.alice;
  return fn();
}

async function asBob<T>(fn: () => Promise<T>) {
  active = stores.bob;
  return fn();
}

describe('NVL3 forward-secrecy ratchet', () => {
  beforeEach(async () => {
    stores.alice.clear();
    stores.bob.clear();
    active = stores.alice;
    aliceKem = (await asAlice(() => ensureKemKeys())).publicKeyB64;
    bobKem = (await asBob(() => ensureKemKeys())).publicKeyB64;
    active = stores.alice;
  });

  it('roundtrips a first message and a reply with silent DH rotation', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const first = await asAlice(() => encryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      plaintext: 'hello from alice',
    }));
    const payload = JSON.parse(Buffer.from(first.slice('NVL3.'.length), 'base64').toString('utf8'));
    expect(payload.v).toBe(4);
    expect(typeof payload.kem).toBe('string');
    expect(payload.kem.length).toBeGreaterThan(1000);
    expect(payload.body).toBeUndefined();
    expect(isNvl3Ciphertext(first)).toBe(true);

    await expect(asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: first,
    }))).resolves.toMatchObject({ body: 'hello from alice' });

    const reply = await asBob(() => encryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      plaintext: 'hello from bob',
    }));
    await expect(asAlice(() => decryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      ciphertext: reply,
    }))).resolves.toMatchObject({ body: 'hello from bob' });
  });

  it('cannot decrypt an earlier message after the receiving chain has moved on (PFS within session)', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const first = await asAlice(() => encryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      plaintext: 'one',
    }));
    const second = await asAlice(() => encryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      plaintext: 'two',
    }));

    await asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: first,
    }));
    await asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: second,
    }));

    await expect(asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: first,
    }))).rejects.toThrow();
  });

  it('rejects replay of the same envelope after it was opened', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const first = await asAlice(() => encryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      plaintext: 'once',
    }));
    await asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: first,
    }));
    await expect(asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: first,
    }))).rejects.toThrow(/already opened/);
  });

  it('decrypts out-of-order offline messages within the skip window', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const a = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'a',
    }));
    const b = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'b',
    }));
    const c = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'c',
    }));

    await expect(asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: c,
    }))).resolves.toMatchObject({ body: 'c' });
    await expect(asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: a,
    }))).resolves.toMatchObject({ body: 'a' });
    await expect(asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: b,
    }))).resolves.toMatchObject({ body: 'b' });
  });

  it('does not rotate the DH send key before the peer has replied', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const envelopes: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      envelopes.push(await asAlice(() => encryptNvl3({
        myUserId: aliceId,
        peerUserId: bobId,
        peerIdentitySpki: bobSpki,
        plaintext: `pre${i}`,
      })));
    }
    const dhs = envelopes.map(value => JSON.parse(Buffer.from(value.slice('NVL3.'.length), 'base64').toString('utf8')).dh);
    expect(new Set(dhs).size).toBe(1);

    for (let i = 0; i < 21; i += 1) {
      await expect(asBob(() => decryptNvl3({
        myUserId: bobId,
        peerUserId: aliceId,
        peerIdentitySpki: aliceSpki,
        ciphertext: envelopes[i],
      }))).resolves.toMatchObject({ body: `pre${i}` });
    }
  });

  it('silently rotates the DH send key every 20 messages after a reply and stays decryptable', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const hello = await asAlice(() => encryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      plaintext: 'hello',
    }));
    await asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: hello,
    }));
    const reply = await asBob(() => encryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      plaintext: 'ack',
    }));
    await asAlice(() => decryptNvl3({
      myUserId: aliceId,
      peerUserId: bobId,
      peerIdentitySpki: bobSpki,
      ciphertext: reply,
    }));

    const envelopes: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      envelopes.push(await asAlice(() => encryptNvl3({
        myUserId: aliceId,
        peerUserId: bobId,
        peerIdentitySpki: bobSpki,
        plaintext: `m${i}`,
      })));
    }

    const dhs = envelopes.map(value => JSON.parse(Buffer.from(value.slice('NVL3.'.length), 'base64').toString('utf8')).dh);
    expect(dhs[0]).toBe(dhs[19]);
    expect(dhs[20]).not.toBe(dhs[0]);

    for (let i = 0; i < 21; i += 1) {
      await expect(asBob(() => decryptNvl3({
        myUserId: bobId,
        peerUserId: aliceId,
        peerIdentitySpki: aliceSpki,
        ciphertext: envelopes[i],
      }))).resolves.toMatchObject({ body: `m${i}` });
    }
  });

  it('heals after a compromised send chain once both sides complete a new DH (PCS)', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;

    const hello = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'hello',
    }));
    await asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: hello,
    }));
    const ack = await asBob(() => encryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, plaintext: 'ack',
    }));
    await asAlice(() => decryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, ciphertext: ack,
    }));

    // Snapshot Alice's compromised state (attacker copy).
    const stolen = new Map(stores.alice);

    const afterCompromise = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'stolen-window',
    }));
    await asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: afterCompromise,
    }));

    // Bob sends a new DH; Alice advances — attacker with stolen state cannot open this.
    const heal = await asBob(() => encryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, plaintext: 'heal',
    }));
    await asAlice(() => decryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, ciphertext: heal,
    }));
    const postHeal = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'post-heal',
    }));

    await expect(asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: postHeal,
    }))).resolves.toMatchObject({ body: 'post-heal' });

    // Attacker restores Alice's stolen SecureStore snapshot and tries to decrypt Bob's heal message.
    stores.alice.clear();
    for (const [key, value] of stolen) stores.alice.set(key, value);
    await expect(asAlice(() => decryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, ciphertext: heal,
    }))).rejects.toThrow();
  });

  it('refuses encrypt/decrypt when the peer identity SPKI changed until session reset', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;
    await asAlice(() => ensureP256Keys());

    await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'before',
    }));

    // Simulate a different peer device key (new SPKI bytes).
    const other = await globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    if (!('publicKey' in other)) throw new Error('keygen');
    const newSpki = Buffer.from(await globalThis.crypto.subtle.exportKey('spki', other.publicKey)).toString('base64');

    await expect(asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: newSpki, plaintext: 'after',
    }))).rejects.toBeInstanceOf(PeerKeyChangedError);

    await asAlice(() => resetRatchetSession(aliceId, bobId));
    await expect(asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: newSpki, plaintext: 'fresh',
    }))).resolves.toMatch(/^NVL3\./);
  });

  it('detects ratchet state rollback against a newer commit', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;
    await asAlice(() => ensureP256Keys());

    await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'one',
    }));
    const afterOne = new Map(stores.alice);

    await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'two',
    }));
    const commitKey = [...stores.alice.keys()].find(key => key.includes('ratchet.commit'));
    expect(commitKey).toBeTruthy();
    const newerCommit = stores.alice.get(commitKey!);

    // Restore older session blob but keep the newer commit → rollback.
    stores.alice.clear();
    for (const [key, value] of afterOne) stores.alice.set(key, value);
    stores.alice.set(commitKey!, newerCommit!);

    await expect(asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'three',
    }))).rejects.toBeInstanceOf(SessionRollbackError);
  });

  it('rejects downgraded envelope versions', async () => {
    const bobId = 'bob';
    const aliceId = 'alice';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    await asBob(() => ensureP256Keys());

    const forged = `NVL3.${Buffer.from(JSON.stringify({
      v: 2,
      dh: 'x',
      n: 0,
      pn: 0,
      iv: Buffer.alloc(12).toString('base64'),
      ct: Buffer.alloc(16).toString('base64'),
    }), 'utf8').toString('base64')}`;

    await expect(asBob(() => decryptNvl3({
      myUserId: bobId,
      peerUserId: aliceId,
      peerIdentitySpki: aliceSpki,
      ciphertext: forged,
    }))).rejects.toThrow(/older chat encryption|Unknown message|Refusing/);
  });

  it('refuses a hybrid envelope whose KEM ciphertext was swapped', async () => {
    const aliceId = 'alice';
    const bobId = 'bob';
    const aliceSpki = (await asAlice(() => ensureP256Keys())).spkiB64;
    const bobSpki = (await asBob(() => ensureP256Keys())).spkiB64;
    const first = await asAlice(() => encryptNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, plaintext: 'bound',
    }));
    const payload = JSON.parse(Buffer.from(first.slice('NVL3.'.length), 'base64').toString('utf8'));
    payload.kem = bobKem;
    const swapped = `NVL3.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}`;
    await expect(asBob(() => decryptNvl3({
      myUserId: bobId, peerUserId: aliceId, peerIdentitySpki: aliceSpki, ciphertext: swapped,
    }))).rejects.toThrow();
    await asAlice(() => resetRatchetSession(aliceId, bobId));
    await expect(asAlice(() => sealNvl3({
      myUserId: aliceId, peerUserId: bobId, peerIdentitySpki: bobSpki, peerKemPk: 'not-a-kem-key', plaintext: 'no',
    }))).rejects.toThrow(/post-quantum key/i);
  });
});
