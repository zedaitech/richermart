#!/usr/bin/env bash
# End-to-end CRUD smoke test against the deployed site.
# Usage:  ADMIN_PASSWORD='...' bash admin/smoke-test.sh
set -u

BASE="${BASE:-https://richermart.netlify.app}"
PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD env var required}"
NODE="${NODE:-node}"

# Helper — runs _extract.mjs with the expression as its argument.
# Using a function avoids word-splitting when NODE has spaces (Windows path).
extract() { "$NODE" admin/_extract.mjs "$1"; }

PASS=0
FAIL=0
FAILED=()

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    PASS=$((PASS+1))
    printf '  \033[32m✓\033[0m %-50s %s\n' "$label" "$actual"
  else
    FAIL=$((FAIL+1))
    FAILED+=("$label (expected=$expected got=$actual)")
    printf '  \033[31m✗\033[0m %-50s expected=%s got=%s\n' "$label" "$expected" "$actual"
  fi
}

section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------- 1. PUBLIC ----------
section '1. Public catalog'
CAT=$(curl -sS "$BASE/api/catalog")
CAT_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/catalog")
check 'GET /api/catalog → 200' '200' "$CAT_CODE"
STORE_NAME=$(echo "$CAT" | extract 'd => d.store.name')
check 'catalog.store.name = Richer Mart' 'Richer Mart' "$STORE_NAME"

# ---------- 2. AUTH ----------
section '2. Auth'
LOGIN_BAD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' -d '{"password":"definitely-wrong-xxx-'"$RANDOM"'"}')
check 'wrong password → 401' '401' "$LOGIN_BAD"

LOGIN_RESP=$(curl -sS -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RESP" | extract 'd => d.token')
if [[ -n "$TOKEN" ]]; then
  PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %-50s token received (len=%d)\n' 'correct password → token' "${#TOKEN}"
else
  FAIL=$((FAIL+1)); FAILED+=('correct password → token')
  printf '  \033[31m✗\033[0m correct password → token\n'
  echo "  body: $LOGIN_RESP"
  printf '\nAborting — cannot proceed without a token.\n'
  exit 1
fi

NO_AUTH=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/admin/items")
check 'unauthenticated GET /items → 401' '401' "$NO_AUTH"

# ---------- 3. STORE (R+U) ----------
section '3. Store CRUD'
STORE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/admin/store" -H "Authorization: Bearer $TOKEN")
check 'GET /api/admin/store → 200' '200' "$STORE_CODE"

STORE=$(curl -sS "$BASE/api/admin/store" -H "Authorization: Bearer $TOKEN")
PUT_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/store" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$STORE")
check 'PUT /api/admin/store round-trip → 200' '200' "$PUT_CODE"

# ---------- 4. CATEGORIES CRUD ----------
section '4. Categories CRUD'
LIST_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/admin/categories" -H "Authorization: Bearer $TOKEN")
check 'GET /api/admin/categories → 200' '200' "$LIST_CODE"

CREATE=$(curl -sS -X POST "$BASE/api/admin/categories" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"__smoke_cat","section":"fruits","sort":9999,"is_active":true}')
CAT_ID=$(echo "$CREATE" | extract 'd => d.id')
if [[ -n "$CAT_ID" ]]; then
  PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %-50s id=%s\n' 'POST category → 201' "$CAT_ID"
else
  FAIL=$((FAIL+1)); FAILED+=('POST category'); printf '  \033[31m✗\033[0m POST category\n  body: %s\n' "$CREATE"
fi

if [[ -n "$CAT_ID" ]]; then
  UPDATE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/categories/$CAT_ID" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"name":"__smoke_cat_upd","section":"fruits","sort":9999,"is_active":true}')
  check 'PUT /api/admin/categories/:id → 200' '200' "$UPDATE_CODE"

  DELETE_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/categories/$CAT_ID" \
    -H "Authorization: Bearer $TOKEN")
  check 'DELETE /api/admin/categories/:id → 200' '200' "$DELETE_CODE"

  VERIFY_404=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/categories/$CAT_ID" \
    -H "Authorization: Bearer $TOKEN")
  check 'DELETE same id again → 404' '404' "$VERIFY_404"
fi

# ---------- 5. ITEMS CRUD ----------
section '5. Items CRUD (incl. weight_options jsonb)'
REAL_CATS=$(curl -sS "$BASE/api/admin/categories" -H "Authorization: Bearer $TOKEN")
FRUIT_CAT_ID=$(echo "$REAL_CATS" | extract 'd => (d.find(c => c.section === "fruits") || {}).id')

if [[ -z "$FRUIT_CAT_ID" ]]; then
  printf '  \033[33m⚠\033[0m no fruits category in DB — skipping items tests\n'
else
  ITEM_CREATE=$(curl -sS -X POST "$BASE/api/admin/items" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"__smoke_item\",\"price\":99,\"category_id\":$FRUIT_CAT_ID,\"weight_options\":[{\"label\":\"500g\",\"grams\":500,\"price\":99},{\"label\":\"1 kg\",\"grams\":1000,\"price\":180}]}")
  ITEM_ID=$(echo "$ITEM_CREATE" | extract 'd => d.id')
  if [[ -n "$ITEM_ID" ]]; then
    PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %-50s id=%s\n' 'POST item (with weight_options jsonb) → 201' "$ITEM_ID"
  else
    FAIL=$((FAIL+1)); FAILED+=('POST item'); printf '  \033[31m✗\033[0m POST item\n  body: %s\n' "$ITEM_CREATE"
  fi

  if [[ -n "$ITEM_ID" ]]; then
    UPD_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/items/$ITEM_ID" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"name\":\"__smoke_item_upd\",\"price\":109,\"category_id\":$FRUIT_CAT_ID,\"weight_options\":[{\"label\":\"250g\",\"grams\":250,\"price\":59},{\"label\":\"1 kg\",\"grams\":1000,\"price\":200}]}")
    check 'PUT /api/admin/items/:id (updates weight_options) → 200' '200' "$UPD_CODE"

    DEL_CODE=$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/items/$ITEM_ID" \
      -H "Authorization: Bearer $TOKEN")
    check 'DELETE /api/admin/items/:id → 200' '200' "$DEL_CODE"
  fi
fi

# ---------- 6. ADMIN UPLOAD ----------
section '6. Admin image upload'
NO_AUTH_UPLOAD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/upload")
check 'unauthenticated upload → 401' '401' "$NO_AUTH_UPLOAD"

EMPTY_UPLOAD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/upload" \
  -H "Authorization: Bearer $TOKEN")
check 'authenticated upload with no body → 400' '400' "$EMPTY_UPLOAD"

# ---------- 7. ASSET-FILE (v2 Function path routing) ----------
section '7. Asset & Rx serving endpoints'
BOGUS_ID='abcdef1234567890abcdef1234567890'
ASSET_404=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/assets/$BOGUS_ID")
check 'GET /api/assets/<bogus> → 404' '404' "$ASSET_404"
RX_404=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/api/rx/$BOGUS_ID")
check 'GET /api/rx/<bogus> → 404' '404' "$RX_404"

# ---------- 8. RATE LIMIT ----------
section '8. Login rate-limit (5/5min)'
for i in 1 2 3 4 5; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/login" \
    -H 'Content-Type: application/json' -d '{"password":"rate-limit-test-bad"}')
  printf '  attempt %d → %s\n' "$i" "$code"
done
THROTTLED=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' -d '{"password":"rate-limit-test-bad"}')
check '6th bad attempt → 429' '429' "$THROTTLED"

# Clear attempts by a successful login
curl -sS -o /dev/null -X POST "$BASE/api/admin/login" \
  -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}" || true

# ---------- REPORT ----------
section 'Result'
echo "  pass: $PASS"
echo "  fail: $FAIL"
if (( FAIL > 0 )); then
  printf '\n\033[31mFailed tests:\033[0m\n'
  for t in "${FAILED[@]}"; do echo "  - $t"; done
  exit 1
fi
printf '\n\033[32mAll CRUD paths verified.\033[0m\n'
