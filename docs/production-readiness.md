# Production release gates

An independent AI reviewer checked the account design and code. This is a software review and staging record, with no external certification.

| Gate | Evidence and remaining work |
| --- | --- |
| Helm and first administrator | The [installation procedure](kubernetes.md#production-installation) starts with ingress disabled, bootstraps the administrator through the namespace, then opens the canonical HTTPS origin for MFA enrollment. Helm lint and rendering passed. The bootstrap, mandatory MFA, temporary password change, disable and last-usable-admin check passed against an isolated K3s deployment. Repeat using the actual release image and Helm chart on the target infrastructure. |
| Upgrade and rollback | Synthetic legacy rows retained encrypted TOTP data, replay counter, credential public key, passkey counter and recovery entries. Prove login with an existing TOTP secret and passkey against a restored pre-upgrade database and unchanged RP ID. Use maintenance mode for the account activation and rehearse restoring a snapshot before accepting rollback. |
| Authorization and revocation | Run the full incident and room matrix for admin, assigned and unassigned coordinator and responder, disabled account and QR guest. New protected HTTP requests and meeting tokens must deny revoked access. Existing LiveKit connections require eviction or disconnect. Optional XMPP requires an active reconciliation worker and separate evidence for outcast, reconnect, archive access and restart. |
| MFA recovery | Temporary password reset preserves enrolled factors. Exercise a one-use recovery code and document a controlled recovery procedure for loss of both MFA and recovery codes before production. Protect and back up the MFA encryption key separately. |
| Durability and availability | Record restore time and recoverable data age for app PostgreSQL, XMPP archive and room metadata. Test node loss, database switchover, ingress, ICE/TURN from intended client networks and expected meeting concurrency. Local staging and chart renders establish neither production availability nor failover targets. |

Prioritize rehearsal on the intended Kubernetes topology, followed by the authorization and recovery matrix. Establish operational ownership for backup alerts, credential rotation, media eviction, XMPP reconciliation and the release rollback.
