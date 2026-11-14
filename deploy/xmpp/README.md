# Isolated XMPP pilot

Use ejabberd Community 25.10 (GPLv2) and the unchanged Converse 12.0.0 distribution (MPL-2.0). Run `scripts/xmpp/install-converse.sh` before the pilot app build. It verifies the archive digest, installs the complete dist tree, and publishes the upstream LICENSE and COPYRIGHT alongside the assets. The matching source is available in the [Converse release](https://github.com/conversejs/converse.js/releases/tag/v12.0.0). See [ejabberd source](https://github.com/processone/ejabberd/tree/25.10).

Use a dedicated real-mode ResponseAble database and synthetic accounts. Create the ejabberd config ConfigMap and TLS/JWK Secret before applying pilot.yaml. Supply a private hostname and a trusted TLS chain for the browser WSS listener. The app must trust the admin TLS chain separately. Keep the admin listener private and authorize only the required affiliation operation.

Keep XMPP_PILOT_ENABLED off until a provisioned room is mapped in xmpp_rooms and the reconciliation endpoint is called periodically. An expired JWT prevents new authorization but does not itself terminate a connection. Test the outcast transition with open clients, reconnect and MAM before enabling a room for real participants. MAM content is readable by the server.

This single replica with a local-path PVC is a pilot, not HA. Verify restart and restore before using it for any durable records.
