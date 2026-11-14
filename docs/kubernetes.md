# ResponseAble auf Kubernetes

App und Medien laufen zustandslos. PostgreSQL hält Incidents, Sessions, Chat, Lagebilder und Alarmierungsversuche. LiveKit verteilt Meetings über Redis-kompatibles Valkey. Ein optionales Telefongateway läuft als separater Dienst und verbindet den Mobilfunkanbieter mit der App. SIP-Einwahl braucht einen separaten LiveKit-SIP-Dienst und einen Trunk.

## Voraussetzungen

- Ein benannter Namespace und drei dauerhaft erreichbare, getrennte Nodes für Quorum und Failover. K3s-Control-Plane mit drei Servern beziehungsweise hochverfügbarem Datastore und einem gemeinsamen API-Endpunkt.
- Ingress für die kanonische HTTPS-App-URL und gegebenenfalls eine WSS-Signalisierungs-URL. Einladungen müssen aus dem vorgesehenen Gastnetz erreichbar sein. Reverse Proxy erhält Host, HTTPS-Schema und WebSocket-Upgrades. Keine gemeinsame Cache-Antwort für Incident-Seiten.
- PostgreSQL mit TLS und automatischem Failover. Für internen Betrieb liegt eine CloudNativePG-Vorlage vor. Setze für PostgreSQL `spec.storage.storageClass` und für Valkey `persistence.storageClass` entsprechend eurer Speicherumgebung. Die gewählte StorageClass muss an allen drei Nodes funktionieren. Vor produktiver Nutzung zusätzlich WAL-Archivierung und Base Backups in eigenständigem Speicher konfigurieren und Wiederherstellung testen. TLS-CA für `DATABASE_URL` im Container bereitstellen und das Serverzertifikat überprüfen.
- LiveKit-Medien-Nodes brauchen feste, erreichbare ICE-Kandidaten. Pro Node läuft ein Medienpod. Bei getrennten Netzen: direkte UDP-/TCP-Medienpfade oder ein getesteter TURN/TLS-Pfad. Ports siehe [LiveKit Portübersicht](https://docs.livekit.io/transport/self-hosting/ports-firewall/).
- Separater, bereits vorhandener HA-Ingress oder Gateway. Der HTTP-Ingress dient der Signalisierung. Wenn TURN aktiviert ist, benötigt TURN einen eigenen erreichbaren L4-Endpunkt und ein darin passendes Zertifikat.
- Ein zugelassenes OCI-Repository. Das Image für die Architektur der Ziel-Nodes bauen. Identischen Image-Digest für Migration und alle Pods verwenden. Für Releases einen Build pro Version verteilen. Bei unterschiedlichen Builds während eines Rollouts kann eine alte Browser-Sitzung einen Reload brauchen. [Next.js Self-Hosting](https://nextjs.org/docs/app/guides/self-hosting)

## Einrichtung

`NS` und `IMAGE` werden pro Umgebung gesetzt. Ein vorhandenes hochverfügbares PostgreSQL oder Valkey kann anstelle der mitgelieferten Vorlagen verwendet werden.

```sh
kubectl create namespace "$NS"
# Nachdem CloudNativePG installiert wurde und verfügbar ist
kubectl -n "$NS" apply -f deploy/kubernetes/postgres.yaml
kubectl -n "$NS" wait cluster/responseable-pg --for=condition=Ready --timeout=300s
```

CloudNativePG liefert den Schreibdienst `responseable-pg-rw`. Die App verbindet sich mit dem Datenbankowner aus dem erzeugten App-Secret. Der Datenbank-URI verwendet diesen Dienst. Für Backups und PITR kann der [Barman Cloud Plugin](https://cloudnative-pg.io/plugin-barman-cloud/docs/usage/) an einen unabhängigen Bucket angebunden werden.

Lege im Namespace das Secret `responseable-runtime` aus dem zuständigen Secret Store an. Erforderliche Schlüssel sind `DATABASE_URL`, `RESPONSEABLE_OPERATOR` und `RESPONSEABLE_PASSWORD_HASH`. Für Medien `LIVEKIT_API_KEY` und `LIVEKIT_API_SECRET` ergänzen. Für Android `ANDROID_GATEWAY_URL` mit der privaten API-Basis und `ANDROID_GATEWAY_KEY` ergänzen. Für optionales SIP `LIVEKIT_INTERNAL_URL` und `LIVEKIT_SIP_TRUNK_ID` ergänzen. LiveKit verwendet dieselben Signaturschlüssel wie die App.

```sh
helm upgrade --install responseable deploy/helm/responseable -n "$NS" \
  --set-string "app.image=$IMAGE" \
  --set-string "app.publicOrigin=$APP_ORIGIN" \
  --set app.ingress.enabled=true \
  --set-string "app.ingress.tlsSecret=$APP_TLS_SECRET" \
  --wait --rollback-on-failure --timeout 5m
```

Für einen Release von einem Build-Host mit Registry-Zugang:

```sh
docker buildx build --platform "$TARGET_PLATFORM" \
  --build-arg "RESPONSEABLE_DEPLOYMENT_ID=$RELEASE_ID" \
  --tag "$IMAGE_TAG" --push .
```

`TARGET_PLATFORM` ist die Architektur deiner Worker, etwa `linux/amd64` oder `linux/arm64`. `IMAGE_TAG` benennt das freigegebene Registry-Repository samt Release-Tag. `IMAGE` für Helm ist danach dieses Repository mit dem veröffentlichten Digest.

Die Befehle verwenden Helm 4. Bei Helm 3 `--atomic` anstelle von `--rollback-on-failure` verwenden. Der Helm-Hook führt die Migration vor dem Upgrade aus. Bei einem Fehler zuerst die Job-Logs lesen. Ein App-Rollback setzt die Datenbank nicht zurück. Additive Migrationen ermöglichen einen gemischten Versionsstand während des Rollouts.

Für internes LiveKit erst die Medien-Nodes über das etablierte Node-Management mit `responseable.io/media=true` kennzeichnen. Lege im Namespace das Secret `responseable-valkey` mit getrennten Kennwörtern unter `default` und `sentinel` an. Installiere das Upstream-Chart mit den mitgelieferten HA-Werten.

```sh
helm repo add valkey https://valkey.io/valkey-helm/
helm upgrade --install valkey valkey/valkey --version 1.0.0 -n "$NS" \
  -f deploy/kubernetes/valkey.values.yaml --wait --timeout 5m
```

Konfiguriere `livekit.example.yaml` mit passenden Medienpfaden, Sentinel-Passwörtern und API-Schlüsseln und übergebe sie aus dem Secret Store an `responseable-livekit` unter `config.yaml`. Keine befüllte Konfigurationsdatei committen. Ergänze zum App-Upgrade `media.enabled=true`, `media.ingress.enabled=true`, `media.ingress.host`, `media.ingress.tlsSecret` und `app.liveKitUrl=wss://<Medienhost>`. Für eingebautes TURN mit L4-Zugang zusätzlich `media.turnTlsSecret` setzen und die passende TURN-Konfiguration im Secret aktivieren. Aktualisierte LiveKit- oder Runtime-Secrets durch einen kontrollierten Rollout übernehmen.

[CloudNativePG Replikation](https://cloudnative-pg.io/docs/1.26/replication/) · [Valkey Helm und Sentinel](https://github.com/valkey-io/valkey-helm) · [LiveKit Kubernetes](https://docs.livekit.io/transport/self-hosting/kubernetes/)

## Abnahme in Staging

| Aktion | Erwartete Beobachtung |
| --- | --- |
| Browser in zwei Netzen verbinden, Kamera und Bildschirm freigeben | Beide empfangen einen Track. Ein Test mit blockiertem direktem UDP bestätigt TURN/TLS. |
| Einen App-Pod entfernen und denselben Raum erneut laden | Session, Chat und Board bleiben erhalten. Die zweite Replik hält den Webdienst erreichbar. |
| PostgreSQL-Switchover auslösen | App-Readiness reagiert korrekt. Nach Wiederverbindung bleiben quittierte Schreibvorgänge erhalten. |
| Valkey-Primary ausfallen lassen | Sentinel wählt mit Quorum neu. LiveKit erreicht den neuen Primary und neue Meetings funktionieren. |
| Medienpod drainen und ungeplant beenden | Beim Drain können bestehende Räume innerhalb der Grace Period auslaufen. Beim abrupten Ausfall muss der betroffene Raum neu verbinden. Chat und Board laufen weiter. |
| Android-Adapter oder SIM simuliert offline | Alarmierung zeigt einen Fehler oder einen unklaren Ausgang. Webräume, Chat und Board bleiben verfügbar. |
| Backup in neuen Namespace restaurieren | Stichproben für Räume, Chat und Boards stimmen. Zeit bis Wiederanlauf und tatsächlichen Datenstand dokumentieren. |
| Control-Plane-Knoten ausfallen lassen | API bleibt bei Quorum erreichbar. Der verbleibende Cluster plant Pods weiter. |

Zusätzlich Lasttest mit Teilnehmerzahl und erwarteter gleichzeitiger Zahl von Räumen durchführen. LiveKit skaliert über Räume. Ein einzelnes Meeting bleibt an einen SFU-Knoten gebunden. Zwei laufende App-Replikate und ein HPA ersetzen weder ein verifiziertes Restore noch einen zweiten Telefonweg.

## Production cutover

Use one approved canonical HTTPS hostname and keep it stable for registered passkeys. Set `app.publicOrigin` to that exact origin and configure the TLS secret and ingress class. Verify externally to the cluster from the intended operator and guest networks. Configure `RESPONSEABLE_MFA_KEY` from the runtime secret store, back it up separately from the database, and require enrollment with `RESPONSEABLE_MFA_REQUIRED=true`. Put a per-source sign-in limit at the ingress. If setting `RESPONSEABLE_TRUSTED_CLIENT_IP_HEADER`, the ingress must overwrite the header, and direct pod access must be blocked.

1. Build the verified Git revision once and pin its image digest in Helm. Confirm PostgreSQL backups and restore into an isolated database before applying the migration job.
2. Deploy with `helm upgrade --install --atomic --wait`; verify `/health/live`, `/health/ready`, the deployed image digest and the ready replica count. Enrollment and guest tests use only synthetic data and inert providers.
3. Verify authentication from the canonical HTTPS origin and check LiveKit signaling and media separately. Test audio and video from two client networks with working ICE or TURN. Kubernetes port-forward carries TCP only and does not establish production UDP reachability. A failing media port-forward can also terminate other forwards sharing its process.
4. Confirm a pod disruption preserves existing sessions, documents and chat. Exercise database failover and the restore procedure before accepting a high-availability target.
5. If the web rollout fails, use `helm rollback` to the previously verified release and retest readiness. Schema changes are additive for rollback. Restore from backup only when needed for data recovery, with the data-loss window stated explicitly.

Revoking an invite blocks subsequent protected HTTP requests. A LiveKit connection already established under that invitation can remain active until disconnected. The join grant expires after two minutes and has no effect on an existing media connection. Optional AI setup is described in [AI configuration](ai.md).
