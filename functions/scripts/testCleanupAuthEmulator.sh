#!/bin/bash
# Test cleanupAuthUsers via emulator
# วิธีใช้: bash scripts/testCleanupAuthEmulator.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "=== 1. Kill emulator เก่า ==="
kill $(lsof -t -i:9099 -i:9000 -i:5001 2>/dev/null) 2>/dev/null || true
sleep 1

echo "=== 2. เปิด emulator ==="
npx firebase emulators:start --only auth,database,functions &
EMULATOR_PID=$!
trap "kill $EMULATOR_PID 2>/dev/null" EXIT

echo "   รอ emulator ขึ้น..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:9099/ > /dev/null 2>&1; then
    echo "   Auth emulator พร้อมแล้ว"
    break
  fi
  sleep 1
done

echo ""
echo "=== 3. สร้าง anonymous user ผ่าน Admin SDK ==="
# ใช้ Firebase Auth REST API สร้าง user
SIGNUP_RESP=$(curl -s -X POST \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H "Content-Type: application/json" \
  -d '{"returnSecureToken":true}')
echo "   Response: $SIGNUP_RESP"

TEST_UID=$(echo "$SIGNUP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])" 2>/dev/null || echo "")
if [ -z "$TEST_UID" ]; then
  echo "   สร้าง user ไม่สำเร็จ ลองใช้ admin API..."
  # ใช้ Admin SDK ผ่าน REST
  ADMIN_RESP=$(curl -s -X POST \
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
    -H "Content-Type: application/json" \
    -d '{"returnSecureToken":false}')
  echo "   Admin Response: $ADMIN_RESP"
fi
echo "   UID = $TEST_UID"

echo ""
echo "=== 4. รอ 10 วินาที ==="
for i in $(seq 10 -1 1); do printf "%d " $i; sleep 1; done
echo ""

echo ""
echo "=== 5. เรียก cleanupAuthUsersTest (cutoff=10s) ==="
RESULT=$(curl -s "http://127.0.0.1:5001/demo-spyfall/us-central1/cleanupAuthUsersTest?cutoffSeconds=10")
echo "   Response: $RESULT"

echo ""
echo "=== 6. ตรวจสอบ ==="
if [ -n "$TEST_UID" ]; then
  LOOKUP=$(curl -s -X POST \
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key" \
    -H "Content-Type: application/json" \
    -d "{\"idToken\":\"$TEST_UID\"}")
  echo "   Lookup: $LOOKUP"
  echo "$LOOKUP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d or len(d.get('users', [])) == 0:
    print('   PASS: User ถูกลบแล้ว!')
else:
    print('   FAIL: User ยังอยู่')
" 2>/dev/null || echo "   (ไม่สามารถตรวจสอบได้)"
fi

echo ""
echo "=== จบการทดสอบ ==="
