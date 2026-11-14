# Phone alerts

Configure the paths you need. ResponseAble runs with phone alerts disabled when no provider is configured.

## Self-hosted HTTP gateway

Set `ANDROID_GATEWAY_URL` to the HTTPS base of a gateway you control and `ANDROID_GATEWAY_KEY` to a shared secret. The app sends `X-Android-Key` on each request. Plain HTTP is available for a loopback test server. The gateway should live on a restricted network and accept traffic from the app backend.

| Method and path | Request or successful response |
| --- | --- |
| `GET health` | `{"ok":true,"result":{"androidReady":true}}` when the upstream is ready |
| `POST sms/send` | Receives `{"number":"+12025550123","text":"Join the incident room"}` |
| `POST call/outgoing` | Receives `{"number":"+12025550123"}` |

Respond to an accepted operation with HTTP 2xx and `{"ok":true}`. Return `{"ok":false}` or a definitive HTTP 4xx for a rejected operation. An upstream 5xx after dispatch, timeout or uncertain outcome should not be reported as a confirmed rejection. ResponseAble marks those outcomes as unclear. An Android-originated call takes place on the handset.

To adapt [SMS Gateway for Android](https://docs.sms-gate.app/getting-started/local-server/), use a trusted proxy or a workflow service such as n8n on the same private network. Have it authenticate the incoming ResponseAble request, translate a valid SMS into `POST /message` with the device's Basic Auth and `{"textMessage":{"text":"…"},"phoneNumbers":["+12025550123"]}`, then normalize the upstream response. Implement readiness for the backend and return HTTP 422 for voice unless you have a voice backend. The SMS-only app does not place voice calls. For local development, `scripts/acceptance.mjs` demonstrates all three routes with an inert test server.

## Dial a participant into a room

Deploy [LiveKit SIP](https://docs.livekit.io/transport/self-hosting/sip-server/) and create an outbound trunk with your PSTN provider. Configure `LIVEKIT_INTERNAL_URL` with the server-side HTTP(S) LiveKit base, `LIVEKIT_SIP_TRUNK_ID` with the trunk ID, and the same LiveKit API key and secret used for meeting tokens. `LIVEKIT_URL` is the separate browser WebSocket URL. ResponseAble creates a SIP participant in the selected room.

Use a provider test line to validate outbound dialing, audio in both directions, no-answer behavior and hangup before relying on it. [LiveKit outbound calls](https://docs.livekit.io/telephony/making-calls/outbound-calls/)
