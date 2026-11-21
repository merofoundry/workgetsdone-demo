#!/usr/bin/env bash
# Upload frontend/site.zip to the stage application, activate it, run the hosted smoke.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP=104c98da-971b-4a99-8fad-4fd2ef06eb3f
BASE="${BASE:-https://staging.merofoundry.com}"
SITE="${WGD_BASE:-https://workgetsdone.staging.merofoundry.app}"
ZIP="$ROOT/frontend/site.zip"
KEY="$(grep '^API_KEY=' "$ROOT/.env-api-key" | cut -d= -f2- | sed "s/^['\"]//; s/['\"]\$//")"
[[ -n "$KEY" ]] || { echo "API_KEY missing in .env-api-key" >&2; exit 1; }
[[ -f "$ZIP" ]] || { echo "run npm run build && npm run package first" >&2; exit 1; }
hdr=(-H "X-API-Key: $KEY" -sS -m 180)
upload="$(curl "${hdr[@]}" -F "file=@$ZIP;type=application/zip" "$BASE/api/v1/public/applications/$APP/site/versions")"
version="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or d.get("version",{}).get("id") or "")' <<<"$upload")"
[[ -n "$version" ]] || { echo "upload failed: $upload" >&2; exit 1; }
code="$(curl "${hdr[@]}" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/public/applications/$APP/site/versions/$version/activate")"
echo "activate HTTP $code"
[[ "$code" == 200 ]] || { echo "activate failed: HTTP $code" >&2; exit 1; }
versions="$(curl "${hdr[@]}" "$BASE/api/v1/public/applications/$APP/site/versions")"
active="$(python3 -c 'import json,sys; d=json.load(sys.stdin); d=d if isinstance(d,list) else d.get("items") or d.get("versions") or d.get("results") or []; print(next((v.get("id") for v in d if v.get("is_active")),""))' <<<"$versions")"
[[ "$active" == "$version" ]] || { echo "active version mismatch: expected $version, got '$active'" >&2; exit 1; }
echo "active version confirmed: $active"
size=$(stat -c %s "$ZIP"); sha=$(sha256sum "$ZIP" | cut -d' ' -f1)
echo "version $version size $size sha256 $sha"
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp -e WGD_BASE="$SITE" -v "$ROOT:/work" -w /work/frontend mcr.microsoft.com/playwright:v1.59.1-noble node scripts/verify-hosted-login.mjs --skip-invalid
printf '\n\n### %s %b Stage release\n\nUploaded and activated site version `%s` (ZIP %s bytes, SHA-256 `%s`); hosted login check passed for bob and jane.\n' "$(date -u +%Y-%m-%d)" '\xe2\x80\x94' "$version" "$size" "$sha" >> "$ROOT/BUILD_LOG.md"
