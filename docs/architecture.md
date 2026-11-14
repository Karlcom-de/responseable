# Architecture

ResponseAble is a coordination workspace for incident response and business continuity. An operator creates an incident with a main room, opens workstream rooms, and invites participants into the appropriate room.

| Function | Component |
| --- | --- |
| Web application and access control | Next.js App Router and TypeScript |
| Shared application state | PostgreSQL for incidents, rooms, invitations, sessions, messages, boards and alert attempts |
| Media | LiveKit with room-scoped credentials issued by the app |
| Whiteboard | Excalidraw with per-element versioning and transactional per-room merge |
| SMS and voice | Independently configured Android, authenticated webhook, or AWS End User Messaging providers. LiveKit SIP handles dial-in to a room. |

The production Helm deployment uses individual accounts with MFA and fixed roles. Coordinators and responders are limited to assigned incidents. Guests redeem a time-limited link for one room. The server checks that grant for chat, board and media access. App and gateway credentials stay server-side. The application can serve multiple replicas from the same release image and database.

Chat and boards do not depend on LiveKit. SMS and voice alerts can continue during a media-server outage while the app can reach their selected providers. A sent link requires an accessible app origin. Each meeting has one active media node. Users may need to rejoin if that node fails. A single phone and network remain individual failure domains.

The app stores an alert attempt before making the provider request. A repeated confirmation of the same attempt is single-claimed in PostgreSQL. If a provider call times out after dispatch, the outcome may be uncertain. The app does not automatically repeat it. Gateway acceptance means only that the gateway accepted the request. SIP acceptance can include voicemail.

Operational configuration is covered in the [Kubernetes guide](kubernetes.md). The [telephony guide](telephony.md) describes the HTTP gateway contract and SIP setup.
