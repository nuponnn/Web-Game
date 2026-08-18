# Spyfall System Flow

เอกสารนี้สรุป flow จากโค้ดปัจจุบัน โดยแยกเป็น backend Firebase Functions, Realtime Database state, และ frontend components/hooks

## ภาพรวมระบบ

เกมใช้ Firebase เป็นแกนหลัก:

- Frontend: Next.js app ใน `app/`
- Backend: Firebase Callable Functions + Database Triggers + Scheduled Function ใน `functions/src/`
- Database: Firebase Realtime Database path หลักคือ `rooms/{roomId}`, `roomPrivate/{roomId}/{uid}` (ข้อมูลลับต่อผู้เล่น) และ `presence/{roomId}/{uid}`
- Auth: ผู้เล่นต้อง login แบบ anonymous ก่อนเรียก callable functions

Flow หลักคือ:

```text
Anonymous login
  -> createRoom หรือ joinRoom
  -> lobby
  -> host เรียก startGame
  -> playing
  -> หมดเวลา หรือ host จบรอบ
  -> voting
  -> ทุกคนโหวต
  -> reveal

ลบห้อง/ไอดี (ไม่มีปุ่ม "จบเกม" แยก แต่จะถูกลบเองเมื่อ):
  -> host หลุดการเชื่อมต่อ (ปิด tab / ตัดเน็ต / refresh)
     -> onDisconnect ลบ presence -> presenceCleanup ลบ room ทันที
  -> ไม่มีผู้เล่นออนไลน์เหลือในห้อง
     -> presenceCleanup ลบ room ทันที
  -> ห้อง/ไอดีค้างเกินเวลากำหนด 6 ชม. (ถูกทิ้งไว้นานเกินไป - host ปิด tab กลางคัน ไม่เคยกลับมา)
     -> cleanupRooms วิ่งทุก 6 ชม. ลบ room + presence ค้าง
```

## Database Shape

ข้อมูลห้องอยู่ที่:

```text
rooms/{roomId}                        // public: อ่านได้ทุกคน (ไม่มีข้อมูลลับอยู่ข้างใน)
roomPrivate/{roomId}/{uid}            // private: อ่านได้เฉพาะเจ้าของ uid (ข้อมูลลับต่อผู้เล่น)
presence/{roomId}/{uid}               // client เขียน true / onDisconnect ลบออกเอง (ใช้ลบห้องอัตโนมัติ)
```

Location ถูกจัดการแบบ dynamic ผ่านเว็บ (ไม่ต้องแก้โค้ด/deploy เพื่อเพิ่ม location):

```text
locations/{locationId}    // admin เป็นคนเขียนผ่าน callable functions
  name: string            // ชื่อสถานที่
  roles: string[]         // บทบาท (ต้อง >= MIN_ROLES = MAX_PLAYERS - 1 = 7)
  active: boolean         // false = ปิดใช้ชั่วคราว ไม่ลบทิ้ง
  createdAt / createdBy / updatedAt / updatedBy

admins/{uid}                // object { email, displayName, addedAt, addedBy } = สิทธิ์ admin
                            // ใคร login ด้วย Google ที่ /admin จะสมัครได้เองทันที (rules เปิด self-write) ไม่ต้องขออนุญาต
```

ตั้ง `.indexOn: ["active"]` บน `locations` เพราะ `startGame` query เฉพาะที่ `active === true` ทุกครั้ง

> แก้บั๊ก (1): เดิม rules มี `.read` แค่ที่ `locations/$locationId` แต่ rule ของลูก **ไม่ cascade ขึ้นแม่** ทำให้อ่านลิสต์ `locations` ทั้งก้อน (ทั้งหน้า admin และ Lobby) ติด permission denied -> "location ไม่โชว์" ตอนนี้เพิ่ม `.read: "auth != null"` ที่ระดับ `locations` แล้ว
>
> แก้บั๊ก (2) — สำคัญมาก: เดิม `database.rules.json` ใส่ child rule กันข้อมูลลับ (`.read` ที่ `location`, `players/*/role`, `players/*/isSpy`) ใต้โหนด `rooms/$roomId` ที่เปิด `.read: "auth != null"` — แต่ **rules cascade แบบ shallow-over-deep: child rule ไม่อาจ revoke สิทธิ์ที่ parent ให้ได้** ทำให้ rule เหล่านั้น **ไม่มีผลจริง** (spy อ่าน location/role/isSpy ของทุกคนได้ผ่าน DevTools) วิธีแก้คือย้ายข้อมูลลับออกไปอยู่ **`roomPrivate/{roomId}/{uid}`** (path แยกต่างหาก ไม่มี parent grant -> rule `.read: "auth.uid === $uid"` ใช้ได้จริง) ส่วน `rooms/{roomId}` เหลือแต่ข้อมูล public เท่านั้น และ `location` (ชื่อ) จะถูกเขียนลง public room **เฉพาะตอน reveal** เพื่อให้ทุกคนเห็นสถานที่หลังเกมจบ

โครงสร้างหลักจาก `functions/src/lib/roomState.ts`:

```ts
// rooms/{roomId} — public (อ่านได้ทุกคนที่ login)
{
  hostUid: string,
  status: "lobby" | "playing" | "voting" | "reveal" | "ended",
  createdAt?: number,          // ServerValue.TIMESTAMP, เขียนตอน createRoom, ใช้โดย cleanupRooms
  location?: string,           // อยู่ใน public room เฉพาะตอน reveal (เขียนโดย resolveVote) ระหว่างเล่นไม่มี
  locationId?: string,         // อ้างอิง locations/{id} เผื่อ audit + ใช้หา name ตอน reveal
  selectedLocationId?: string, // admin ตั้งไว้ตอนสร้างห้อง (ก่อน start ยังแก้ได้ใน Lobby)
  spyCount?: number,           // จำนวน spy ที่ host กำหนด (default 1)
  jokerCount?: number,         // จำนวน joker ที่ host กำหนด (default 0, ช่วง 0-5)
  roundDuration?: number,      // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที, ช่วง 1-15 นาที)
  voteDuration?: number,       // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที, ช่วง 10-120 วินาที)
  players: {
    [uid]: {
      name: string,
      online: boolean,
      joinedAt: number
      // ไม่มี isSpy/isJoker/role อยู่ที่นี่อีกแล้ว (ย้ายไป roomPrivate กัน spy อ่านผ่าน DevTools)
    }
  },
  round?: {
    startedAt: number,
    duration: number,        // ค่า roundDuration ที่ใช้จริงในรอบนี้
    endsAt: number,
    voteEndsAt?: number      // เวลาสิ้นสุดโหวต (คำนวณจาก voteDuration)
  },
  votes?: {
    [voterUid]: { targetUid: string | null, votedAt }   // targetUid = null = skip vote (ไม่โหวต)
  },
  result?: {
    winner: "players" | "spy" | "joker",
    spyUids: string[],     // spy มีได้หลายคน (host/admin กำหนด spyCount ได้)
    jokerUids: string[],   // joker มีได้หลายคน (host กำหนด jokerCount ได้, ช่วง 0-5)
    votedOutUid: string | null
  }
}

// roomPrivate/{roomId}/{uid} — private (rules: .read "auth != null && $uid === auth.uid", .write: false)
// เขียนโดย startGame (Admin SDK) ลบตอน playAgain / kickPlayer / cleanupRooms
{
  isSpy?: boolean,       // spy = true
  isJoker?: boolean,     // joker = true
  role?: string,         // เฉพาะผู้เล่นปกติ (spy/joker ไม่มี role)
  location?: string      // ชื่อสถานที่ — spy ไม่ได้ (ไม่มี key นี้); joker/ผู้เล่นปกติมี
}
```

## Backend Functions

### `createRoom`

ไฟล์: `functions/src/rooms/createRoom.ts`

หน้าที่:

- ต้องมี `request.auth.uid`
- รับ `name`
- **admin เท่านั้น** ส่งตัวเลือกเพิ่มเติมได้: `locationId` (เลือกสถานที่ให้ห้อง) และ `spyCount` (จำนวน spy 1..MAX_PLAYERS-1) — ตรวจว่า location นั้น active จริง และเช็ค admin (`assertIsAdmin`) ก่อน; เก็บลงห้องเป็น `selectedLocationId` / `spyCount`
- **host ทุกคน** กำหนดเวลาได้: `roundDuration` (เวลาหา spy, ms, ช่วง 1-15 นาที), `voteDuration` (เวลาโหวต, ms, ช่วง 10-120 วินาที), และ `jokerCount` (จำนวน joker, 0-5 คน)
- ผู้เล่นธรรมดาไม่ส่งตัวเลือก -> ห้องจะสุ่ม location / spy 1 คน / joker 0 คน / เวลา 8 นาที / โหวต 30 วินาที ตอน start
- สุ่ม `roomId` 4 ตัว เช่น `A7KQ`
- สร้างห้องใหม่ที่ `rooms/{roomId}`
- ตั้งคนสร้างเป็น `hostUid`
- เพิ่ม host เข้า `players`
- ตั้ง `status: "lobby"`

Input:

```ts
{ name: string, locationId?: string, spyCount?: number, jokerCount?: number, roundDuration?: number, voteDuration?: number }
```

Output:

```ts
{ roomId: string }
```

### `joinRoom`

ไฟล์: `functions/src/rooms/joinRoom.ts`

หน้าที่:

- ต้อง login แล้ว
- รับ `roomId` และ `name`
- เข้าได้เฉพาะห้องที่ `status: "lobby"`
- จำกัดผู้เล่นสูงสุด 8 คน
- ห้ามชื่อซ้ำในห้องเดียวกัน
- เพิ่มผู้เล่นเข้า `rooms/{roomId}/players/{uid}`

Input:

```ts
{ roomId: string, name: string }
```

Output:

```ts
{ ok: true }
```

### `startGame`

ไฟล์: `functions/src/game/startGame.ts`

หน้าที่:

- เรียกได้เฉพาะ host
- เรียกได้เฉพาะตอน `status: "lobby"`
- ต้องมีผู้เล่นอย่างน้อย 3 คน
- ใช้สถานที่จาก **database** (`locations` ที่ `active === true`) — ไม่ได้ใช้ static file `functions/src/data/locations.ts` แล้ว (ไฟล์นั้นเก็บไว้เป็น backup + สำหรับ migration script)
- ใช้ `locationId` ที่ host ส่งตอน start (จาก LobbyView) หรือ `room.selectedLocationId` -> ใช้ตัวนั้น; ไม่ระบุ -> สุ่มจาก active ทั้งหมด (ถ้าเลือกตัวที่ถูกปิด/ไม่มีอยู่ -> error ชัดเจน)
- จำนวน spy = `spyCount` ที่ส่งตอน start (จาก LobbyView) -> default 1; ตรวจว่า 1..(จำนวนผู้เล่น - 1) (ต้องเหลือคนปกติอย่างน้อย 1 คน)
- จำนวน joker = `jokerCount` ที่ส่งตอน start (จาก LobbyView) -> default 0; จำกัด 0-5 คน; ตรวจว่า spy + joker < จำนวนผู้เล่น (ต้องเหลือคนปกติอย่างน้อย 1 คน)
- ระยะเวลาหา spy = `roundDuration` ที่ส่งตอน start (จาก LobbyView) -> default 8 นาที; จำกัดช่วง 1-15 นาที
- ระยะเวลาโหวต = `voteDuration` ที่ส่งตอน start (จาก LobbyView) -> default 30 วินาที; จำกัดช่วง 10-120 วินาที
- สุ่ม spy ตามจำนวนที่กำหนด (ไม่ซ้ำกัน) -> สุ่ม joker จากคนที่ไม่ใช่ spy (ไม่ซ้ำกัน) -> แจก role ให้คนที่ไม่ใช่ทั้งคู่
- ตั้ง `status: "playing"`
- ตั้ง `round.startedAt`, `round.duration` (จาก roundDuration), `round.endsAt`
- เก็บ `roundDuration` และ `voteDuration` ไว้ในห้อง เพื่อให้ round ถัดไป (playAgain) ใช้ค่าเดิมได้
- เก็บ `locationId` (อ้างอิง) ไว้ในห้อง public; **`location` (ชื่อ) ไม่เขียนลง public room ระหว่างเล่น** (จะเขียนตอน reveal เท่านั้น)
- **เขียนข้อมูลลับต่อผู้เล่นที่ `roomPrivate/{roomId}/{uid}`** (เขียนพร้อม public room ใน root `update()` เดียวกันให้ atomic):
  - spy: `{ isSpy: true, isJoker: false }` (ไม่มี location/role)
  - joker: `{ isSpy: false, isJoker: true, location }` (เห็นสถานที่ แต่ไม่มี role)
  - ผู้เล่นปกติ: `{ isSpy: false, isJoker: false, role, location }`
- เคลียร์ `players/{uid}/isSpy|isJoker|role` ที่ค้างจากรอบก่อน (เผื่อมี residue เก่า) + ล้าง `votes` และ `result`
- เขียน public room + private data ใน root update เดียว (`db.ref().update(...)`) — path ต้องเป็น path เต็มจาก root

Input:

```ts
{ roomId: string, locationId?: string, spyCount?: number, jokerCount?: number, roundDuration?: number, voteDuration?: number }
```

Output:

```ts
{ ok: true, endsAt: number, spyCount: number, jokerCount: number, roundDuration: number, voteDuration: number }
```

หมายเหตุ: ข้อมูลลับต้องแยกไป `roomPrivate` เพราะ rules cascade ทำให้ child rule ใต้ `rooms/{roomId}` ที่เปิดอ่านทุกคนกันข้อมูลลับไม่ได้ (ดูหัวข้อ Database Shape)

### `endRound`

ไฟล์: `functions/src/game/endRound.ts`

หน้าที่:

- เรียกได้เฉพาะผู้เล่นในห้อง
- เรียกได้เฉพาะตอน `status: "playing"`
- ถ้า `reason: "host_ended"` ต้องเป็น host
- ถ้า `reason: "timeout"` server จะเช็คว่าเวลาหมดจริงจาก `round.endsAt`
- เปลี่ยนห้องเป็น `status: "voting"`
- ตั้ง `round.voteEndsAt` โดยคำนวณจาก `room.voteDuration` (เวลาโหวตที่ host กำหนด) หรือ default 30 วินาที

Input:

```ts
{ roomId: string, reason?: "timeout" | "host_ended" }
```

Output:

```ts
{ ok: true, voteEndsAt: number }
```

### `resolveVote` ( callable + helper)

ไฟล์: `functions/src/game/resolveVote.ts` (callable) + `functions/src/game/castVote.ts` (helper logic)

มี 2 ส่วน:

**1. Helper `resolveVote()` ใน `castVote.ts`** — logic หลักที่นับคะแนนและตัดสินผล:

- นับคะแนนจาก `votes` (ข้าม skip vote ที่ `targetUid` เป็น null)
- คนที่โดนโหวตสูงสุดคือคนที่ถูกเลือก
- ถ้าคะแนนเสมอ ถือว่าจับไม่ได้ `votedOutUid = null`
- ตัดสินผลตาม role ของคนที่โดนโหวต:
  - ถ้า `votedOutUid` เป็น **joker** -> **joker ชนะ** (joker ต้องการโดนโหวตออก)
  - ถ้า `votedOutUid` เป็น **spy** -> **ผู้เล่นชนะ**
  - ถ้าไม่ใช่ทั้งคู่ หรือเสมอ -> **spy ชนะ**
- อ่าน `roomPrivate/{roomId}` เพื่อหา `spyUids`/`jokerUids` (isSpy/isJoker ไม่ได้อยู่ใน public room แล้ว) + หาชื่อสถานที่จาก private ของคนที่ไม่ใช่ spy
- ตั้ง `status: "reveal"`
- เขียน `result` (มี `winner`, `spyUids`, `jokerUids`, `votedOutUid`) **และเขียน `location` ลง public room** — เกมจบแล้ว ทุกคน (รวม spy) ควรเห็นสถานที่
- ถูกเรียกจาก `castVote` (เมื่อโหวตครบทุกคน) และจาก callable `resolveVote` (เมื่อหมดเวลา)

**2. Callable `resolveVote` ใน `resolveVote.ts`** — เรียกจาก client เมื่อหมดเวลาโหวต:

- เรียกได้เฉพาะผู้เล่นในห้อง
- เรียกได้เฉพาะตอน `status: "voting"`
- ต้องหมดเวลาโหวต (`serverNow >= voteEndsAt`) หรือโหวตครบทุกคนแล้วเท่านั้น (กันกดข้ามขั้นตอน)
- เรียก helper `resolveVote()` จาก `castVote.ts` เพื่อตัดสินผลโหวต
- ใช้ตอนหมดเวลาโหวตจาก Countdown ฝั่ง client

### `castVote`

ไฟล์: `functions/src/game/castVote.ts`

หน้าที่:

- เรียกได้เฉพาะผู้เล่นในห้อง
- เรียกได้เฉพาะตอน `status: "voting"`
- รับ `targetUid` (string | null) — null = skip vote (ไม่โหวตใคร)
- ห้ามโหวตคนที่ไม่ได้อยู่ในห้อง (เฉพาะเมื่อ targetUid ไม่ใช่ null)
- **เปลี่ยนโหวตได้** — เขียนทับค่าเดิมแทนการ block (ไม่ใช่ transaction ห้ามซ้ำอีกต่อไป)
- โหวตตัวเองได้ (ไม่มี filter กัน)
- ถ้าโหวตครบทุกคน (รวม skip) จะเรียก helper `resolveVote()` อัตโนมัติ

Input:

```ts
{ roomId: string, targetUid: string | null }
```

Output:

```ts
{ ok: true, votesSoFar: number, totalPlayers: number }
```

### `playAgain`

ไฟล์: `functions/src/game/playAgain.ts`

Callable — ให้ host กด "เล่นรอบใหม่" หลังจบเกม โดยไม่ต้องสร้างห้องใหม่

หน้าที่:

- ตรวจว่าเป็น host เท่านั้น
- ลบ `roomPrivate/{roomId}` ทั้งก้อน (ข้อมูลลับของรอบที่แล้ว) + เคลียร์ `players/{uid}/isSpy|isJoker|role` ที่ค้าง + `round`/`votes`/`result`
- ตั้ง `status: "lobby"` -> RoomPage สลับไปแสดง LobbyView ให้อัตโนมัติ
- **ไม่ได้ล้าง** ผู้เล่น + `selectedLocationId`/`spyCount`/`jokerCount`/`roundDuration`/`voteDuration` — ค่าเหล่านี้คงอยู่เพราะไม่ได้ถูก clear (implicit preservation) ทำให้ Lobby มี state พร้อมเริ่มรอบใหม่ทันที

### `kickPlayer`

ไฟล์: `functions/src/game/kickPlayer.ts`

Callable — ให้ host เตะผู้เล่นออกจากห้อง (ใช้ได้เฉพาะตอน `status: "lobby"` เท่านั้น)

หน้าที่:

- ตรวจว่าเป็น host เท่านั้น
- ตรวจว่า status === "lobby" (เตะได้เฉพาะตอนอยู่ในล็อบบี้ ตอนเกมกำลังเล่นเตะไม่ได้)
- ห้ามเตะตัวเอง
- ลบผู้เล่นเป้าหมายออกจาก `players/{targetUid}`
- ลบ `presence/{roomId}/{targetUid}` ด้วย (กัน presence ค้าง)
- ลบ `roomPrivate/{roomId}/{targetUid}` ด้วย (ข้อมูลลับของคนที่โดนเตะไม่ควรค้างอยู่)

Input:

```ts
{ roomId: string, targetUid: string }
```

Output:

```ts
{ ok: true, kickedName: string }
```

### `presenceCleanup`

ไฟล์: `functions/src/rooms/presenceCleanup.ts`

เป็น **Database Trigger** (`onValueWritten`) บน path `presence/{roomId}/{uid}` ที่ client เป็นคนเขียน ไม่ใช่ callable

หน้าที่:

- ฟังทุกครั้งที่ value ของ presence เปลี่ยน (เขียนหรือถูกลบ)
- ถ้า `after` มีค่า (ผู้เล่นเพิ่งเชื่อมต่อ) -> เขียน `players/{uid}/online = true`
- ถ้า `after` เป็น null (ผู้เล่นหลุด — onDisconnect ของ client ลบให้):
  - `uid === hostUid` -> **ลบ room ทั้งห้อง** เพราะไม่มี host คุมเกมต่อ
  - ไม่ใช่ host -> เขียน `online = false` แล้วเช็คว่าถ้าไม่มีใคร online เหลือเลย -> ลบ room ทิ้ง
- ลบผ่าน admin SDK (รองรับการเขียนแม้ rules จะ `.write: false`)

หมายเหตุ: host กด refresh หน้า (แค่โหลดใหม่ ไม่ได้ปิดจริง) จะโดนลบห้องทันทีเหมือนกัน เพราะ onDisconnect ยิงทริกเกอร์ก่อนหน้าใหม่จะ reconnect

### `cleanupRooms`

ไฟล์: `functions/src/rooms/cleanupRooms.ts`

เป็น **Scheduled Function** (`onSchedule`) วิ่งทุก 6 ชั่วโมง (timezone `Asia/Bangkok`)

หน้าที่:

- อ่าน `rooms/` ทั้งหมด ลบห้อง/ไอดีที่ `createdAt` เก่ากว่า **6 ชม.** (จาก `MAX_ROOM_AGE_MS`) หรือไม่มี `createdAt` ทิ้ง — กันห้องที่ถูกทิ้งไว้นานเกินกำหนด (หลุดเกิน 6 ชม.) ไม่มีวันถูกลบ
- ลบ `presence/{roomId}` ค้างของห้องที่ไม่มีอยู่แล้ว (ป้องกันขยะที่ค้างตอน room ถูกลบไปก่อน)
- ลบ `roomPrivate/{roomId}` ค้างของห้องที่ไม่มีอยู่แล้วด้วย (ข้อมูลลับไม่ควรค้าง)
- ครอบกรณี host ปิด tab กลางคันก่อนจบเกม ไม่กลับมาลบ (กรณี host หลุดแบบปกติจะถูกลบทันทีผ่าน `presenceCleanup` อยู่แล้ว อันนี้เป็น safety net)

หมายเหตุ: `onSchedule` ต้องใช้โปรเจกต์แบบ Blaze (มี billing) ถึง deploy จริงได้ ใน emulator รันผ่าน emulator "tasks" (port 9499 ใน firebase.json)

### `cleanupAuthUsers` (ล้าง user ใน Auth ที่ไม่ใช้แล้ว กัน auth รก)

ไฟล์: `functions/src/auth/cleanupAuthUsers.ts`

เป็น **Scheduled Function** (`onSchedule`) วิ่งทุก **24 ชั่วโมง** (timezone `Asia/Bangkok`)

หน้าที่: วน list user ทั้งหมดใน Firebase Auth แล้วลบคนที่เข้าเกณฑ์ "ไม่ใช้งาน":

- เป็น user แบบ **anonymous** (ไม่มี provider) ที่สร้างมาเกิน **24 ชม.** (`metadata.creationTime`)
- ลบแบบ batch (1000 คน/batch) ผ่าน `auth.deleteUsers`

โดยมากคือบัญชี anonymous ของผู้เล่นที่เข้ามาเล่นครั้งเดียวแล้วหายไป (auth จะได้ไม่รก)

> หมายเหตุ: ต่างจากเดิมที่เคยเช็คหลายเงื่อนไข (ไม่ได้ sign-in, ไม่อยู่ในห้อง, ไม่ใช่ admin) ตอนนี้เหลือแค่เช็ค anonymous + age > 24 ชม. เพราะ admin ถูกลบผ่าน trigger `adminRemoved` อยู่แล้ว ส่วนผู้เล่นที่ยังอยู่ในห้องจะถูก cleanup ผ่าน presence system

### `cleanupAuthUsersTest` (HTTP trigger สำหรับทดสอบ cleanup auth)

ไฟล์: `functions/src/auth/cleanupAuthUsers.ts` (export เดียวกับ cleanupAuthUsers)

เป็น **HTTP Function** (`onRequest`) สำหรับทดสอบระบบ cleanup auth โดยไม่ต้องรอ 24 ชม.

หน้าที่:
- รับ `cutoffSeconds` จาก query parameter (default = 10 วินาที)
- เรียก `cleanup(cutoffMs)` เหมือน scheduled version
- คืน JSON `{ ok: true, deleted: number, cutoffSeconds: number }`

วิธีใช้:

```bash
# ลบ users ที่ไม่มีข้อมูลมาเกิน 10 วินาที (default)
curl "http://localhost:5001/<project-id>/us-central1/cleanupAuthUsersTest"

# กำหนด cutoff เอง เช่น 60 วินาที
curl "http://localhost:5001/<project-id>/us-central1/cleanupAuthUsersTest?cutoffSeconds=60"
```

เปลี่ยน `<project-id>` เป็น project ID จาก `.firebaserc`

### Test Scripts (functions/scripts/)

| ไฟล์ | หน้าที่ |
|-------|---------|
| `testCleanupAuth.js` | Node script ทดสอบ cleanup auth ตรงกับ emulator ผ่าน Admin SDK |
| `testCleanupAuthEmulator.sh` | Shell script ทดสอบผ่าน HTTP endpoint ของ emulator |
| `testCleanupAuthFull.sh` | Shell script ทดสอบ comprehensive (สร้าง user ทดสอบ + verify ผลลัพธ์) |

### `addLocation` / `updateLocation` / `toggleLocationActive` / `deleteLocation` / `seedLocations` (ระบบ Location แบบ Dynamic)

ไฟล์: `functions/src/locations/`

ทุก function เช็ค `assertIsAdmin(uid)` (ดู `admins/{uid}`) ฝั่ง server ไม่เชื่อ client และเช็คผ่าน rules อีกชั้นด้วย

- `addLocation` — รับ `{ name, roles }` -> validate (roles >= 7 = `MAX_PLAYERS - 1`, ห้าม role ซ้ำ, ห้ามชื่อซ้ำกับที่มีอยู่) -> เขียน `locations/{pushId}` พร้อม `active: true`
- `updateLocation` — รับ `{ locationId, name, roles }` -> validate เหมือน add (กันชื่อซ้ำ เว้นตัวมันเอง) -> อัปเดต
- `toggleLocationActive` — รับ `{ locationId }` -> flip `active` แทนการลบจริง (กันห้องที่กำลังเล่นอ้างอิง location ที่ถูกลบไปแล้วพัง)
- `deleteLocation` — รับ `{ locationId }` -> ลบแบบถาวร (ใช้เมื่อแน่ใจว่าไม่มีห้องอ้างอิงอยู่)
- `seedLocations` — เติม location พื้นฐานจาก `data/locations.ts` (ข้ามชื่อที่ซ้ำ รันซ้ำได้) ใช้ตอนตั้งค่าระบบครั้งแรก

### `listAdmins` / `addAdmin` / `removeAdmin` (จัดการ admin user)

ไฟล์: `functions/src/admins/`

- `listAdmins` — คืน list admin ทั้งหมด (อ่านผ่าน admin SDK เพราะ rules ปิดไม่ให้ client list)
- `addAdmin` — รับ `{ uid }` -> ตรวจว่า user มีอยู่จริงใน Auth (ดึง email/displayName มาบันทึก) -> เขียน `admins/{uid}`
- `removeAdmin` — รับ `{ uid }` -> ลบ `admins/{uid}` ใน RTDB เท่านั้น (ไม่ลบ auth มือ); user ใน Firebase Auth จะถูกลบอัตโนมัติโดย trigger `adminRemoved` ต่อไป; ห้ามลบตัวเอง

trigger อัตโนมัติ `functions/src/admins/adminRemoved.ts` — ใช้ `onValueDeleted` ฟัง `admins/{uid}` โดนลบ (ใคร "หลุด" จาก admin ไม่ว่าด้วยวิธีไหน) -> ลบ user ใน Firebase Auth ให้อัตโนมัติ (silent ignore `auth/user-not-found` error กรณี user ถูกลบไปแล้ว)

โครงสร้าง `admins/{uid}` ตอนนี้เป็น object: `{ email, displayName, addedAt, addedBy }` (ตรวจสิทธิ์ใน `assertIsAdmin` ใช้ `.exists()` ไม่ใช่ค่า `true` แล้ว)

> หมายเหตุ: ตั้งแต่ที่ใคร login ด้วย Google ก็สมัครเป็น admin เองได้ (self-register ที่หน้า `/admin`) function กลุ่มนี้จึงเป็นตัวช่วยจัดการเท่านั้น ไม่ใช่ช่องทางหลักอีกต่อไป

constants กลางอยู่ที่ `functions/src/lib/constants.ts` (`MAX_PLAYERS`, `MIN_PLAYERS`, `MIN_ROLES = MAX_PLAYERS - 1`)

## ระบบ Role: Spy vs Joker

เกมมี 3 ฝ่าย:

**ผู้เล่นปกติ (Townsfolk)**
- เห็นสถานที่ + บทบาท
- ชนะเมื่อโหวต spy ออกได้
- แพ้ถ้าโหวตผิดคน หรือเสมอ

**Spy**
- ไม่เห็นสถานที่ (ต้องเดา)
- ชนะเมื่อผู้เล่นปกติโดนโหวตออก หรือคะแนนเสมอ
- แพ้เมื่อโดนโหวตออก

**Joker** (Host กำหนด 0-5 คน)
- เห็นสถานที่ เหมือนผู้เล่นปกติ แต่ **ไม่มีบทบาท** (role)
- **ชนะเมื่อโดนโหวตออก** (ต้องทำตัวให้น่าสงสัยจนโดนโหวต)
- ไม่ได้เป็นทีมเดียวกับ spy (spy ชนะไม่ได้ประโยชน์จาก joker)

เงื่อนไขการตัดสินผลโหวต (เรียงลำดับความสำคัญ):
1. ถ้า votedOutUid เป็น **joker** -> **joker ชนะ**
2. ถ้า votedOutUid เป็น **spy** -> **ผู้เล่นชนะ**
3. ถ้าไม่ใช่ทั้งคู่ หรือเสมอ -> **spy ชนะ**

ข้อจำกัด: `spyCount + jokerCount < จำนวนผู้เล่น` (ต้องเหลือคนปกติอย่างน้อย 1 คน)

script ย้ายข้อมูลเก่า: `functions/scripts/migrateLocations.js` (รันครั้งเดียว อ่าน `LOCATIONS` จาก `functions/src/data/locations.ts` -> เขียนเข้า database)

## Frontend ปัจจุบัน

### `app/layout.tsx`

Root layout ของ Next.js:
- ครอบ children ด้วย `AuthProvider` (จาก `useAuth.tsx`)
- ใช้ Inter font (จาก next/font/google)
- metadata: title "Spyfall", description "Find the spy among you"
- ใช้ Tailwind CSS v4 พร้อม custom theme tokens ใน `globals.css`

### `app/globals.css`

Tailwind CSS v4 config แบบ CSS-first:
- `@theme` tokens: bg (#FAFAFA), surface (#FFFFFF), accent (Indigo #4F46E5), text (#111827), danger, success, warning
- Radius tokens: sm (8px), md (12px), lg (16px)
- CSS animations: spotlight-in, spotlight-out, settle-in (สำหรับ Reveal)
- `prefers-reduced-motion` support

### `app/lib/firebase.js`

Firebase singleton init:
- สร้าง Firebase app, auth, rldb, functions instances
- ถ้ารันบน localhost จะ auto-connect emulators อัตโนมัติ

### `app/lib/useAuth.tsx`

Firebase Auth context + hook:
- `AuthProvider` — auto anonymous sign-in ตอน mount, session persistence ใน dev mode
- `useAuth()` — คืน `{ user, loading }` จาก context

### `app/lib/gameFunction.ts`

Client wrappers สำหรับ game callables ทั้งหมด:
- `createRoom`, `joinRoom`, `startGame`, `endRound`, `castVote`, `resolveVote`, `playAgain`, `kickPlayer`
- แต่ละตัวเรียก `httpsCallable` จาก Firebase Functions

### `app/lib/adminFunctions.ts`

Client wrappers สำหรับ admin callables:
- `listAdmins`, `addAdmin`, `removeAdmin`, `addLocation`, `updateLocation`, `toggleLocationActive`, `deleteLocation`, `seedLocations`

### `app/page.tsx` (Home)

Flow ใหม่ — ชื่อก่อน แล้วเลือก Create/Join:

1. แสดงช่องกรอกชื่อ (name)
2. แสดง 2 ปุ่ม: "สร้างห้อง" และ "เข้าร่วมห้อง"
3. กด "สร้างห้อง" → call `createRoom({ name })` → navigate ไป `/room/{roomId}`
4. กด "เข้าร่วมห้อง" → แสดงช่องกรอกรหัสห้อง (roomId) + ปุ่ม "เข้าร่วม" + ปุ่ม "กลับ"
   - กด "เข้าร่วม" → call `joinRoom({ roomId, name })` → navigate ไป `/room/{roomId}`
5. มีลิงก์ **Admin** ไป `/admin` ที่ด้านล่าง

ไม่มี game settings บนหน้านี้อีกแล้ว (ย้ายไป Lobby)

### `app/admin/page.tsx` / `app/admin/locations/page.tsx` / `app/admin/users/page.tsx`

ระบบจัดการฝั่ง admin (ใช้ Tailwind styling):
- `/admin` — admin login แยกจากผู้เล่น: ผู้เล่นทั่วไปเป็น anonymous แต่ admin ต้อง **Google Sign-In** แล้วระบบจะ**สมัครสิทธิ์ admin ให้เองทันที**; ถ้าเป็น admin -> เห็น hub ลิงก์ไปจัดการ Location และจัดการ Admin
- `/admin/locations` — กันเฉพาะ admin: ฟอร์มเพิ่ม location (ชื่อ + roles dynamic list), ลิสต์ location ทั้งหมดแบบ card layout, ปุ่มเปิด/ปิด, แก้ไข, ลบถาวร (ยืนยันก่อน), ปุ่ม Seed ข้อมูลพื้นฐาน
- `/admin/users` — กันเฉพาะ admin: ลิสต์ admin ทั้งหมดแบบ card layout, เพิ่ม admin (กรอก uid), ถอดสิทธิ์ (ยืนยันก่อนลบ)
- wrapper callable อยู่ที่ `app/lib/adminFunctions.ts`

### `app/room/[roomId]/page.tsx`

เป็นหน้าหลักของเกม:
- `useRoom(roomId, user?.uid)` subscribe `rooms/{roomId}` (public) + `roomPrivate/{roomId}/{uid}` (ของตัวเอง) แล้ว merge ให้ View ใช้เหมือนเดิม
- `useAuth()` หา uid ปัจจุบัน
- `usePresence(roomId, uid, !!room)` แจ้งออนไลน์ (จุดชนวนลบห้องอัตโนมัติ)
- render ตาม `room.status`: `LobbyView` / `PlayingView` / `VotingView` / `RevealView`
- ถ้า `room` เป็น null -> แสดง "ไม่พบห้องนี้" + ปุ่ม **กลับหน้าแรก**
- ถ้าผู้เล่นถูกเตะ -> redirect กลับหน้าแรกผ่าน `useEffect`

### `app/room/[roomId]/LobbyView.tsx`

แสดงในหน้า lobby (ใช้ Tailwind styling):
- แสดงรหัสห้อง (roomId) ที่ด้านบน
- **รายชื่อผู้เล่น** พร้อม online/offline indicator (จุดสีเขียว=online, สีเทา=offline)
  - แต่ละคนแสดง: ชื่อ, host badge (ถ้าเป็น host), "(คุณ)" (ถ้าเป็นตัวเอง)
  - Host เห็นปุ่ม "x" สำหรับเตะผู้เล่นคนอื่น
- **Location Info** (ถ้าเลือก location ไว้) — แสดงชื่อสถานที่ + roles ทั้งหมด
- **Host Settings** — ปุ่ม "ตั้งค่าเกม" สำหรับ host เท่านั้น:
  - Location select (admin host เท่านั้น)
  - Spy count (1-7)
  - Joker count (0-5)
  - Spy time (1-15 นาที)
  - Vote time (10-120 วินาที)
- **ปุ่ม Start Game** (host) — ต้องมีอย่างน้อย 3 คน
- **รอ host** (คนอื่น) — แสดง loading dots

### `app/room/[roomId]/PlayingView.tsx`

แสดงในหน้า playing (ใช้ Tailwind styling):
- **Countdown** — แสดงเวลาถอยหลัง (Countdown component)
- **Role Card** ตามสถานะ:
  - Spy: icon 🕵️ + "คุณคือ Spy" + คำอธิบาย
  - Joker: icon 🃏 + "คุณคือ Joker" + แสดง location
  - Townsfolk: icon 👤 + "คุณคือคนท้องถิ่น" + แสดง location + role
- **Host End Button** — ปุ่ม "จบ Round" สำหรับ host

### `app/room/[roomId]/VotingView.tsx`

แสดงในหน้า voting (ใช้ Tailwind styling):
- **หัวข้อ** "ใครคือ Spy?"
- **Countdown** — แสดงเวลาถอยหลังโหวต
- **Vote count** — "โหวตแล้ว X / Y"
- **รายชื่อผู้เล่น** แต่ละคนมี:
  - ชื่อ + "(คุณ)" + "host" badge
  - ปุ่ม "โหวต" / "เปลี่ยน" (เมื่อเลือกแล้ว) — เลือกแล้วจะมี border สี accent
  - Online indicator (จุดสีเขียว/เทา)
- **ปุ่ม "ไม่โหวต"** (skip) — เมื่อเลือกแล้วจะมี border สี accent

### `app/room/[roomId]/RevealView.tsx`

แสดงในหน้า reveal — มี **animated spotlight reveal** (ใช้ Tailwind + CSS animations):

**Sequence:**
1. **0-2.5s**: ผลโหวต — แสดงใหญ่กลางจอ (ใครโดนโหวตออก)
2. **2.5-5s**: สถานที่ — แสดงใหญ่กลางจอ
3. **5-7.5s**: Spy — แสดงใหญ่กลางจอ + icon 🕵️
4. **7.5-10s**: Joker (ถ้ามี) — แสดงใหญ่กลางจอ + icon 🃏
5. **10-12s**: ผู้ชนะ — pop ขึ้นมา + pulse glow
6. **12s+**: ปุ่ม "เล่นรอบใหม่" + "กลับหน้าแรก" (host) / รอ host (คนอื่น)

**Effect:**
- Spotlight card ขยายใหญ่กลางจอ + blur → focus
- พอหมดเวลา → fade out เล็กลง
- Card เล็กๆ ปรากฏ list ด้านบน (สะสมไปเรื่อยๆ)
- รองรับ `prefers-reduced-motion`

### `app/components/Countdown.tsx`

Reusable countdown timer:
- รับ `endsAt` (timestamp)
- ใช้ `useServerTimeOffset()` เพื่อเทียบเวลา client กับ Firebase server
- แสดงเวลาถอยหลัง (format: M:SS)
- เรียก `onExpire()` หนึ่งครั้งเมื่อหมดเวลา
- แสดง "หมดเวลา!" สีแดงเมื่อ expire

### `app/lib/useRoom.ts`

 subscribe Realtime Database:
- คืน `{ room, loading }` โดย `room` type เป็น `Room | null`
- merge ข้อมูลลับของตัวเองเข้า `room`: `players[uid].isSpy/isJoker/role` + `room.location`
- `loading` จะเป็น `true` จนกว่าจะได้ทั้ง public room และ private

### `app/lib/usePresence.ts`

ระบบ online/offline:
- ตอนเข้า room page เขียน `presence/{roomId}/{uid} = true`
- สั่ง `onDisconnect().remove()` เพื่อให้ server ลบ presence อัตโนมัติ
- ตอน unmount ยกเลิก onDisconnect + ลบ presence

### `app/lib/useServerTime.ts`

เวลา server:
- อ่าน `.info/serverTimeOffset`
- คืน offset สำหรับคำนวณ server time

## Flow หน้าจอที่ควรมี

### 1. Auth Gate

```text
เปิดเว็บ
  -> ถ้ายังไม่มี user
    -> signInAnonymously
  -> ได้ uid แล้วค่อยเข้า Home/Lobby
```

### 2. Home

```text
กรอกชื่อ
  -> เลือกเวลาหา Spy (1-15 นาที, default 8) - ทุกคนกำหนดได้
  -> เลือกเวลาโหวต (10-120 วินาที, default 30) - ทุกคนกำหนดได้
  -> เลือกจำนวน Joker (0-5 คน, default 0) - ทุกคนกำหนดได้
  -> (admin เท่านั้น) เลือกสถานที่ + จำนวน Spy
  -> ปุ่ม Create Room
    -> call createRoom({ name, roundDuration?, voteDuration?, jokerCount?, locationId?, spyCount? })
    -> ได้ roomId
    -> navigate ไป /room/{roomId}

หรือ

กรอกชื่อ + roomId
  -> ปุ่ม Join Room
    -> call joinRoom({ roomId, name })
    -> navigate ไป /room/{roomId}
```

### 3. Lobby

```text
/room/{roomId}
  -> useRoom(roomId)
  -> status === "lobby"
  -> แสดงรายชื่อ players
  -> ถ้ามี selectedLocationId -> subscribe locations/{id} แสดง Roles ของสถานที่ให้ทุกคนเห็น
     (ถ้าสุ่ม = ไม่แสดง Roles)
  -> ถ้า current uid === hostUid
    -> แต่ละคนมีปุ่ม "เตะ" (ยกเว้นตัวเอง)
       -> call kickPlayer({ roomId, targetUid })
    -> ถ้า host เป็น admin (อยู่ใน admins/{uid}): แสดง select ให้เลือก location
       ที่จะเล่นให้ห้องนี้ได้ (จาก locations ที่ active) ไม่เลือก = สุ่ม
    -> แสดง select จำนวน Spy (1-7) - host ทุกคนกำหนดได้
    -> แสดง select จำนวน Joker (0-5) - host ทุกคนกำหนดได้
    -> แสดง select เวลาหา Spy (1-15 นาที, default 8) - host ทุกคนกำหนดได้
    -> แสดง select เวลาโหวต (10-120 วินาที, default 30) - host ทุกคนกำหนดได้
    -> แสดงปุ่ม Start Game
    -> call startGame({ roomId, locationId?, spyCount?, jokerCount?, roundDuration?, voteDuration? })
  -> คนอื่นรอ host
```

### 4. Playing

```text
status === "playing"
  -> แสดง Countdown(round.endsAt)
  -> แสดงข้อมูลตาม role
    -> ถ้า isSpy === true: แสดงว่า "คุณคือ Spy" (ไม่เห็นสถานที่)
    -> ถ้า isJoker === true: แสดงว่า "คุณคือ Joker" + แสดงสถานที่ (ไม่มีบทบาท — เป้าหมาย: ต้องโดนโหวตออก)
    -> ถ้าทั้งคู่ไม่ใช่: แสดง location + role (ผู้เล่นปกติ)
  -> host อาจมีปุ่ม End Round
    -> call endRound({ roomId, reason: "host_ended" })
  -> Countdown หมดเวลา
    -> call endRound({ roomId, reason: "timeout" })
```

### 5. Voting

```text
status === "voting"
  -> แสดง Countdown(round.voteEndsAt) เวลาถอยหลังโหวต
  -> แสดงรายชื่อ players ทุกคน (รวมตัวเอง + host)
  -> แต่ละคนมีปุ่ม "โหวต" (โหวตตัวเองได้) -> call castVote({ roomId, targetUid })
  -> ปุ่ม "ไม่โหวต" (skip) -> call castVote({ roomId, targetUid: null })
  -> เปลี่ยนโหวตได้: กดโหวตคนใหม่จะเขียนทับค่าเดิม
  -> เครื่องหมาย ✓ แสดงว่าโหวตใครอยู่
  -> แสดงจำนวน votesSoFar / totalPlayers
  -> เมื่อทุกคนโหวตครบ (รวม skip) backend จะเปลี่ยนเป็น reveal อัตโนมัติ
  -> เมื่อหมดเวลาโหวต Countdown เรียก resolveVote({ roomId })
     -> backend เช็คว่าหมดเวลาจริง แล้วตัดสินผลจากโหวตที่มีอยู่
     -> เปลี่ยนเป็น reveal
```

### 6. Reveal

```text
status === "reveal"
  -> แสดงผลเกม: winner, location, spyUids, jokerUids, votedOutUid
  -> winner อาจเป็น "players" | "spy" | "joker"
  -> ถ้า jokerUids มีคนอยู่ -> แสดงชื่อ Joker ด้วย
  -> ถ้า winner === "joker" -> แสดงว่า "[ชื่อ] เป็น Joker และโดนโหวตออก -> Joker ชนะ!"
  -> host เห็นปุ่ม "เล่นรอบใหม่" (call playAgain -> กลับ lobby)
     + ปุ่ม "กลับหน้าแรก"
  -> คนอื่นรอ host กดเล่นรอบใหม่
```

## จุดที่ยังต้องปรับปรุง / ทำต่อ

1. ~~หน้าจอตามสถานะ~~ -> **เสร็จแล้ว** (ครบทุก status: lobby, playing, voting, reveal)

2. ~~ปุ่มจบเกมใน RevealView~~ -> **เสร็จแล้ว** (host มีปุ่ม "เล่นรอบใหม่" -> playAgain กลับ lobby + ปุ่ม "กลับหน้าแรก")

3. ~~Voting timeout~~ -> **เสร็จแล้ว** (VotingView มี Countdown + resolveVote callable)

4. ~~ Joker role~~ -> **เสร็จแล้ว** (host กำหนด jokerCount 0-5, joker เห็นสถานที่, โดนโหวตออก joker ชนะ)

5. ~~แยก private data ออกจาก `rooms/{roomId}` ต่อผู้เล่น~~ -> **เสร็จแล้ว** (ย้าย `location`/`role`/`isSpy`/`isJoker` ไป `roomPrivate/{roomId}/{uid}` กัน spy อ่านข้อมูลลับผ่าน DevTools ได้จริง — rules cascade ทำให้ child rule ใต้โหนดที่เปิดอ่านทุกคนกันอะไรไม่ได้ ต้องแยก path แบบนี้)

6. ~~ทดสอบ emulator~~ -> **ทำแล้วบางส่วน** (smoke test ผ่านทั้ง flow: สร้างห้อง -> join -> start -> เช็คว่า public room ไม่มีข้อมูลลับ -> เช็คว่า rules ปฏิเสธอ่าน private ของคนอื่น -> โหวตครบ -> reveal + location สาธารณะ) ยังเหลือทดสอบ: ปิด tab host แล้วห้องหาย + cleanupRooms 6 ชม. (จำลองโดย backdate `createdAt`)

7. UI/UX ปรับปรุง: ตอนนี้ใช้ inline style ทั้งหมด ไม่มี design system / Tailwind classes จริงจัง, metadata ยังเป็น "Create Next App", ไม่มี loading skeleton / error boundary

8. ~~ข้อมูลลับ spy/joker รั่วระดับ devtools~~ -> **เสร็จแล้ว** (ข้อมูลลับย้ายไป `roomPrivate` แล้ว rules `.read: "auth.uid === $uid"` กันคนอื่นอ่านได้จริง — รวม `isJoker` ด้วย ไม่ใช่แค่ `isSpy`/`role`/`location`)

## Flow ที่แนะนำสำหรับ iteration ถัดไป

ทำตามลำดับนี้จะต่อระบบง่ายสุด:

1. ~~ทำหน้า Home: สร้างห้อง / เข้าห้อง~~ -> เสร็จแล้ว (มีใน `app/page.tsx`)
2. ~~เติมปุ่มจบเกมใน `RevealView` (host) + กลับหน้าแรก~~ -> เสร็จแล้ว (ปุ่ม "เล่นรอบใหม่" + "กลับหน้าแรก" มีแล้ว)
3. ~~ทำ voting timeout~~ -> เสร็จแล้ว (VotingView + resolveVote callable)
4. ~~เพิ่ม Joker role~~ -> เสร็จแล้ว (host กำหนด 0-5 คน, joker เห็นสถานที่, โดนโหวตออก joker ชนะ)
5. ~~แยก private data ออกจาก `rooms/{roomId}` ต่อผู้เล่น (playerViews)~~ -> เสร็จแล้ว (roomPrivate — ดูหัวข้อ Database Shape)
6. ทดสอบ emulator เพิ่มเติมก่อน deploy: ปิด tab host -> ตรวจว่าห้องหายทั้งสองฝั่ง + ทดสอบ cleanupRooms 6 ชม. (จำลองโดย backdate `createdAt`) + ทดสอบ playAgain วนรอบ 2 (private เก่าต้องหาย)
7. ปรับ UI/UX: Tailwind classes จริงจัง, loading skeleton, error boundary, metadata ชื่อเกม
8. เพิ่ม leaveRoom (manual) สำหรับผู้เล่นที่อยากออกจากห้องโดยไม่ต้องปิด tab

