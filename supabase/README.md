# Supabase schema

The migration `20260827_baseline_schema.sql` is the non-destructive baseline for a completely empty Supabase project. Later files are retained as ordered production patches and can run after the baseline without duplicate-policy failures. The baseline drops and recreates known policies and triggers by name, so applying it to a project that already has those objects does not fail on duplicates.

## App configuration

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_SUPABASE_URL` plus `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `.env` is gitignored. Without those values the app will not start.

## Apply sealed delivery to the live project

Live REST (publishable key, 2026-08-30 re-probe): a fresh anonymous login is **not** in `nevula_profiles` / `device_keys` (client no longer publishes). Authenticated list is still list-all: profiles `200` `0-2/3` (two leftover NEVULA IDs plus a probe INSERT from the re-probe), keys `200` `0-1/2`. Anon GET is `401`. Own-row RLS is not live. Own DELETE is `403`. Tree Apply still wipes both directory tables (`DELETE FROM … WHERE true`) as the privileged SQL editor role, then own-row RLS plus own-row DELETE, still *before* best-effort historical purge. After that paste, leftover_profiles / leftover_device_keys must be 0 in verify; a fresh login REST list must be 0 (or only own if something recreates), never the leftover foreign IDs.

CLI apply needs `supabase login` (or `SUPABASE_ACCESS_TOKEN`) plus `supabase link --project-ref <ref>`. The publishable anon key in `.env` cannot run this SQL. Do not run `db reset` against production.

## Harden privileges (live project)

Live `schema_migrations` may only list the five Aug 28 files. Sealed delivery (`message_blobs`, purge RPCs, directory seal) was applied by pasting `apply_sealed_delivery.sql`, not via CLI. Do not replay that body to catch up migration history — it wipes directory tables.

Paste `harden_privileges.sql` in the SQL editor (same SQL as `migrations/20260835_harden_privileges.sql`), then re-run `verify_sealed_delivery.sql`. That patch only REVOKEs overly broad EXECUTE/TRUNCATE and re-GRANTs DML. It does not recreate sealed delivery.

Auth dashboard follow-ups, not SQL: leaked password protection; anonymous sign-in is a product decision.

## Remote message push (FCM)

1. Paste `apply_device_push_tokens.sql` in the SQL editor.
2. Deploy Edge Function `notify-message-push` and set secrets `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON`
   (`supabase functions deploy notify-message-push` then `supabase secrets set …`).
3. Place Firebase `google-services.json` for package `com.nevula.app` at the repo root, then rebuild the Android app.
4. On **both** devices: Settings → Push on → Save (must succeed — the app warns if FCM registration fails).
5. Sending a chat message calls the edge function to wake the recipient with Calculator text only (never ciphertext).

If remote push still never appears while in-app unread works after opening Messages, the usual causes are:
missing edge-function secrets, no row in `device_push_tokens` for the recipient, or Honor/Huawei battery restrictions (use unrestricted battery from the save-push flow).

## Apply to a fresh project

1. Install the current Supabase CLI and run `supabase login`.
2. Link the fresh project with `supabase link --project-ref <project-ref>`.
3. Review the target, then run `supabase db push` from the repository root.
4. In Supabase Auth, enable anonymous sign-ins; the app creates anonymous identities.
5. Verify with `supabase migration list`, then use the SQL editor to confirm all eight public tables have RLS enabled and that `anon` has no table grants.
6. Run `supabase db advisors` and confirm no security findings remain. If `pg_cron` is available, confirm the `delete-expired-nevula-messages` hourly job exists; otherwise expiry is still enforced and opportunistic purge runs on message writes.

For a local disposable database, run `supabase start` followed by `supabase db reset`. This is the preferred clean-project migration check. Never run reset against a linked production project.

The baseline reflects the repository client contract and existing patches, not a live schema dump. Before deploying to an existing project, compare it with `supabase db pull`/`supabase db diff` and apply only reviewed forward changes.
