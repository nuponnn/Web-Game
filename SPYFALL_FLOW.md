# Spyfall System Flow

เอกสารนี้อัปเดตตามโค้ดปัจจุบันของโปรเจกต์: Next.js App Router + Route Handlers, Firebase Realtime Database, Firebase Auth และ cron endpoints บน Vercel/GitHub Actions

## Architecture

- Frontend: Next.js app ใน `app/`
- Backend: Next.js Route Handlers ใน `app/api/**/route.ts`
- Database: Firebase Realtime Database
- Auth: ผู้เล่นใช้ anonymous auth แบบ browser session/tab persistence, admin ใช้ Google sign-in และต้องมี record ใน `admins/{uid}` อยู่ก่อน
- Secrets: API ที่เป็น cron ต้องส่ง `X-CRON-SECRET` ตรงกับ `CRON_SECRET`

Route Handlers ใช้ Web `Request`/`Response` API ตาม Next.js 16 และทุก mutating endpoint เป็น `POST` โดย client wrapper อยู่ที่:

- `app/lib/gameFunction.ts`
- `app/lib/adminFunctions.ts`

## Gameplay Flow

```text
anonymous sign-in
  -> createRoom(name)
  -> lobby
  -> joinRoom(roomId, name) สำหรับผู้เล่นอื่น
  -> host ตั้งค่าเกมใน Lobby
  -> startGame(roomId, settings)
  -> playing + private role data per player
  -> endRound(timeout | host_ended)
  -> voting
  -> castVote(targetUid | null)
  -> resolveVote เมื่อโหวตครบหรือหมดเวลา
  -> reveal
  -> playAgain กลับ lobby หรือ closeRoom/leaveRoom
```

## Database Shape

Public room state:

```text
rooms/{roomId}
  hostUid: string
  status: "lobby" | "playing" | "voting" | "reveal" | "ended"
  createdAt: number
  location?: string              // เขียนเฉพาะตอน reveal
  locationId?: string            // id ของ location รอบปัจจุบัน
  selectedLocationId?: string    // location ที่ host เลือกไว้ใน lobby; null = random
  spyCount?: number
  jokerCount?: number
  roundDuration?: number         // ms
  voteDuration?: number          // ms
  players/{uid}
    name: string
    online: boolean
    joinedAt: number
    lastOfflineAt?: number
  round?
    roundId?: string             // ใช้กัน private data ของรอบเก่าหลุดมาแสดง
    startedAt: number
    duration: number
    endsAt: number
    voteEndsAt?: number
  votes/{voterUid}
    targetUid: string | null     // null = skip vote
    votedAt: number
  result?
    winner: "players" | "spy" | "joker"
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
```

ข้อมูลลับไม่อยู่ใต้ `rooms/{roomId}` เพราะ Realtime Database rules ที่ parent เปิดอ่านแล้วไม่สามารถ revoke ด้วย child rule ได้ ดังนั้น `roomPrivate/{roomId}/{uid}` ต้องอ่านได้เฉพาะเจ้าของ uid เท่านั้น

Presence state:

```text
presence/{roomId}/{uid}: true
```

Client ลงทะเบียน `onDisconnect()` ให้ลบ presence, set `players/{uid}/online = false` และเขียน `lastOfflineAt` อัตโนมัติเมื่อหลุดการเชื่อมต่อ

## Game Rules

- ผู้เล่นขั้นต่ำก่อนเริ่ม: `MIN_PLAYERS = 3`
- ผู้เล่นสูงสุดต่อห้อง: `MAX_PLAYERS = 8`
- Location ต้องมี roles อย่างน้อย `MIN_ROLES = 7`
- Spy count ต้องอยู่ในช่วง `1..players - 1`
- Joker count อยู่ในช่วง `0..5`
- ต้องมีผู้เล่นปกติอย่างน้อย 1 คน: `spyCount + jokerCount < players`
- Round duration: 1-15 นาที, default 8 นาที
- Vote duration: 10-120 วินาที, default 30 วินาที

Winner logic:

1. ถ้าคนที่โดนโหวตออกเป็น Joker -> `joker` ชนะ
2. ถ้าคนที่โดนโหวตออกเป็น Spy -> `players` ชนะ
3. ถ้าโหวตผิด, skip ทั้งหมด, หรือคะแนนเสมอ -> `spy` ชนะ

## Backend Endpoints

### Rooms

- `POST /api/rooms/createRoom`
  - auth required
  - input: `{ name, locationId?, spyCount?, jokerCount?, roundDuration?, voteDuration? }`
  - `locationId` และ `spyCount` ตอน create ต้องเป็น admin
  - output: `{ roomId }`

- `POST /api/rooms/joinRoom`
  - auth required
  - input: `{ roomId, name }`
  - เข้าห้องได้เฉพาะ `status = lobby`, ห้ามชื่อซ้ำ, จำกัด 8 คน
  - ถ้า uid เดิมอยู่ในห้องแล้ว จะ mark online และคืน `{ ok: true }` โดยไม่เขียนทับ `players/{uid}` เพื่อกันชื่อ/host เดิมหายจากการ join ซ้ำ

- `POST /api/rooms/leaveRoom`
  - auth required
  - ลบ player/presence/private ของตัวเอง
  - ถ้า host ออกหรือไม่เหลือใคร online จะลบห้องทั้งก้อน

- `POST /api/rooms/closeRoom`
  - host only
  - ลบ `rooms/{roomId}`, `presence/{roomId}`, `roomPrivate/{roomId}`

### Game

- `POST /api/game/startGame`
  - host only, lobby only
  - เลือก active location จาก `locationId`, `room.selectedLocationId`, หรือ random
  - ใช้ Fisher-Yates shuffle สำหรับสุ่ม spy/joker
  - สร้าง `roundId` แล้วเขียนทั้ง public round และ private role data ใน root update เดียว
  - persist `selectedLocationId`, `spyCount`, `jokerCount`, `roundDuration`, `voteDuration` เพื่อใช้ต่อในรอบถัดไป

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
  - อ่าน `roomPrivate/{roomId}` เพื่อหา spy/joker/location และเขียน public `result` + `location`

- `POST /api/game/playAgain`
  - host only
  - ล้าง `round`, `votes`, `result`, `roomPrivate/{roomId}` และ private residue ใต้ players
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

ทุก endpoint ต้องเป็น admin และ validate ผ่าน `cleanAndValidateLocation()` ยกเว้น toggle/delete ที่มี validation เฉพาะของตัวเอง
`seedLocations` เติม default locations จาก `app/lib/server/data/locations.ts` จำนวน 20 รายการแบบไม่เขียนชื่อซ้ำ และเขียนลง RTDB ด้วย multi-path update เดียว

### Admins

- `POST /api/admins/listAdmins`
- `POST /api/admins/addAdmin`
- `POST /api/admins/removeAdmin`

`removeAdmin` ลบ record ใน RTDB และลบ Firebase Auth user ใน route เดียวกัน ไม่ใช้ Database Trigger แล้ว
Client SDK อ่าน `admins` ได้เพื่อเช็กหน้า admin แต่เขียนไม่ได้ การเพิ่ม/ลบ admin ต้องทำผ่าน server endpoint หรือ Firebase Console เพื่อกัน user สมัครตัวเองเป็น admin

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
- render ตาม `room.status`: Lobby, Playing, Voting, Reveal
- ถ้า uid ปัจจุบันไม่อยู่ใน `room.players` จะ redirect กลับหน้าแรก

### `useRoom`

- public room listener: `rooms/{roomId}`
- private listener: `roomPrivate/{roomId}/{uid}`
- merge private data เข้า `room.players[uid]` และ `room.location`
- ตอน `status = playing` จะยังไม่ render role screen จนกว่า private data ของ `roundId` ปัจจุบันพร้อม เพื่อกัน role/location ว่างหรือข้อมูลรอบเก่าหลุดขึ้น UI

### `LobbyView`

- แสดง room code, players, host badge, online status
- host เปิด settings ได้
- admin host เลือก location ได้, host ทุกคนตั้ง spy/joker/time ได้
- host kick player ได้เฉพาะ lobby
- start game disabled ถ้าน้อยกว่า 3 คน

### `PlayingView`

- Countdown จาก `round.endsAt`
- แสดง card ตาม private role: Spy, Joker, หรือผู้เล่นปกติ
- host กดจบรอบก่อนเวลาได้
- timeout เรียก `endRound(roomId, "timeout")`

### `VotingView`

- Countdown จาก `round.voteEndsAt`
- โหวตผู้เล่นหรือ skip ได้
- โหวตครบทุกคน resolve อัตโนมัติ
- timeout เรียก `resolveVote(roomId)`

### `RevealView`

- แสดง sequence: voted out -> location -> spy -> joker ถ้ามี -> winner -> actions
- host กด `playAgain` เพื่อกลับ lobby ได้

## Deployment Notes

- ต้องตั้ง `FIREBASE_SERVICE_ACCOUNT_KEY` และ `NEXT_PUBLIC_FIREBASE_DATABASE_URL` บน production
- ต้องตั้ง `CRON_SECRET` สำหรับ cleanup endpoints
- ต้องสร้าง admin คนแรกใน `admins/{uid}` ผ่าน Firebase Console หรือ trusted server script ก่อนใช้งานหน้า admin
- Local emulator ใช้ `FIREBASE_DATABASE_EMULATOR_HOST` และ `FIREBASE_AUTH_EMULATOR_HOST`
- Next.js 16 ใช้ Turbopack เป็น default; ถ้า build เตือน root เพราะมี lockfile นอก repo ให้ตั้ง `turbopack.root` ใน `next.config.ts` หรือจัด workspace root ให้ชัดเจน
