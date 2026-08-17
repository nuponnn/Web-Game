# Spyfall System Flow

เอกสารนี้สรุป flow จากโค้ดปัจจุบัน โดยแยกเป็น backend Firebase Functions, Realtime Database state, และ frontend components/hooks

## ภาพรวมระบบ

เกมใช้ Firebase เป็นแกนหลัก:

- Frontend: Next.js app ใน `app/`
- Backend: Firebase Callable Functions + Database Triggers + Scheduled Function ใน `functions/src/`
- Database: Firebase Realtime Database path หลักคือ `rooms/{roomId}` และ `presence/{roomId}/{uid}`
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
rooms/{roomId}
```

และ path ใช้แจ้งว่าผู้เล่นออนไลน์อยู่ (สำหรับลบห้องอัตโนมัติ):

```text
presence/{roomId}/{uid}   // client เขียน true / onDisconnect ลบออกเอง
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

> แก้บั๊ก: เดิม rules มี `.read` แค่ที่ `locations/$locationId` แต่ rule ของลูก **ไม่ cascade ขึ้นแม่** ทำให้อ่านลิสต์ `locations` ทั้งก้อน (ทั้งหน้า admin และ Lobby) ติด permission denied -> "location ไม่โชว์" ตอนนี้เพิ่ม `.read: "auth != null"` ที่ระดับ `locations` แล้ว (อ่านลิสต์ได้, spy ยังอ่าน location เฉพาะห้องไม่ได้ตาม rule ย่อย)

โครงสร้างหลักจาก `functions/src/lib/roomState.ts`:

```ts
{
  hostUid: string,
  status: "lobby" | "playing" | "voting" | "reveal" | "ended",
  location?: string,
  locationId?: string,      // อ้างอิง locations/{id} เผื่อ audit
  selectedLocationId?: string, // admin ตั้งไว้ตอนสร้างห้อง (ก่อน start ยังแก้ได้ใน Lobby)
  spyCount?: number,        // จำนวน spy ที่ host กำหนด (default 1)
  roundDuration?: number,   // เวลาหา spy (ms) ที่ host กำหนด (default 8 นาที, ช่วง 1-15 นาที)
  voteDuration?: number,    // เวลาโหวต (ms) ที่ host กำหนด (default 30 วินาที, ช่วง 10-120 วินาที)
  players: {
    [uid]: {
      name: string,
      online: boolean,
      isSpy?: boolean,
      role?: string,
      joinedAt: number
    }
  },
  round?: {
    startedAt: number,
    duration: number,        // ค่า roundDuration ที่ใช้จริงในรอบนี้
    endsAt: number,
    voteEndsAt?: number      // เวลาสิ้นสุดโหวต (คำนวณจาก voteDuration)
  },
  votes?: {
    [voterUid]: { targetUid, votedAt }   // มี timestamp กำกับเวลาโหวต
  },
  result?: {
    winner: "players" | "spy",
    spyUids: string[],     // spy มีได้หลายคน (host/admin กำหนด spyCount ได้)
    votedOutUid: string | null
  }
}
```

## Backend Functions

### `createRoom`

ไฟล์: `functions/src/rooms/createRoom.ts`

หน้าที่:

- ต้องมี `request.auth.uid`
- รับ `name`
- **admin เท่านั้น** ส่งตัวเลือกเพิ่มเติมได้: `locationId` (เลือกสถานที่ให้ห้อง) และ `spyCount` (จำนวน spy 1..MAX_PLAYERS-1) — ตรวจว่า location นั้น active จริง และเช็ค admin (`assertIsAdmin`) ก่อน; เก็บลงห้องเป็น `selectedLocationId` / `spyCount`
- **host ทุกคน** กำหนดเวลาได้: `roundDuration` (เวลาหา spy, ms, ช่วง 1-15 นาที) และ `voteDuration` (เวลาโหวต, ms, ช่วง 10-120 วินาที)
- ผู้เล่นธรรมดาไม่ส่งตัวเลือก -> ห้องจะสุ่ม location / spy 1 คน / เวลา 8 นาที / โหวต 30 วินาที ตอน start
- สุ่ม `roomId` 4 ตัว เช่น `A7KQ`
- สร้างห้องใหม่ที่ `rooms/{roomId}`
- ตั้งคนสร้างเป็น `hostUid`
- เพิ่ม host เข้า `players`
- ตั้ง `status: "lobby"`

Input:

```ts
{ name: string, locationId?: string, spyCount?: number, roundDuration?: number, voteDuration?: number }
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
- ใช้ `locationId` ที่ host ส่งตอน start หรือที่ตั้งไว้ตอนสร้างห้อง (`room.selectedLocationId`) -> ใช้ตัวนั้น; ไม่ระบุ -> สุ่มจาก active ทั้งหมด (ถ้าเลือกตัวที่ถูกปิด/ไม่มีอยู่ -> error ชัดเจน)
- จำนวน spy = `spyCount` ที่ส่งตอน start -> ค่าที่ตั้งตอนสร้างห้อง (`room.spyCount`) -> default 1; ตรวจว่า 1..(จำนวนผู้เล่น - 1) (ต้องเหลือคนปกติอย่างน้อย 1 คน)
- ระยะเวลาหา spy = `roundDuration` ที่ส่งตอน start -> ค่าที่ตั้งตอนสร้างห้อง (`room.roundDuration`) -> default 8 นาที; จำกัดช่วง 1-15 นาที
- ระยะเวลาโหวต = `voteDuration` ที่ส่งตอน start -> ค่าที่ตั้งตอนสร้างห้อง (`room.voteDuration`) -> default 30 วินาที; จำกัดช่วง 10-120 วินาที
- สุ่ม spy ตามจำนวนที่กำหนด (ไม่ซ้ำกัน)
- แจก role ให้ผู้เล่นที่ไม่ใช่ spy (logic `assignRoles` ย้ายไป `functions/src/lib/locations.ts`)
- ตั้ง `status: "playing"`
- ตั้ง `round.startedAt`, `round.duration` (จาก roundDuration), `round.endsAt`
- เก็บ `roundDuration` และ `voteDuration` ไว้ในห้อง เพื่อให้ round ถัดไป (playAgain) ใช้ค่าเดิมได้
- เก็บ `location` (ชื่อ) และ `locationId` (อ้างอิง) ไว้ในห้อง
- ล้าง `votes` และ `result`

Input:

```ts
{ roomId: string, locationId?: string, spyCount?: number, roundDuration?: number, voteDuration?: number }
```

Output:

```ts
{ ok: true, endsAt: number, spyCount: number, roundDuration: number, voteDuration: number }
```

หมายเหตุ: ตอนนี้ database จะเก็บ `location` ไว้ในห้องโดยตรง ถ้า rules เปิดให้อ่านทั้งห้อง ทุกคนจะเห็น location รวมถึง spy ด้วย ต้องออกแบบ security rules หรือแยก private view ก่อนใช้งานจริง

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

### `resolveVote` ( callable ใหม่)

ไฟล์: `functions/src/game/resolveVote.ts`

หน้าที่:

- เรียกได้เฉพาะผู้เล่นในห้อง
- เรียกได้เฉพาะตอน `status: "voting"`
- ต้องหมดเวลาโหวต (`serverNow >= voteEndsAt`) หรือโหวตครบทุกคนแล้วเท่านั้น (กันกดข้ามขั้นตอน)
- เรียก logic `resolveVote` จาก `castVote.ts` เพื่อตัดสินผลโหวต
- ใช้ตอนหมดเวลาโหวตจาก Countdown ฝั่ง client

Input:

```ts
{ roomId: string }
```

Output:

```ts
{ ok: true }
```

### `castVote`

ไฟล์: `functions/src/game/castVote.ts`

หน้าที่:

- เรียกได้เฉพาะผู้เล่นในห้อง
- เรียกได้เฉพาะตอน `status: "voting"`
- รับ `targetUid` คนที่โดนโหวต
- ห้ามโหวตคนที่ไม่ได้อยู่ในห้อง
- ห้ามโหวตซ้ำด้วย transaction ที่ `votes/{uid}`
- ถ้าโหวตครบทุกคน จะเรียก `resolveVote`

Input:

```ts
{ roomId: string, targetUid: string }
```

Output:

```ts
{ ok: true, votesSoFar: number, totalPlayers: number }
```

### `resolveVote`

อยู่ในไฟล์ `functions/src/game/castVote.ts`

หน้าที่:

- นับคะแนนจาก `votes`
- คนที่โดนโหวตสูงสุดคือคนที่ถูกเลือก
- ถ้าคะแนนเสมอ ถือว่าจับไม่ได้ `votedOutUid = null`
- ถ้า `votedOutUid` เป็น spy ตัวใดตัวหนึ่ง (ใน `spyUids`) ผู้เล่นชนะ
- ถ้าไม่ใช่ spy หรือเสมอ spy ชนะ
- ตั้ง `status: "reveal"`
- เขียน `result`

### `playAgain`

ไฟล์: `functions/src/game/playAgain.ts`

Callable — ให้ host กด "เล่นรอบใหม่" หลังจบเกม โดยไม่ต้องสร้างห้องใหม่

หน้าที่:

- ตรวจว่าเป็น host เท่านั้น
- ล้าง `isSpy`/`role` ของผู้เล่นทุกคน + `round`/`votes`/`result`
- ตั้ง `status: "lobby"` -> RoomPage สลับไปแสดง LobbyView ให้อัตโนมัติ
- **เก็บ** ผู้เล่น + `selectedLocationId`/`spyCount` ไว้ เพื่อให้ Lobby มี state พร้อมเริ่มรอบใหม่ทันที

### `kickPlayer`

ไฟล์: `functions/src/game/kickPlayer.ts`

Callable — ให้ host เตะผู้เล่นออกจากห้อง (ใช้ได้เฉพาะตอน `status: "lobby"` เท่านั้น)

หน้าที่:

- ตรวจว่าเป็น host เท่านั้น
- ตรวจว่า status === "lobby" (เตะได้เฉพาะตอนอยู่ในล็อบบี้ ตอนเกมกำลังเล่นเตะไม่ได้)
- ห้ามเตะตัวเอง
- ลบผู้เล่นเป้าหมายออกจาก `players/{targetUid}`
- ลบ `presence/{roomId}/{targetUid}` ด้วย (กัน presence ค้าง)

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
- ครอบกรณี host ปิด tab กลางคันก่อนจบเกม ไม่กลับมาลบ (กรณี host หลุดแบบปกติจะถูกลบทันทีผ่าน `presenceCleanup` อยู่แล้ว อันนี้เป็น safety net)

หมายเหตุ: `onSchedule` ต้องใช้โปรเจกต์แบบ Blaze (มี billing) ถึง deploy จริงได้ ใน emulator รันผ่าน emulator "tasks"

### `cleanupAuthUsers` (ล้าง user ใน Auth ที่ไม่ใช้แล้ว กัน auth รก)

ไฟล์: `functions/src/auth/cleanupAuthUsers.ts`

เป็น **Scheduled Function** (`onSchedule`) วิ่งทุก **24 ชั่วโมง** (timezone `Asia/Bangkok`)

หน้าที่: วน list user ทั้งหมดใน Firebase Auth แล้วลบคนที่เข้าเกณฑ์ "ไม่ใช้งาน":

- ไม่ได้เป็น admin (ไม่มี record ที่ `admins/{uid}`) — admin โดนถอดสิทธิ์ถูก `adminRemoved` ลบไปแล้ว ถ้าอยู่ในลิสต์นี่คือยังใช้อยู่
- ไม่ได้อยู่ในห้องใดๆ (ไม่อยู่ใน `rooms/*/players`) และไม่มี presence ค้าง
- ไม่ได้ sign-in เกิน **24 ชม.** (`metadata.lastSignInTime`)
- ข้าม `auth/user-not-found` ไม่ให้ error (ลบซ้ำ/หายไปแล้ว)

โดยมากคือบัญชี anonymous ของผู้เล่นที่เข้ามาเล่นครั้งเดียวแล้วหายไป (auth จะได้ไม่รก)

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

trigger อัตโนมัติ `functions/src/admins/adminRemoved.ts` — ฟัง `admins/{uid}` โดนลบ (ใคร "หลุด" จาก admin ไม่ว่าด้วยวิธีไหน) -> ลบ user ใน Firebase Auth ให้อัตโนมัติ

โครงสร้าง `admins/{uid}` ตอนนี้เป็น object: `{ email, displayName, addedAt, addedBy }` (ตรวจสิทธิ์ใน `assertIsAdmin` ใช้ `.exists()` ไม่ใช่ค่า `true` แล้ว)

> หมายเหตุ: ตั้งแต่ที่ใคร login ด้วย Google ก็สมัครเป็น admin เองได้ (self-register ที่หน้า `/admin`) function กลุ่มนี้จึงเป็นตัวช่วยจัดการเท่านั้น ไม่ใช่ช่องทางหลักอีกต่อไป

constants กลางอยู่ที่ `functions/src/lib/constants.ts` (`MAX_PLAYERS`, `MIN_PLAYERS`, `MIN_ROLES = MAX_PLAYERS - 1`)

script ย้ายข้อมูลเก่า: `functions/scripts/migrateLocations.js` (รันครั้งเดียว อ่าน `LOCATIONS` จาก `functions/src/data/locations.ts` -> เขียนเข้า database)

## Frontend ปัจจุบัน

### `app/page.tsx`

เป็นหน้า Home:

- เป็น client component ฟัง auth ผ่าน `useAuth()`
- มีช่องกรอกชื่อ + ปุ่ม **Create Room** (call `createRoom`) และปุ่ม **Join Room** (กรอก roomId + call `joinRoom`)
- **admin** ที่ login Google ไว้ จะเห็น select **สถานที่** (จาก locations ที่ active) + select **จำนวน Spy** เพิ่ม -> ส่งไปตอน `createRoom` (เลือกสถานที่/กำหนด spy ตอนสร้างห้องได้เอง); ผู้เล่นธรรมดาไม่เห็น -> สร้างห้องแบบสุ่ม
- **host ทุกคน** เห็น select **เวลาหา Spy** (1-15 นาที) + select **เวลาโหวต** (10-120 วินาที) -> ส่งไปตอน `createRoom`
- สำเร็จแล้ว `router.push` ไป `/room/{roomId}`
- มีลิงก์ **Admin** ไป `/admin`

### `app/admin/page.tsx` / `app/admin/locations/page.tsx` / `app/admin/users/page.tsx`

ระบบจัดการฝั่ง admin:

- `/admin` — admin login แยกจากผู้เล่น: ผู้เล่นทั่วไปเป็น anonymous แต่ admin ต้อง **Google Sign-In** แล้วระบบจะ**สมัครสิทธิ์ admin ให้เองทันที** (เขียน `admins/{uid}` ของตัวเอง) ไม่ต้องขออนุญาต/ไม่ต้องเพิ่มจาก Console; ถ้าเป็น admin -> เห็น hub ลิงก์ไปจัดการ Location และจัดการ Admin
- `/admin/locations` — กันเฉพาะ admin: ฟอร์มเพิ่ม location (ชื่อ + roles dynamic list พร้อม warning realtime เมื่อ roles ยังไม่ครบขั้นต่ำ), ลิสต์ location ทั้งหมด, ปุ่มเปิด/ปิด (toggle), แก้ไข, ลบถาวร (ยืนยันก่อน), และปุ่ม **Seed ข้อมูลพื้นฐาน**
- `/admin/users` — กันเฉพาะ admin: ลิสต์ admin ทั้งหมด, เพิ่ม admin (กรอก uid), ถอดสิทธิ์ (ลบ record ใน RTDB แล้วระบบลบ user ใน Auth ให้อัตโนมัติ พร้อมยืนยันก่อนลบ)
- wrapper callable อยู่ที่ `app/lib/adminFunctions.ts`

### `app/room/[roomId]/page.tsx`

เป็นหน้าหลักของเกม:

- `useRoom(roomId)` subscribe `rooms/{roomId}` ฟัง status
- `useAuth()` หา uid ปัจจุบัน
- `usePresence(roomId, uid, !!room)` แจ้งออนไลน์ (จุดชนวนลบห้องอัตโนมัติ)
- render ตาม `room.status`: `LobbyView` / `PlayingView` / `VotingView` / `RevealView`
- ถ้า `room` เป็น null (ห้องถูกลบไปแล้ว / roomId ผิด) -> แสดง "ไม่พบห้องนี้" + ปุ่ม **กลับหน้าแรก** (`router.push("/")`)

### `app/components/Countdown.tsx`

หน้าที่:

- รับ `endsAt`
- ใช้ `useServerTimeOffset()` เพื่อเทียบเวลา client กับ Firebase server
- แสดงเวลาถอยหลัง
- เรียก `onExpire()` หนึ่งครั้งเมื่อหมดเวลา

ควรใช้ตอน `status: "playing"` แล้วให้ `onExpire` เรียก `endRound({ roomId, reason: "timeout" })`

### `app/lib/useRoom.ts`

หน้าที่:

- subscribe Realtime Database ที่ `rooms/{roomId}`
- คืน `{ room, loading }` โดย `room` type เป็น `Room | null` (ประกาศเองในไฟล์นี้ให้ตรงกับ backend) — ตอนเช็ค `!room` แล้ว TS จะได้ type เป็น `Room` ไม่ติด `never`
- เหมาะกับ MVP เพราะฟังทั้ง room object ทีเดียว

### `app/lib/usePresence.ts`

หน้าที่:

- ตอนเข้า room page เขียน `presence/{roomId}/{uid} = true`
- สั่ง `onDisconnect().remove()` เพื่อให้ server ลบ presence อัตโนมัติเมื่อ client หลุดการเชื่อมต่อ
- ตอน unmount ยกเลิก onDisconnect + ลบ presence ออก (เปลี่ยนหน้าแล้วไม่นับว่าอยู่ห้อง)
- เรียกใน `app/room/[roomId]/page.tsx` โดยเปิดทำงานเฉพาะเมื่อมี `room` + `user` แล้ว
- เป็นตัวจุดชนวนให้ backend ลบห้องทันทีเมื่อ host หลุด หรือไม่มีใครออนไลน์เหลือ

### `app/lib/useServerTime.ts`

หน้าที่:

- อ่าน `.info/serverTimeOffset`
- คืน offset สำหรับคำนวณ server time โดยประมาณ

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
  -> (admin เท่านั้น) เลือกสถานที่ + จำนวน Spy
  -> ปุ่ม Create Room
    -> call createRoom({ name, roundDuration?, voteDuration?, locationId?, spyCount? })
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
  -> ถ้า current uid === hostUid
    -> แต่ละคนมีปุ่ม "เตะ" (ยกเว้นตัวเอง)
       -> call kickPlayer({ roomId, targetUid })
    -> ถ้า host เป็น admin (อยู่ใน admins/{uid}): แสดง select ให้เลือก location
       ที่จะเล่นให้ห้องนี้ได้ (จาก locations ที่ active) ไม่เลือก = สุ่ม
    -> แสดง select จำนวน Spy (1-7) - host ทุกคนกำหนดได้
    -> แสดง select เวลาหา Spy (1-15 นาที, default 8) - host ทุกคนกำหนดได้
    -> แสดง select เวลาโหวต (10-120 วินาที, default 30) - host ทุกคนกำหนดได้
    -> แสดงปุ่ม Start Game
    -> call startGame({ roomId, locationId?, spyCount?, roundDuration?, voteDuration? })
  -> คนอื่นรอ host
```

### 4. Playing

```text
status === "playing"
  -> แสดง Countdown(round.endsAt)
  -> แสดงข้อมูลตาม role
    -> ถ้า isSpy === true: แสดงว่า "คุณคือ Spy"
    -> ถ้า isSpy !== true: แสดง location + role
  -> host อาจมีปุ่ม End Round
    -> call endRound({ roomId, reason: "host_ended" })
  -> Countdown หมดเวลา
    -> call endRound({ roomId, reason: "timeout" })
```

### 5. Voting

```text
status === "voting"
  -> แสดง Countdown(round.voteEndsAt) เวลาถอยหลังโหวต
  -> แสดงรายชื่อ players
  -> ผู้เล่นเลือก targetUid
  -> call castVote({ roomId, targetUid })
  -> แสดงจำนวน votesSoFar / totalPlayers
  -> เมื่อทุกคนโหวตครบ backend จะเปลี่ยนเป็น reveal อัตโนมัติ
  -> เมื่อหมดเวลาโหวต Countdown เรียก resolveVote({ roomId })
     -> backend เช็คว่าหมดเวลาจริง แล้วตัดสินผลจากโหวตที่มีอยู่
     -> เปลี่ยนเป็น reveal
```

### 6. Reveal

```text
status === "reveal"
  -> แสดง spy ตัวจริงทั้งหมด (spyUids)
  -> แสดงคนที่โดนโหวต
  -> แสดง winner
    -> winner === "players": ผู้เล่นชนะ
    -> winner === "spy": spy ชนะ
```

## จุดที่ยังต้องเติมก่อนระบบเล่นได้จริง

1. หน้าจอตามสถานะ

มี `app/room/[roomId]/page.tsx` + views ครบทุกสถานะแล้ว แต่ UI ในแต่ละ view ยังทำแบบเร็ว/ไม่ครบ และ `RevealView` ยังไม่มีปุ่มจบเกม ต้องการ "จบเกมและออกจากห้อง" แบบ user-friendly (ตอนนี้ห้องจะหายเองผ่าน presence/cleanup เท่านั้น)

2. ~~Voting timeout ยังไม่มีตัวปิดรอบอัตโนมัติ~~ -> **แก้แล้ว**

- VotingView มี Countdown แสดงเวลาถอยหลังโหวต (จาก `round.voteEndsAt`)
- เมื่อหมดเวลา เรียก `resolveVote` callable ที่ฝั่ง backend เช็คว่าหมดเวลาจริงก่อนตัดสินผล
- ถ้าโหวตครบทุกคนก่อนหมดเวลา จะ resolve อัตโนมัติจาก castVote อยู่แล้ว

3. ระบบลบห้องต้อง deploy `onSchedule`

`presenceCleanup` (database trigger) ทำงานได้ทุก tier แต่ `cleanupRooms` ใช้ Cloud Scheduler -> ต้องโปรเจกต์แบบ Blaze ถึงจะรันตอน deploy จริง

4. ระวังข้อมูลลับของ spy ระดับ devtools

ตอนนี้ rules กัน `location` ไม่ให้ spy อ่าน และ `role`/`isSpy` ให้อ่านได้เฉพาะเจ้าตัวแล้ว แต่ถ้าผ่าน devtools แอบส่ง request อ่านด้วย uid อื่น rules จะบล็อกได้จริง (test ก่อน deploy) — ยังมีช่องที่ host ดู location ได้ (ถูกแล้ว) แต่คนอื่นในห้องเห็น `hostUid` ได้ (ปกตินะ)

## Flow ที่แนะนำสำหรับ MVP ถัดไป

ทำตามลำดับนี้จะต่อระบบง่ายสุด:

1. ~~ทำหน้า Home: สร้างห้อง / เข้าห้อง~~ -> เสร็จแล้ว (มีใน `app/page.tsx`)
2. เติมปุ่มจบเกมใน `RevealView` (host) + กลับหน้าแรก (ตอนนี้ "ไม่พบห้อง" มีปุ่มกลับหน้าแรกแล้ว แต่ตอนเกมจบปกติยังต้องเพิ่มปุ่มจบ/ออกจากห้อง)
3. ~~ทำ voting timeout: client-side countdown แล้วถ้าครบให้เรียก endRound + ไล่ resolveVote จากฝั่ง client หรือเพิ่ม scheduled function กันเอาไว้~~ -> เสร็จแล้ว (VotingView + resolveVote callable)
4. แยก private data ออกจาก `rooms/{roomId}` ต่อผู้เล่น (playerViews) ก่อนไป scale คนเยอะขึ้น
5. ทดสอบ emulator ก่อน deploy: สร้างห้อง 2 tab -> ปิด tab host -> ตรวจว่าห้องหายทั้งสองฝั่ง + ทดสอบ cleanupRooms 6 ชม. (จำลองโดย backdate `createdAt`)

