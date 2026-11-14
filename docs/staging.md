# One-replica Kubernetes staging

This profile is for development and functional checks. Give it a dedicated namespace, synthetic incident data, a local operator account, and a separate PostgreSQL database. A single replica has downtime during replacement.

## Deploy a test build

Build the image for the node architecture and use an immutable image reference. Prepare the namespace, application Secret, and a certificate for a private HTTPS hostname that resolves to your ingress. See the [Kubernetes guide](kubernetes.md). Use synthetic data and inert provider fixtures.

```sh
helm upgrade --install responseable deploy/helm/responseable -n "$NS" \
  --set-string "app.image=$IMAGE" \
  --set-string "app.publicOrigin=https://$STAGING_HOST" \
  --set-string "app.ingress.tlsSecret=$TLS_SECRET" \
  --set app.ingress.enabled=true --set app.autoscale=false --set app.replicas=1 --wait
```

For a dedicated development manifest, set `RESPONSEABLE_PUBLIC_ORIGIN=http://127.0.0.1:3180` and `RESPONSEABLE_SECURE_COOKIE=false`. Keep the service private and use a local port-forward directly to the pod. The browser origin must match the configured origin.

A compact development pod can run a web container, PostgreSQL on a persistent claim, LiveKit, and an inert HTTP alert fixture in the same namespace and pod. Keep PostgreSQL and the fixture on loopback. Forward the web port and, when using a loopback ICE candidate, forward both LiveKit signaling and its TCP media port. WebSocket connectivity alone does not prove media exchange. [LiveKit server configuration](https://github.com/livekit/livekit/blob/master/config-sample.yaml)

## Develop against staging

1. Build a new image from your branch and upgrade with its immutable reference. A development manifest may instead unpack a tracked source archive in an init container, run `npm ci && npm run build`, and run the standalone server after `node scripts/migrate.mjs`. Rebuild from the new archive and restart the pod on each revision. Keep the database on the same claim.
2. Check `kubectl -n "$NS" rollout status deployment/responseable-web`, then check `/health/live` and `/health/ready`. If the init build fails, inspect its logs before changing the runtime.
3. Forward the updated pod again after a replacement. Use a separate browser profile or context for the guest.
4. To test alternate providers, change `SMS_PROVIDER` or `CALL_PROVIDER` in the staging Secret and create a new pod. A preview made with a different provider needs to be recreated.

## Manually verify

| Step | Expected result |
| --- | --- |
| Sign in and create a synthetic incident with one subroom | The room appears in the incident, and switching rooms keeps their chat separate. |
| Invite a guest to the subroom | The guest joins that room and has no access to the main room or alerting controls. |
| Guest sends a chat message and draws on the board | The operator sees the update. Reloading preserves both. |
| Both join video and the operator enables a camera | The guest receives video. Test audio or screen share explicitly if needed for a deployment. |
| Preview and send a test SMS and voice alert | The UI identifies each provider. The fixture receives the expected request and the attempt shows the returned result. An ambiguous failure appears as unclear. |
| Restart the app and reopen the incident | The session, messages and board survive while the database claim remains available. |

For repeatable local checks run `npm test` after building. The runner uses a separate PostgreSQL database, two app processes, an inert HTTP fixture and optionally a local LiveKit instance. It also exercises the AWS SDK with an injected transport. See [README](../README.md) for commands.


Run the remote browser smoke against the forwarded deployment with:

```sh
SMOKE_URL=http://127.0.0.1:3180 SMOKE_OPERATOR="$OPERATOR" \
  SMOKE_PASSWORD_FILE="$PASSWORD_FILE" node scripts/staging-smoke.mjs
```

Set `SMOKE_SYNTHETIC_PROVIDERS=1` only when both channels are wired to inert fixtures. The test then expects Android SMS and webhook voice. The fixture should return HTTP 503 for the voice destination ending in 0198.

For the two-client media and whiteboard check, set `SMOKE_URL`, `SMOKE_OPERATOR`, and `SMOKE_PASSWORD_FILE` for a disposable real-mode staging instance, then run:

```sh
node scripts/media-smoke.mjs
```

Run against Chromium with a controlled screen source on a disposable test desktop. Set `SMOKE_CANVAS_SCREEN=1` to use a synthetic source instead. The test confirms decoded camera and screen-share frames, non-silent remote microphone audio, chat persistence, and shared whiteboard state in a new tab during the meeting. The media server must be reachable by both browser contexts. With an isolated local LiveKit server this checks application integration and local media transport. Production network validation is separate.
