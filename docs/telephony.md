# SMS und Telefonie

`SMS_PROVIDER` und `CALL_PROVIDER` wählen unabhängig zwischen `android`, `webhook`, `aws` und `off`. Ohne Auswahl bleibt Android der Standard. Fehlende Konfiguration blendet die jeweilige Aktion aus. Der Übungsmodus deaktiviert alle Anbieter. Der Operator sieht Anbieter, Nummer und Nachricht vor der Bestätigung. Wechselt der Anbieter zwischen Vorschau und Bestätigung, ist eine neue Vorschau erforderlich.

| Anbieter | SMS | Ausgehender Anruf |
| --- | --- | --- |
| Android | Einladung mit Link | Das separate Android-Gerät wählt. |
| Webhook | Einladung mit Link | Die Bridge spielt dem Empfänger die übergebene Ansage ab. |
| AWS | Einladung mit Link | AWS liest dem Empfänger die Ansage vor. |
| LiveKit SIP | | Wählt einen Teilnehmer in den Meetingraum ein. Gesonderte Aktion. |

Die SMS-Einladung wird bei Bestätigung für eine Stunde freigeschaltet. Pro Bestätigung beansprucht PostgreSQL den Auftrag genau einmal. Unklare Ergebnisse werden nicht automatisch erneut gesendet. „Angenommen“ beschreibt die Annahme durch den Anbieter. Empfang oder Abhören erfordern eine gesonderte Bestätigung.

## Android

`ANDROID_GATEWAY_URL` und `ANDROID_GATEWAY_KEY` bleiben unverändert. Der Dienst sendet `X-Android-Key` und prüft `GET health` auf `{"ok":true,"result":{"androidReady":true}}`, bevor er `POST sms/send` mit `{number,text}` oder `POST call/outgoing` mit `{number}` aufruft. Die Aktion gilt bei HTTP 2xx und `{"ok":true}` als angenommen.

## Webhook

`NOTIFICATION_WEBHOOK_URL` ist der vollständige HTTPS-Endpunkt. `NOTIFICATION_WEBHOOK_TOKEN` wird als Bearer-Token gesendet. HTTP ist für lokale Loopback-Tests bei deaktiviertem Secure-Cookie verfügbar. Weiterleitungen werden nicht verfolgt. Eine eigene Bridge kann mit diesem Vertrag andere Anbieter integrieren.

```json
{"requestId":"<uuid>","capability":"sms","number":"+491555555555","text":"<Nachricht>"}
```

`capability` ist `sms` oder `voice`. Bei `voice` enthält `text` die vorgegebene Ansage. Die Bridge sollte `requestId` deduplizieren. Bei HTTP 2xx gibt sie `{"status":"accepted"}`, `{"status":"rejected"}` oder `{"status":"unknown"}` zurück. HTTP 4xx außer 408 gilt als Ablehnung. Timeout, 408, 5xx, Redirects und unlesbare Antworten gelten als unklar.

## AWS End User Messaging SMS Voice v2

`AWS_REGION`, `AWS_SMS_ORIGINATION_IDENTITY` für SMS und `AWS_VOICE_ORIGINATION_IDENTITY` sowie `AWS_VOICE_ID` für Sprachalarme setzen. Die Voice-ID muss von AWS für diesen Dienst unterstützt werden. Identitäten müssen im jeweiligen Konto und der Region für den Kanal freigeschaltet sein. Sandbox-, Länder- und Quotenbeschränkungen gelten auch für Tests in einem echten Konto. Die App verwendet `SendTextMessage` für transaktionale SMS und `SendVoiceMessage` für eine Klartextansage mit maximal 500 Zeichen. Der SDK-Client führt einen Versuch aus.

Der SDK-Client nutzt die Standard-Credential-Chain. Im Cluster eine berechtigte Workload-Identität verwenden. Die IAM-Rolle benötigt für die gewählten Kanäle `sms-voice:SendTextMessage` bzw. `sms-voice:SendVoiceMessage`. Der Helm-Chart lädt die Anbieterumgebung über das bestehende App-Secret. Anbietersecrets gehören in die Secret-Verwaltung. [AWS SendTextMessage](https://docs.aws.amazon.com/pinpoint/latest/apireference_smsvoicev2/API_SendTextMessage.html) · [AWS SendVoiceMessage](https://docs.aws.amazon.com/pinpoint/latest/apireference_smsvoicev2/API_SendVoiceMessage.html)


## Teilnehmer per LiveKit SIP einwählen

`LIVEKIT_INTERNAL_URL` ist die serverseitige LiveKit-HTTP(S)-Adresse, `LIVEKIT_SIP_TRUNK_ID` der ausgehende Trunk. Die Anwendung nutzt die Meeting-API-Zugangsdaten. `LIVEKIT_URL` bleibt die separate WebSocket-Adresse für Browser. Vor dem Einsatz mit einer vorgesehenen Testnummer Anwahl, Audio in beide Richtungen und Auflegen prüfen. [LiveKit SIP](https://docs.livekit.io/transport/self-hosting/sip-server/)
