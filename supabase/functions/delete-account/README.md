# Account deletion deployment

This function deliberately runs with `verify_jwt = false` because the external
deletion page has no Supabase session. The function validates app JWTs itself
for registration and in-app deletion, and validates the high-entropy deletion
code for external deletion.

Before deployment:

1. Apply `20260830133448_account_deletion.sql` in a reviewed environment.
2. Set `ACCOUNT_DELETION_PEPPER` to at least 32 random characters.
3. Set `DELETE_ACCOUNT_ALLOWED_ORIGIN` to the exact HTTPS origin of the public
   deletion page, without a trailing slash.
4. Deploy with the repository `supabase/config.toml`; do not expose the service
   role key to either client.
5. Configure the website endpoint as
   `https://<project-ref>.supabase.co/functions/v1/delete-account`.

Deleting the Auth user cascades rows linked by `user_id`, including received
sealed-delivery blobs. Outbound sealed blobs intentionally contain no sender
identifier and therefore cannot be attributed for immediate deletion; they
remain encrypted and expire automatically within the existing maximum 28-day
retention.
