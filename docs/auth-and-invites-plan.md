# Operator authentication and guest invitations

Finish the wiki and room UI checkpoint first. Ship the two security changes as separate additive migrations and release commits. Coordinate the SimpleWebAuthn browser/server packages, maintained TOTP implementation and local QR renderer with the UI owner in one dependency update. Optional AI work follows the security releases.

## Operator authentication

1. Keep the configured local operator account. Add shared PostgreSQL tables for credential public keys, MFA state, encrypted TOTP seed, recovery code hashes, one-use challenges and an authentication attempt budget. Use a dedicated runtime encryption key, separate from the password hash. Bind challenges to the pre-auth browser cookie, account, purpose and expiry. Consume atomically before verification.
2. Add password verification that issues only pre-auth state for MFA-enrolled accounts and required enrollment. Transitional installations without required MFA can enroll from a fresh password check. Once activated, require the configured second factor on password sign-in. TOTP verification advances a stored timestep atomically. Recovery claims and removes a high-entropy hashed code atomically and invalidates old operator sessions. Rotate the session after successful login, activation, recovery or reset.
3. Add discoverable WebAuthn authentication and enrollment with required user verification, the configured exact public origin and RP ID, and the library's counter checks. Store multiple public credentials with stable account binding. Require recent verification and a current factor to change existing factors. Refuse a reset that would silently restore password-only login. Document an operator-controlled offline reset requiring DB and secret access.
4. Add a production HTTPS configuration example. Run synthetic tests with a Playwright CDP virtual authenticator for registration and standalone sign-in, wrong origin, rejected replay, TOTP invalid/success/reuse, recovery single-use, partial and guest access denial and old-session invalidation.

Planned JSON endpoints are `POST /auth/password`, `POST /auth/totp`, `POST /auth/recovery`, and `POST /auth/passkey/{options,verify}`. Factor management uses `GET /auth/factors` and authenticated verification and rotation endpoints under that path. Legacy login must pass through the same authentication decisions.

## Guest invitations

1. Extend invitations with a stable public management ID, expiry, allowed and redeemed use counts, revocation timestamp and guest-session linkage. Default to one redemption and 15 minutes. Bound group-link limits and duration on the server. Migrate existing links with their original expiry and require POST for redemption.
2. Create QR, copied URLs and SMS invites through the same issuance and redemption logic. New links use `/j#token`; the client removes the fragment from browser history after reading it and submits it only after an explicit Join with a display name. Keep plaintext tokens out of database and logs. SMS previews must hold hashes only at rest, using an ephemeral encrypted draft or a token deterministically derived with a dedicated server secret when needed for delivery.
3. In one transaction, verify availability, increment redemption count and insert the linked session. Existing operator cookies take precedence, and opening or submitting a guest link must not replace an operator session. Every protected request checks linked invite revocation. Bound newly minted LiveKit token lifetime to the guest grant, record issued identities and remove active guest participants after revocation where the media service is reachable. Document the window for already-issued grants and outage behavior.
4. Exercise mobile fragment flow, QR parity, preview without consumption, expiry, parallel redemption and group limits, active HTTP session revocation across chat/board/documents/meeting, legacy upgrade, and absence of raw tokens in SQL and retained request logs.

Planned endpoints are `GET/POST /einsatz/{id}/{room}/invites`, `DELETE /einsatz/{id}/{room}/invites/{inviteId}` and `POST /j/redeem`. Creation returns the fragment URL once. Listing returns only metadata including remaining uses and expiry.

References: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server) and [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html).
