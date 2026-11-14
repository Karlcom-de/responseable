#!/bin/sh
set -eu

namespace=${1:?Pass the isolated XMPP pilot namespace}
schema=$(mktemp)
trap 'rm -f "$schema"' EXIT
curl -fsSL --max-time 45 https://raw.githubusercontent.com/processone/ejabberd/25.10/sql/pg.sql > "$schema"
expected=f427948e095ef07c1a7bcd5873e4478d4c40e3897a59172a3bcc0ff5be422754
actual=$(openssl dgst -sha256 "$schema" | awk '{print $NF}')
test "$actual" = "$expected" || { echo 'ejabberd schema checksum mismatch' >&2; exit 1; }

kubectl -n "$namespace" rollout status deploy/xmpp-archive --timeout=90s
# The advisory lock protects the empty-schema check and import on concurrent starts.
{
  printf '%s\n' 'SELECT pg_advisory_xact_lock(250100);'
  printf '%s\n' "SELECT to_regclass('public.archive') IS NULL AS needs_schema" '\gset' '\if :needs_schema'
  cat "$schema"
  printf '\n%s\n' '\endif'
} | kubectl -n "$namespace" exec -i deploy/xmpp-archive -- \
  psql -U xmpp -d xmpp -X --single-transaction -v ON_ERROR_STOP=1
