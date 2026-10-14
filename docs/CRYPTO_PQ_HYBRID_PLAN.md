# Post-quantum hybrid handshake

**Status:** shipped in the chat session. `CRYPTO_CAPABILITIES.pqHybrid === true`. Do not add a “quantum secure” badge; the handshake is the claim.

## What is live

1. **Hybrid session key** for every chat:
   - Classical: P-256 identity ECDH and the ephemeral ratchet ECDH
   - PQ: ML-KEM-768 (`@noble/post-quantum`) encapsulate to the peer’s KEM public key
   - `SK_hybrid = HKDF(identity_ecdh ‖ ephemeral_ecdh ‖ kem_shared, salt, "NVL4-SK-hybrid")`
2. **Wire format** is chat envelope `v: 4` (still prefixed `NVL3.`). Older envelopes are refused. There is no classical fallback.
3. **Capability negotiation** fails closed when one side sets `pqHybrid: false`.
4. **Keys**
   - Pairing QR stays `v=3` (P-256 only, so it still scans). The ML-KEM-768 public key travels inside the sealed intro and intro-ack, encrypted to that P-256 key
   - Secret key is split across two SecureStore values (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) because one value is larger than 2048 bytes
5. **NevTOR** stays transport only

## Migration

| Asset | Action |
| --- | --- |
| Existing NVL3 sessions and v2 pairing codes | Refused once. Both phones re-pair with a current code. |
| After this format ships | Do not bump the envelope or pairing version again for the same hybrid. |

## Anti-patterns (do not implement)

- Soft-fail to classical when PQ encapsulate fails without user-visible error
- A “quantum secure” badge. The handshake is the claim; do not add marketing copy for it.
- Storing PQ private keys outside SecureStore / device-only accessibility
