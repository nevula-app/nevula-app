# NEVULA message encryption

New messages use **NVL3** (`NVL3.` prefix): a Double Ratchet over P-256 and AES-GCM in `src/lib/sessionRatchet.ts`. They are encrypted on-device. Older NVL2 (`NVL2.` prefix) and OpenPGP rows still decrypt.

This is **not** OpenPGP, **not** signed, and **not** Signal/MLS branded. New messages use **NVL3**: a Double Ratchet with per-message keys and silent DH rotation. Compromising the current chat key does not decrypt earlier messages. Legacy rows may still be NVL2 or OpenPGP.

## What the server can see

- New delivery (`message_blobs`): recipient inbox, opaque ciphertext, expiry. **No sender, no conversation id, no created-at.**
- Pairing rows are deleted after accept so the server does not keep a durable contact graph.
- Legacy `encrypted_messages` / `conversation_members` may still exist for older chats until they burn.
- The client no longer publishes NEVULA IDs, usernames, fingerprints, or device public keys. Leftover directory rows may still exist until own-row RLS and purge land.
- There are no analytics IDs.

## Device keys

- Anonymous Supabase Auth provides the backend identity used by RLS.
- Each device gets a local device ID.
- Each device generates a P-256 key pair locally. Peer keys come from QR / decrypted intro, not a server directory.
- A local OpenPGP identity still exists; its fingerprint is used in pairing QR codes. That does **not** mean new chat messages are OpenPGP-signed.
- Private material stays on the device (SecureStore / encrypted files).

## Legacy path

Older rows may still be OpenPGP ciphertext. `src/lib/pgp.ts` can decrypt them and **requires a verifiable signature**. New chat messages still use unsigned NVL2.

## Native runtime

WebCrypto/SubtleCrypto is required. React Native uses `react-native-quick-crypto` installed before app startup. Expo Go is not sufficient. NEVULA is **Android-only**.

## Validation

CI should install dependencies, run TypeScript validation, and run an Android Expo prebuild before merge.
