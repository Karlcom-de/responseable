#!/bin/sh
set -eu
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
node -e 'fetch("https://github.com/conversejs/converse.js/releases/download/v12.0.0/converse.js-12.0.0.tgz", {signal: AbortSignal.timeout(60000)}).then(async response => {
  if (!response.ok) throw Error("Converse download failed: " + response.status);
  require("node:fs").writeFileSync(process.argv[1], Buffer.from(await response.arrayBuffer()));
})' "$archive"
echo "41684fcfa5f8c7a79a0b557834db5c57c016005bff66d6e002587252f3676bbb  $archive" | sha256sum -c -
mkdir -p public/converse
tar xzf "$archive" --strip-components=2 -C public/converse package/dist
tar xzf "$archive" --strip-components=1 -C public/converse package/LICENSE package/COPYRIGHT
test -s public/converse/converse.min.js
test -s public/converse/converse.min.css
