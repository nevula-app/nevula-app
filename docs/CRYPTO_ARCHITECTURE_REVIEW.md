# NEVULA Crypto Architecture

**Updated:** 2026-09-18 (implementation pass after review)  
**Code:** `sessionRatchet.ts`, `cryptoPolicy.ts`, `messageCrypto.ts`, `pgp.ts`, `contactKeys.ts`

---

## 1. Ist-Analyse (short)

| Layer | Status |
| --- | --- |
| NVL3 ratchet chat | Primary path — hardened local state (v2): peer SPKI bind, commit/rollback, replay window |
| NVL2 | Pairing / public-invite intros only — no PFS |
| OpenPGP | Decrypt-only legacy — encrypt disabled |
| SecureStore | Device-bound identity + ratchet + commit |
| Public invites | Hash + envelope; not identity proof |
| NevTOR | Optional transport; not E2EE |
| PQ hybrid | Documented only (`CRYPTO_PQ_HYBRID_PLAN.md`) |

### Four properties (honest)

1. **PFS — partial, improved operationally**  
   Per-message keys + DH rotate every 20 after peer reply. First-session SK still involves identity ECDH; recorded early envelopes can be rebuilt if the peer identity private key later leaks. Later chains after DH heal are forward-secret in the usual ratchet sense.

2. **PCS — partial, improved**  
   Fresh DH heals after compromise. Peer SPKI change forces session reset. Commit counters detect partial SecureStore rollback. Full backup restore of state+commit together is still undetectable.

3. **Deniability — NVL3 yes / OpenPGP no**  
   NVL3: no long-term message signatures. OpenPGP encrypt path disabled so new chats cannot silently reintroduce signed ciphertext.

4. **PQ — not present**  
   Capability bit `pqHybrid: true` (P-256 + ML-KEM-768, envelope v4). See `CRYPTO_PQ_HYBRID_PLAN.md`.

---

## 2. Architecture decision

Keep **NVL3** as chat crypto. Do not port libsignal in this phase. Harden state machine + policy instead of replacing the ratchet. Isolate OpenPGP. Defer PQ until a mobile KEM is chosen.

---

## 3. Implemented in this pass

- Local ratchet state **v2**: `peerSpki`, `epoch`, `consumed[]`
- **PeerKeyChangedError** if encrypt/decrypt uses a different SPKI than the bound session
- **SessionRollbackError** via separate commit blob (epoch/ns/nr)
- Replay rejection for already-consumed `dh:n`
- Envelope version enforcement (`cryptoPolicy`) — refuse older/newer chat formats
- Capability negotiation helpers with anti-downgrade hooks
- **resetRatchetSession** + Messages UI “Accept new key” wipes old session
- OpenPGP **encryptForRecipients** throws (decrypt remains)
- Honest home security copy (E2EE ≠ verified ≠ Tor)
- Tests: PFS replay, offline skip, PCS heal, SPKI change, rollback, downgrade, OpenPGP isolation, policy
- PQ plan doc (no code path)

---

## 4. Not implemented (on purpose)

- Signal Protocol / multi-device sync  
- PQ-KEM in production  
- Changing NVL3 wire HKDF labels (would break mixed-version peers)  
- Claiming full PFS against identity-key compromise of the first chain  

---

## 5. Migration

| Asset | Plan |
| --- | --- |
| Existing NVL3 sessions | Auto-migrate local state v1→v2 on load; wire format unchanged |
| After peer device key change | User accepts new key → `resetRatchetSession` → new session |
| OpenPGP leftovers | Still decryptable; no new OpenPGP sends |
| Public invites | Still NVL2 intro to owner; chat continues on NVL3 after accept |
| Both test phones | Install the **same** build before pairing/chat tests |

---

## 6. Test gate before wider release

```text
npm test
npm run typecheck
```

Plus real two-device: send/receive, key-change accept, Tor on/off without breaking decrypt, public invite without IDs in URL.

---

## 7. Boundaries

- No private keys in QR/URLs/logs/Supabase  
- No silent crypto downgrade  
- UI must not call public invite “verified”  
- NevTOR optional  
- Do not claim quantum-safe until hybrid ships  
