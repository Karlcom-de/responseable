![ResponseAble](docs/responseable-lockup.svg)

ResponseAble is a self-hosted incident war room for coordinating responders across rooms, chat, whiteboards and meetings.

![Desktop incident room with room navigation, a situation brief and chat](docs/incident-room-desktop.webp)

## Try it on Kubernetes

You need Git, a POSIX shell and an authenticated `kubectl` context. The cluster must allow you to create a test namespace, pull public Node and PostgreSQL images, and reach npm from the build pod. Allow approximately 3 GiB of build storage and memory. The PostgreSQL sidecar uses an unconfined AppArmor profile for compatibility with K3s. Choose a development cluster where that profile is allowed.

```sh
git clone https://tea.karlcom.de/karl/responseable.git
cd responseable && ./scripts/kubernetes-exercise.sh
```

Open **http://127.0.0.1:3190** and select **Run the exercise**. Try the seeded rooms, room chat and whiteboard. The script builds the checked-out commit in Kubernetes, migrates the local PostgreSQL sidecar, waits for readiness and forwards the loopback port. The exercise needs no local Docker, npm, secrets or storage class. Data survives page reloads and container restarts in the same pod. Pod replacement discards it. Re-running the same commit keeps the current pod.

The [GitHub mirror](https://github.com/Karlcom-de/responseable) can replace the Gitea clone URL. Stop forwarding with Ctrl+C. Remove the exercise with `kubectl delete namespace responseable-exercise`, or use the namespace selected via `RESPONSEABLE_EXERCISE_NAMESPACE`.

While forwarding, check readiness with `curl -fsS http://127.0.0.1:3190/health/ready`. With local npm dependencies and Playwright Chromium installed, run the browser smoke with `node scripts/exercise-smoke.mjs`. Video, phone alerts and external guest access are outside the default exercise. Use a private HTTPS hostname for remote guest sharing and production passkeys. See [Kubernetes deployment](docs/kubernetes.md) and [staging smoke tests](docs/staging.md) for those environments.

## What you can do

- Open an incident with a command room and add workstream rooms as the response evolves.
- Share an expiring, room-specific invitation with a guest.
- Keep chat and the incident whiteboard available across reloads and application restarts.
- Use LiveKit for video, audio and screen sharing. Invite an individual by SMS, place a mobile call through a compatible gateway, or dial a phone participant into a meeting with LiveKit SIP.

## Screenshots

![A runbook open in the desktop knowledge workspace](docs/runbook-desktop.webp)

![Guest incident room and chat on a mobile display](docs/incident-room-mobile.webp)

## Quick start

Install Node.js 24 LTS, npm and PostgreSQL, or use Docker Compose for the local database. Run from the repository root.

```sh
docker compose up -d --wait
npm ci
cp .env.example .env.local
npm run migrate
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000` and select **Run the exercise** on the welcome page. The example uses a dedicated local database and simulated incident data. Demo mode disables external media and phone operations. If you already have PostgreSQL, skip Compose and put your empty database's connection string in `DATABASE_URL`.

For a real instance, use a separate PostgreSQL database, set `RESPONSEABLE_MODE=real`, configure `RESPONSEABLE_OPERATOR`, and set `RESPONSEABLE_PASSWORD_HASH` to the output of `node scripts/password.mjs`. The script reads the password from standard input. Protect the configured origin with HTTPS and set `RESPONSEABLE_SECURE_COOKIE=true`. The origin must match the exact address users open, including the port if present.

## Integrations

- **Meetings.** For a local real-mode test, run `livekit-server --dev` on the loopback interface. Set `LIVEKIT_URL=ws://127.0.0.1:7880`, `LIVEKIT_API_KEY=devkey` and `LIVEKIT_API_SECRET=secret`. Use your own keys, WSS and tested media/TURN routing in production. [LiveKit self-hosting](https://docs.livekit.io/transport/self-hosting/)
- **Whiteboard.** Excalidraw synchronizes shapes, text, arrows, lines, freehand strokes and frames. Each room supports up to 2,000 elements and 2 MB, including deletion markers.
- **Phone alerts.** Select SMS and outbound voice providers independently: Android, an authenticated HTTP webhook, or AWS End User Messaging. LiveKit SIP can dial a participant directly into a room. [Provider setup and webhook contract](docs/telephony.md)

## Deploy and verify

Use the [Kubernetes guide](docs/kubernetes.md) for Helm, PostgreSQL, LiveKit, backups and failover drills. The [staging guide](docs/staging.md) covers a one-replica development environment and the manual test. The [architecture notes](docs/architecture.md) describe the access model and outage boundaries.

```sh
npm run build
npm run typecheck
npx playwright install chromium
DATABASE_URL='postgresql://…/responseable_test' npm test
```

The acceptance test starts two app processes on ports 3130 and 3131 and exercises shared state, guest permissions and a mock phone gateway. Pass the local LiveKit variables above to test a real WebRTC connection with synthetic camera input. Use a separate test database.

## Contribute

See the [brand assets](docs/brand.md) and [product brief](docs/marketing.md) for project communications. See [CONTRIBUTING.md](CONTRIBUTING.md) for reporting issues and running the checks. ResponseAble is distributed under the [MIT License](LICENSE).
