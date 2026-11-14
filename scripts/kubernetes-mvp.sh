#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
namespace=${RESPONSEABLE_EXERCISE_NAMESPACE:-responseable-mvp}
export RESPONSEABLE_EXERCISE_NAMESPACE="$namespace"
work=$(mktemp -d)
pids=''
trap 'for pid in $pids; do kill "$pid" 2>/dev/null || true; done; rm -rf "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
umask 077
k() { kubectl -n "$namespace" "$@"; }
kubectl create namespace "$namespace"

openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj /CN=chat.example.test \
  -addext subjectAltName=DNS:chat.example.test -keyout "$work/key" -out "$work/ca" 2>/dev/null
cat "$work/key" "$work/ca" > "$work/tls.pem"
key=$(openssl rand -hex 32)
# Encode the symmetric key in JWK base64url.
encoded=$(printf %s "$key" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
printf '{"kty":"oct","k":"%s"}\n' "$encoded" > "$work/jwt.jwk"
printf %s "$key" > "$work/XMPP_JWT_SECRET"
openssl rand -hex 32 | tr -d '\n' > "$work/POSTGRES_PASSWORD"
openssl rand -hex 32 | tr -d '\n' > "$work/XMPP_RECONCILE_TOKEN"
k create secret generic xmpp-pilot-identity --from-file="$work/tls.pem" --from-file="$work/jwt.jwk"
k create secret generic xmpp-archive-db --from-literal=POSTGRES_DB=xmpp --from-literal=POSTGRES_USER=xmpp --from-file="$work/POSTGRES_PASSWORD"
k apply -f deploy/xmpp/archive.yaml
./scripts/xmpp/init-archive.sh "$namespace"
sed '/port: 5443/,/\/xmpp-websocket/s/tls: true/tls: false/' deploy/xmpp/ejabberd.yml > "$work/ejabberd.yml"
k create configmap xmpp-pilot-config --from-file="$work/ejabberd.yml"
k apply -f deploy/xmpp/pilot.yaml
k rollout status deploy/xmpp-pilot --timeout=90s
openssl rand -hex 32 | k exec -i deploy/xmpp-pilot -- sh -ec 'read -r password; ejabberdctl register provisioner chat.example.test "$password"'
k exec deploy/xmpp-pilot -- ejabberdctl oauth_issue_token provisioner@chat.example.test 86400 ejabberd:admin | awk 'NR==1 && length($1)==32 {printf "%s",$1}' > "$work/XMPP_ADMIN_TOKEN"
test -s "$work/XMPP_ADMIN_TOKEN"
for room in command north; do
  k exec deploy/xmpp-pilot -- ejabberdctl create_room "$room" muc.chat.example.test chat.example.test
done
k create secret generic xmpp-exercise-app --from-file="$work/XMPP_ADMIN_TOKEN" --from-file="$work/XMPP_JWT_SECRET" --from-file="$work/XMPP_RECONCILE_TOKEN"
k create configmap xmpp-exercise-ca --from-file=ca.pem="$work/ca"
k expose deploy xmpp-pilot --name=xmpp-admin --port=5444
ip=$(k get service xmpp-admin -o jsonpath='{.spec.clusterIP}')

revision=$(git rev-parse HEAD)
git archive --format=tar.gz --output="$work/source.tgz" "$revision"
test "$(wc -c < "$work/source.tgz")" -lt 750000
k create configmap responseable-exercise-source --from-file="$work/source.tgz"
sed '/npm run build/i\
              ./scripts/xmpp/install-converse.sh
' deploy/kubernetes/exercise.yaml | k apply -f -
k patch deployment responseable-exercise --type strategic -p '{"spec":{"template":{"metadata":{"labels":{"app-role":"xmpp-bootstrap"}},"spec":{"hostAliases":[{"ip":"'"$ip"'","hostnames":["chat.example.test"]}],"volumes":[{"name":"xmpp-ca","configMap":{"name":"xmpp-exercise-ca"}}],"containers":[{"name":"web","volumeMounts":[{"name":"xmpp-ca","mountPath":"/run/xmpp-ca","readOnly":true}],"envFrom":[{"secretRef":{"name":"xmpp-exercise-app"}}],"env":[{"name":"NODE_EXTRA_CA_CERTS","value":"/run/xmpp-ca/ca.pem"},{"name":"XMPP_ADMIN_URL","value":"https://chat.example.test:5444/api"},{"name":"XMPP_DOMAIN","value":"chat.example.test"},{"name":"XMPP_MUC_DOMAIN","value":"muc.chat.example.test"},{"name":"XMPP_ASSETS_BASE","value":"/converse/"},{"name":"XMPP_WEBSOCKET_URL","value":"ws://127.0.0.1:7883/xmpp-websocket"},{"name":"XMPP_EXERCISE_LOOPBACK","value":"true"},{"name":"XMPP_PILOT_ENABLED","value":"true"},{"name":"RESPONSEABLE_EXERCISE_MEDIA","value":"true"},{"name":"LIVEKIT_URL","value":"ws://127.0.0.1:7880"},{"name":"LIVEKIT_API_KEY","value":"devkey"},{"name":"LIVEKIT_API_SECRET","value":"secret"}]}]}}}}'
k apply -f deploy/kubernetes/exercise-media.yaml
k rollout status deploy/responseable-exercise --timeout=8m
k rollout status deploy/exercise-media --timeout=90s
k exec deploy/responseable-exercise -c postgres -- psql -U exercise -d exercise -v ON_ERROR_STOP=1 -c "INSERT INTO xmpp_rooms VALUES ('demo-haupt','command'),('demo-nord','north');"
k apply -f deploy/xmpp/exercise-reconcile.yaml
k rollout status deploy/exercise-reconcile --timeout=90s
start_forward() {
  deployment=$1
  mapping=$2
  log="$work/forward-${mapping%%:*}.log"
  kubectl -n "$namespace" port-forward --address 127.0.0.1 "deploy/$deployment" "$mapping" > "$log" 2>&1 &
  pid=$!
  pids="$pids $pid"
  for attempt in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then cat "$log" >&2; exit 1; fi
    if grep -q 'Forwarding from 127.0.0.1:' "$log"; then return; fi
    sleep 1
  done
  cat "$log" >&2
  echo "Timed out starting forward $mapping" >&2
  exit 1
}
start_forward exercise-media 7880:7880
start_forward exercise-media 7881:7881
start_forward xmpp-pilot 7883:5443
start_forward responseable-exercise 3190:3000
echo 'Open http://127.0.0.1:3190 and select Run the exercise.'
while :; do
  for pid in $pids; do
    if ! kill -0 "$pid" 2>/dev/null; then
      tail -n 10 "$work"/forward-*.log >&2
      echo 'A port-forward stopped. The cluster resources remain in the test namespace.' >&2
      exit 1
    fi
  done
  sleep 1
done
