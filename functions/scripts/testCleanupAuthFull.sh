#!/bin/bash
# Test cleanupAuthUsers function via Firebase emulator
# Usage: bash scripts/testCleanupAuthFull.sh

set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

cleanup() {
  echo ""
  echo "--- ปิด emulator ---"
  kill $(lsof -t -i:9099 -i:9000 -i:5001 -i:4400 2>/dev/null) 2>/dev/null || true
}
trap cleanup EXIT

echo "========================================="
echo "  Test cleanupAuthUsers (cutoff = 10s)"
echo "========================================="
echo ""

echo "[1/6] Kill emulator เก่า..."
kill $(lsof -t -i:9099 -i:9000 -i:5001 -i:4400 2>/dev/null) 2>/dev/null || true
sleep 1

echo "[2/6] เปิด emulator..."
npx firebase emulators:start --only auth,database,functions > /tmp/emulator_test.log 2>&1 &
EMUPID=$!

echo "     รอ emulator ขึ้น..."
READY=0
for i in $(seq 1 40); do
  if curl -s http://127.0.0.1:9099/ > /dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "     FAIL: Emulator ไม่ขึ้น"
  cat /tmp/emulator_test.log | tail -15
  exit 1
fi
echo "     Emulator พร้อมแล้ว"

echo ""
echo "[3/6] สร้าง anonymous user..."
RESP=$(curl -s -X POST \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H "Content-Type: application/json" \
  -d '{"returnSecureToken":true}')
echo "     $RESP"

TEST_UID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])" 2>/dev/null)
if [ -z "$TEST_UID" ]; then
  echo "     FAIL: สร้าง user ไม่ได้"
  exit 1
fi
echo "     UID = $TEST_UID"

echo ""
echo "[4/6] รอ 10 วินาที (ให้ user เก่าพอจะโดน cutoff)..."
for i in $(seq 10 -1 1); do printf "     %d " $i; sleep 1; done
echo ""
echo "     หมดเวลารอ!"

echo ""
echo "[5/6] เรียก cleanupAuthUsersTest?cutoffSeconds=10..."
RESULT=$(curl -s "http://127.0.0.1:5001/demo-spyfall/us-central1/cleanupAuthUsersTest?cutoffSeconds=10")
echo "     Response: $RESULT"

echo ""
echo "[6/6] ตรวจสอบว่า user ถูกลบ..."
LOOKUP=$(curl -s -X POST \
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"idToken\":\"$TEST_UID\"}")
echo "     $LOOKUP"

echo "$LOOKUP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d or len(d.get('users', [])) == 0:
    print('     PASS: User ถูกลบแล้ว!')
else:
    print('     FAIL: User ยังอยู่')
"

echo ""
echo "========================================="
echo "  จบการทดสอบ"
echo "========================================="
