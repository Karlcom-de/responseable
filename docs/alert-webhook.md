# Outgoing incident alert webhook

Set `RESPONSEABLE_ALERT_WEBHOOK_URL` and `RESPONSEABLE_ALERT_WEBHOOK_TOKEN` in the production runtime Secret. Use an HTTPS receiver with a trusted certificate and a dedicated random token of at least 32 URL-safe characters. Configure one destination as the infrastructure administrator. Alert sends are explicit actions available to administrators and coordinators assigned to the incident.

The receiver verifies the Authorization bearer token and deduplicates the Idempotency-Key before triggering an alarm. In an n8n workflow, configure a POST Webhook node with Header Auth and put the duplicate check before the alarm node. Start with an inert workflow that returns HTTP 202. The request has no telephone number, guest link or account information. Keep personal information out of the optional message.

```json
{
  "type": "incident.alert.requested",
  "id": "598f8917-a80d-454d-87e9-b10625572030",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "incidentId": "synthetic-incident",
  "roomId": "synthetic-room",
  "message": "Check the exercise monitor"
}
```

HTTP 2xx records acceptance by the receiver. A timeout, redirect or other failure records an unclear outcome. Check the receiver's record for that event ID before sending a new alert. Repeating the same ID retrieves its recorded status and does not dispatch again.
