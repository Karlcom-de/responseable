#!/bin/sh
set -eu

namespace=${RESPONSEABLE_EXERCISE_NAMESPACE:-responseable-exercise}
root=$(git rev-parse --show-toplevel)
cd "$root"
revision=$(git rev-parse HEAD)
archive=$(mktemp)
source="responseable-exercise-$(printf %.16s "$revision")"
trap 'rm "$archive"' EXIT
git archive --format=tar.gz --output="$archive" "$revision"
if [ "$(wc -c < "$archive")" -gt 750000 ]; then
  echo 'Source archive exceeds the exercise ConfigMap budget.' >&2
  exit 1
fi

if ! kubectl get namespace "$namespace" >/dev/null 2>&1; then
  kubectl create namespace "$namespace"
fi
kubectl -n "$namespace" create configmap "$source" \
  --from-file=source.tgz="$archive" --dry-run=client -o yaml | kubectl -n "$namespace" apply --server-side -f -

# The revision-specific source stays available for pod restarts and concurrent launches.
sed "s/responseable-exercise-source/$source/g" deploy/kubernetes/exercise.yaml | kubectl -n "$namespace" apply -f -

if ! kubectl -n "$namespace" rollout status deployment/responseable-exercise --timeout=8m; then
  kubectl -n "$namespace" get pods -l app=responseable-exercise -o wide >&2 || true
  for container in build web postgres; do
    kubectl -n "$namespace" logs deployment/responseable-exercise -c "$container" --tail=30 >&2 || true
  done
  exit 1
fi
if [ "${RESPONSEABLE_EXERCISE_NO_FORWARD:-0}" = 1 ]; then exit 0; fi
echo 'Open http://127.0.0.1:3190 and choose Run the exercise.'
kubectl -n "$namespace" port-forward --address 127.0.0.1 deployment/responseable-exercise 3190:3000
