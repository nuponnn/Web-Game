# Spyfall System Flow

อัปเดตล่าสุด: 2026-08-24 ตามโค้ดปัจจุบันของโปรเจกต์: Next.js 16 App Router + Route Handlers, Vercel hosting/backend, Firebase Realtime Database และ Firebase Auth

## Architecture

- Frontend: Next.js app ใน `app/`
- Backend: Next.js Route Handlers ใน `app/api/**/route.ts` deploy บน Vercel
- Database: Firebase Realtime Database
- Auth: ผู้เล่นใช้ Firebase anonymous auth แบบ browser session/tab persistence, admin ใช้ Google sign-in และต้องมี record ใน `admins/{uid}`
- Cron/cleanup: endpoint ที่เป็น cron ต้องส่ง `X-CRON-SECRET` ตรงกับ `CRON_SECRET`

Route Handlers ใช้ Web `Request`/`Response` API ตาม Next.js 16 และ mutating endpoint ใช้ `POST` โดย client wrapper อยู่ที่ `app/lib/gameFunction.ts` และ `app/lib/adminFunctions.ts`.

## Gameplay Flow

```text
anonymous sign-in
  -> createRoom(name, settings?)
  -> lobby
  -> joinRoom(roomId, name) สำหรับผู้เล่นอื่น
  -> host ตั้งค่า location/spy/joker/time ใน Lobby
  -> startGame(roomId, settings)
  -> playing + private role data per player
  -> endRound(timeout | host_ended)
  -> voting
  -> castVote(targetUid | null)
  -> resolveVote เมื่อโหวตครบหรือหมดเวลา
      -> reveal ทันที ถ้าไม่ได้โหวตโดน spy/joker
      -> guessing ถ้าโหวตโดน spy หรือ joker
  -> submitGuess โดย spy ที่มีสิทธิ์ หรือ resolveGuess เมื่อหมดเวลา
  -> reveal
  -> playAgain กลับ lobby หรือ closeRoom/leaveRoom
```

## Database Shape

Public room state:

```text
rooms/{roomId}
  hostUid: string
  status: "lobby" | "playing" | "voting" | "guessing" | "reveal" | "ended"
  createdAt?: number
  location?: string              // เขียนเฉพาะตอน reveal
  locationId?: string            // id ของ location รอบปัจจุบัน
  selectedLocationId?: string    // location ที่ host เลือกไว้ใน lobby; null/undefined = random
  spyCount?: number
  jokerCount?: number
  roundDuration?: number         // ms
  voteDuration?: number          // ms
  guessDuration?: number         // ms
  players/{uid}
    name: string
    online: boolean
    joinedAt: number
    lastOfflineAt?: number
  round?
    roundId?: string
    startedAt: number
    duration: number
    endsAt: number
    voteEndsAt?: number
    guessEndsAt?: number
  votes/{voterUid}
    targetUid: string | null     // null = skip vote
    votedAt: number
  guess?
    locationName: string
    guessedBy: string
    guessedAt: number
  result?
    winner: "players" | "spy" | "draw" | "team"
    spyUids: string[]
    jokerUids: string[]
    votedOutUid: string | null
```

Private per-player state:

```text
roomPrivate/{roomId}/{uid}
  roundId?: string
  isSpy: boolean
  isJoker: boolean
  role?: string
  location?: string
  canGuess?: boolean             // เฉพาะ spy ที่มีสิทธิ์เดาใน guessing
```

ข้อมูลลับไม่อยู่ใต้ `rooms/{roomId}` เพราะ Firebase Realtime Database rules ที่ parent เปิดอ่านแล้วไม่สามารถ revoke ด้วย child rule ได้ ดังนั้น `roomPrivate/{roomId}/{uid}` ต้องอ่านได้เฉพาะเจ้าของ uid เท่านั้น.

Presence state:

```text
presence/{roomId}/{uid}: true
```

Location catalog:

```text
locations/{locationId}
  name: string
  roles: string[]
  active: boolean
```

Authenticated clients อ่าน `locations` ได้เพื่อแสดงรายการ location ใน lobby/admin และเป็น reference ระหว่างเล่น/เดา แต่การเพิ่ม/แก้ไข/เปิดปิด/ลบ location ทำผ่าน admin route handlers เท่านั้น.

## Game Rules

- ผู้เล่นขั้นต่ำก่อนเริ่ม: `MIN_PLAYERS = 3`
- ผู้เล่นสูงสุดต่อห้อง: `MAX_PLAYERS = 8`
- Location ต้องมี roles อย่างน้อย `MIN_ROLES = 7`
- Spy count ต้องอยู่ในช่วง `1..players - 1`
- Joker count อยู่ในช่วง `0..5`
- ต้องมีผู้เล่นปกติอย่างน้อย 1 คน: `spyCount + jokerCount < players`
- Round duration: 1-15 นาที, default 8 นาที
- Vote duration: 10-120 วินาที, default 30 วินาที
- Guess duration: 10-120 วินาที, default 30 วินาที

Winner logic หลัง resolve vote/guess:

1. ถ้าโหวตโดน Joker: เข้า guessing ให้ spy เดา, spy เดาถูก = `team`, spy เดาผิด/ไม่เดา = `players`
2. ถ้าโหวตโดน Spy: เข้า guessing ให้ spy คนนั้นเดา, spy เดาถูก = `draw`, spy เดาผิด/ไม่เดา = `players`
3. ถ้าไม่ได้โหวตโดน spy/joker, skip ทั้งหมด, หรือคะแนนเสมอ = `spy`

## Backend Endpoints

### Rooms

- `POST /api/rooms/createRoom`
  - auth required
  - input: `{ name, locationId?, spyCount?, jokerCount?, roundDuration?, voteDuration?, guessDuration? }`
  - `locationId` และ `spyCount` ตอน create ต้องเป็น admin
  - validate/clamp duration ตามค่าคงที่กลาง แล้วบันทึก host settings ลง room
  - output: `{ roomId }`

- `POST /api/rooms/joinRoom`
  - auth required
  - input: `{ roomId, name }`
  - เข้าห้องได้เฉพาะ `status = lobby`, ห้ามชื่อซ้ำ, จำกัด 8 คน
  - ถ้า uid เดิมอยู่ในห้องแล้ว จะ mark online และคืน `{ ok: true }` โดยไม่เขียนทับ player เดิม

- `POST /api/rooms/leaveRoom`
  - auth required
  - ลบ player/presence/private/vote ของตัวเอง
  - host ออก = ยุบห้องทันที
  - ถ้าไม่เหลือใคร online จะลบห้องทั้งก้อน

- `POST /api/rooms/closeRoom`
  - host only
  - ลบ `rooms/{roomId}`, `presence/{roomId}`, `roomPrivate/{roomId}`

### Game

- `POST /api/game/startGame`
  - host only, lobby only
  - เลือก active location จาก `locationId`, `room.selectedLocationId`, หรือ random
  - ใช้ Fisher-Yates shuffle สำหรับสุ่ม spy/joker
  - สร้าง `roundId` แล้วเขียน public round และ private role data ใน root update เดียว
  - persist `selectedLocationId`, `spyCount`, `jokerCount`, `roundDuration`, `voteDuration`, `guessDuration` เพื่อใช้ต่อในรอบถัดไป

- `POST /api/game/endRound`
  - player only, playing only
  - `reason = host_ended` ต้องเป็น host
  - `reason = timeout` ต้องถึง `round.endsAt` แล้ว
  - เปลี่ยนเป็น `voting` และตั้ง `round.voteEndsAt`

- `POST /api/game/castVote`
  - player only, voting only
  - input: `{ roomId, targetUid }`, `targetUid = null` คือ skip
  - เปลี่ยนโหวตได้โดยเขียนทับ vote เดิม
  - ถ้าโหวตครบทุกคน จะเรียก resolve logic ทันที

- `POST /api/game/resolveVote`
  - player only, voting only
  - ใช้ได้เมื่อโหวตครบหรือหมด `voteEndsAt`
  - ถ้าโหวตโดน spy/joker จะตั้ง `status = guessing`, `round.guessEndsAt` และ `roomPrivate/{roomId}/{spyUid}/canGuess = true`
  - ถ้าไม่โดน spy/joker จะเขียน public `result` + `location` และเข้า `reveal`

- `POST /api/game/submitGuess`
  - spy ที่มี `canGuess` เท่านั้น, guessing only
  - input: `{ roomId, locationName }`
  - บันทึก `rooms/{roomId}/guess` แล้ว finalize ไป `reveal`

- `POST /api/game/resolveGuess`
  - player only, guessing only
  - ใช้ได้เมื่อมี guess แล้วหรือหมด `guessEndsAt`
  - finalize ไป `reveal`; ถ้าไม่มี guess ถือว่า spy เดาผิด

- `POST /api/game/playAgain`
  - host only
  - ล้าง `round`, `votes`, `guess`, `result`, `roomPrivate/{roomId}` และ private residue ใต้ players
  - คงรายชื่อผู้เล่นและ host settings ไว้ แล้วกลับ `status = lobby`

- `POST /api/game/kickPlayer`
  - host only, lobby only
  - ลบ player, presence และ private data ของผู้เล่นเป้าหมาย

### Locations

- `POST /api/locations/addLocation`
- `POST /api/locations/updateLocation`
- `POST /api/locations/toggleLocationActive`
- `POST /api/locations/deleteLocation`
- `POST /api/locations/seedLocations`

ทุก endpoint ต้องเป็น admin และ validate ผ่าน `cleanAndValidateLocation()` ยกเว้น toggle/delete ที่มี validation เฉพาะของตัวเอง. `seedLocations` เติม default locations จาก `app/lib/server/data/locations.ts` แบบไม่เขียนชื่อซ้ำ และเขียนลง RTDB ด้วย multi-path update เดียว.

### Admins

- `POST /api/admins/listAdmins`
- `POST /api/admins/addAdmin`
- `POST /api/admins/removeAdmin`

Client SDK อ่าน `admins` ได้เพื่อเช็กหน้า admin แต่เขียนไม่ได้ การเพิ่ม/ลบ admin ต้องทำผ่าน server endpoint หรือ Firebase Console เพื่อกัน user สมัครตัวเองเป็น admin.

### Cleanup

- `POST /api/cleanupRooms`
  - ต้องมี `X-CRON-SECRET`
  - ลบห้องอายุเกิน 6 ชั่วโมง
  - ลบห้องที่ผู้เล่นทุกคน offline เกิน 10 นาที
  - ล้าง `presence` และ `roomPrivate` ที่ค้างของห้องที่ไม่มีแล้ว

- `POST /api/cleanupAuthUsers`
  - ต้องมี `X-CRON-SECRET`
  - ลบ anonymous auth users ที่สร้างมาเกิน cutoff

## Frontend Flow

### `app/page.tsx`

- anonymous auth ผ่าน `AuthProvider`
- anonymous auth ใช้ browser session/tab persistence เพื่อให้การทดสอบหลาย tab หรือหลาย session ไม่แชร์ uid เดียวจนเขียนทับ player เดิม
- ผู้เล่นกรอกชื่อก่อน
- กดสร้างห้อง -> `createRoom(name)` -> `/room/{roomId}`
- กดเข้าร่วมห้อง -> กรอกรหัส -> `joinRoom(roomId, name)` -> `/room/{roomId}`

### `app/room/[roomId]/page.tsx`

- subscribe public room + private data ของตัวเองผ่าน `useRoom(roomId, uid)`
- ใช้ `usePresence(roomId, uid, !!room)` เพื่ออัปเดต online/offline
- render ตาม `room.status`: Lobby, Playing, Voting, Guessing, Reveal
- มีปุ่ม fixed มุมขวาบนทุก status: ผู้เล่นทั่วไปเห็น "ออกห้อง", host เห็น "ยุบห้อง"
- ถ้า uid ปัจจุบันไม่อยู่ใน `room.players` จะ redirect กลับหน้าแรก

### `useRoom`

- public room listener: `rooms/{roomId}`
- private listener: `roomPrivate/{roomId}/{uid}`
- รอ private snapshot ครบก่อน render ทุก status (สำหรับผู้ใช้ที่ login)
- merge private data เข้า `room.players[uid]` (isSpy/isJoker/role/canGuess) และ `room.location`
- merge ข้อมูลลับเฉพาะเมื่อ `roundId` ใน private node ตรงกับรอบปัจจุบัน กันข้อมูลรอบเก่าหลุดขึ้น UI

### `LobbyView`

- แสดง room code, players, host badge, online status
- host เปิด settings ได้
- admin host เลือก location ได้, host ทุกคนตั้ง spy/joker/time ได้
- host kick player ได้เฉพาะ lobby
- start game disabled ถ้าน้อยกว่า 3 คน

### `PlayingView`

- Countdown จาก `round.endsAt`
- แสดง card ตาม private role: Spy, Joker, หรือผู้เล่นปกติ
- subscribe active `locations` จาก client SDK เพื่อแสดงรายการสถานที่ที่เป็นไปได้ระหว่างเล่น
- ผู้เล่นกดขีดฆ่า location ที่ตัดออกได้ โดยเก็บใน `localStorage` key `spyfall-crossed:{roomId}:{roundId}`
- host กดจบรอบก่อนเวลาได้
- timeout เรียก `endRound(roomId, "timeout")`

### `VotingView`

- Countdown จาก `round.voteEndsAt`
- โหวตผู้เล่นหรือ skip ได้
- โหวตครบทุกคน resolve อัตโนมัติ
- timeout เรียก `resolveVote(roomId)`

### `GuessView`

- Countdown จาก `round.guessEndsAt`
- spy ที่มี `canGuess` เห็นรายการ active locations และส่งคำตอบผ่าน `submitGuess`
- ผู้เล่นคนอื่นเห็นหน้ารอ ไม่เปิดเผยว่าใครกำลังเดา
- timeout เรียก `resolveGuess(roomId)`

### `RevealView`

- แสดง sequence: voted out -> guess ถ้ามี -> location -> joker ถ้ามี -> spy -> winner -> actions
- host กด `playAgain` เพื่อกลับ lobby ได้

## Deployment Notes

- Vercel ต้องตั้ง `FIREBASE_SERVICE_ACCOUNT_KEY` หรือ `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
- ต้องตั้ง `NEXT_PUBLIC_FIREBASE_DATABASE_URL` และ public Firebase client env vars
- ต้องตั้ง `CRON_SECRET` สำหรับ cleanup endpoints
- Cleanup cron รันผ่าน GitHub Actions (`.github/workflows/cleanup.yml`) ต้องตั้ง repo secrets: `DEPLOY_URL` (URL ของ deployment) และ `CRON_SECRET`
- database.rules.json ไม่ deploy อัตโนมัติพร้อม Vercel — หลังแก้ rules ต้องรัน `firebase deploy --only database` เอง
- ต้องสร้าง admin คนแรกใน `admins/{uid}` ผ่าน Firebase Console หรือ trusted server script ก่อนใช้งานหน้า admin
- Local emulator ใช้ `FIREBASE_DATABASE_EMULATOR_HOST` และ `FIREBASE_AUTH_EMULATOR_HOST`
- Build command ปัจจุบันคือ `next build --webpack`; `npm run build` ผ่านบนเครื่องนี้แล้ว
- ถ้า build เตือน lockfile นอก repo ให้จัด workspace root/lockfile ให้ชัดเจน หรือเพิ่ม `outputFileTracingRoot` เฉพาะกรณี deploy environment มี monorepo root จริง

## Pre-Deploy Checklist (เช็คก่อนขึ้น production)

> ติ๊กทีละข้อ ครบทุกข้อถึง deploy ได้

### 1. Firebase Console (ทำก่อน deploy Vercel)

- [ ] **Deploy security rules** — rules ล่าสุดใน `database.rules.json` (แก้ 2026-08-24: ปิดการ list ห้องทั้งหมด + ซ่อนรายชื่อ admin) ยังไม่มีผลจนกว่าจะรัน:
  ```
  firebase deploy --only database
  ```
- [ ] **เปิด Realtime Database** และ copy URL (รูป `https://{project}-default-rtdb.asia-southeast1.firebasedatabase.app`) ไว้ใส่ env
- [ ] **Anonymous sign-in เปิดอยู่**: Authentication → Sign-in method → Anonymous = Enabled
- [ ] **Google sign-in เปิดอยู่** (สำหรับ admin) + ใส่ domain ของ Vercel (`{app}.vercel.app` หรือ custom domain) ใน Authentication → Settings → Authorized domains
- [ ] **สร้าง admin คนแรก**: เพิ่ม node `admins/{uid}` (uid ของ Google account) มูลค่า `true` ผ่าน Realtime Database console
- [ ] **Generate service account key**: Project Settings → Service accounts → Generate new private key → แปลงเป็น single-line JSON หรือ base64 (อย่า commit!)
- [ ] **Locations มีข้อมูล**: เช็คว่า node `locations/` มีอย่างน้อย 1 location ที่ `active: true` (ไม่งั้น startGame throw ทันที)
- [ ] **Authorized domains ฝั่ง Auth** ครอบคลุม preview URLs ด้วยถ้าจะใช้ (หรือปิด preview deployments)

### 2. Vercel Environment Variables

ตั้งที่ Project → Settings → Environment Variables (ครบทั้ง Production + Preview):

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [ ] `NEXT_PUBLIC_FIREBASE_DATABASE_URL` ← **สำคัญมาก ถ้าลืมตัวนี้ admin SDK จะชี้ DB ผิด/ต่อไม่ได้**
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional — analytics)
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` (single-line JSON หรือ base64) **หรือ** `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
- [ ] `CRON_SECRET` (string ยาวๆ สุ่มใหม่ ห้ามใช้ค่าจาก .env.local ที่เคย commit)

> ⚠️ แก้ env แล้วต้อง **Redeploy** ถึงจะมีผล

### 3. GitHub Secrets (สำหรับ cron cleanup)

Repo → Settings → Secrets and variables → Actions:

- [ ] `DEPLOY_URL` = URL ของ deployment เช่น `https://your-app.vercel.app` (ไม่มี `/` ท้าย)
- [ ] `CRON_SECRET` = ค่าเดียวกับที่ตั้งใน Vercel (ต้องตรงกันเป๊ะ ไม่งั้น cron โดน 401)
- [ ] เปิด Actions ใน repo แล้ว (tab Actions → enable workflows)
- [ ] ทดสอบ cron: tab Actions → "Cleanup Cron" → Run workflow (workflow_dispatch) แล้วดู log ว่าได้ `{"ok":true,...}` ไม่ติด 401

### 4. Deploy & Smoke Test หลังขึ้นจริง

- [ ] `vercel --prod` หรือ push ขึ้น main แล้ว build ผ่านบน Vercel dashboard
- [ ] เปิดเว็บ → กรอกชื่อ → สร้างห้องได้ (anonymous auth ทำงาน)
- [ ] ห้อง 3 คน (เปิด 3 tab/incognito): เริ่มเกม → เห็น role/location → โหวต
- [ ] **ทดสอบ flow เดาใหม่**: โหวต Joker ออก → เข้าหน้า guessing → spy เลือกสถานที่ → หน้า reveal ลำดับถูก (voted-out → guess → location → joker → spy → winner)
- [ ] **ทดสอบ winner ใหม่**: spy ทายถูกหลังโดนโหวต = "เสมอ!" / joker โดนโหวต + spy ทายถูก = "Spy & Joker ชนะ!"
- [ ] playAgain กลับ lobby ได้, host ยุบห้องได้
- [ ] เข้า `/admin` ด้วย Google account ที่เป็น admin ได้ + เพิ่ม location ได้
- [ ] เช็ค Vercel function logs ไม่มี error ซ้ำๆ (เฉพาะ /api/* routes)
- [ ] รอ cron 15 นาทีแรกแล้วเช็คว่าห้องทดสอบโดนลบ (หรือรัน workflow มือ)

### 5. สิ่งที่รู้แล้วว่ายอมรับ risk (ไม่ต้องตกใจ)

- Race window ระดับ ms ระหว่าง `submitGuess` กับ timeout resolver — มี transaction กัน duplicate guess แล้ว แต่ theoretical flip ยังเป็นไปได้ (ยอมรับได้สำหรับ party game)
- `verifyAuth` มี dev bypass decode JWT โดยไม่ verify — ทำงานเฉพาะ `NODE_ENV=development` บนเครื่องเท่านั้น Vercel เป็น production เสมอ
- `rooms/{roomId}/locationId` เขียน public ตั้งแต่ startGame — ใคร inspect network รู้ id ของ location (ไม่ใช่ชื่อ) ก่อน reveal; แก้ภายหลังได้ถ้าอยาก tight
