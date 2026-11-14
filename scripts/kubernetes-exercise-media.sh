#!/bin/sh
set -eu
namespace=${RESPONSEABLE_EXERCISE_NAMESPACE:-responseable-exercise}
export RESPONSEABLE_EXERCISE_NAMESPACE="$namespace"
export RESPONSEABLE_EXERCISE_NO_FORWARD=1
./scripts/kubernetes-exercise.sh

# LiveKit --dev uses public fixture credentials. This profile only uses loopback
# forwarding and a deny-all ingress policy. Never expose it as a Service.
kubectl -n "$namespace" apply -f deploy/kubernetes/exercise-media.yaml
kubectl -n "$namespace" rollout status deploy/exercise-media --timeout=90s
kubectl -n "$namespace" set env deploy/responseable-exercise -c web \
  RESPONSEABLE_EXERCISE_MEDIA=true LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret
kubectl -n "$namespace" rollout status deploy/responseable-exercise --timeout=8m

pids=''
trap 'for pid in $pids; do kill "$pid" 2>/dev/null || true; done' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
kubectl -n "$namespace" port-forward --address 127.0.0.1 deploy/exercise-media 7880:7880 &
pids="$!"
kubectl -n "$namespace" port-forward --address 127.0.0.1 deploy/exercise-media 7881:7881 &
pids="$pids $!"
echo 'Open http://127.0.0.1:3190 and choose Run the exercise.'
kubectl -n "$namespace" port-forward --address 127.0.0.1 deploy/responseable-exercise 3190:3000
