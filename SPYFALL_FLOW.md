# Spyfall System Flow

อัปเดตล่าสุด: 2026-10-24 อ้างอิงโค้ดใน `app/` ปัจจุบัน

## Architecture

- Frontend และ backend อยู่ใน Next.js 16 App Router: UI ใน `app/`, API เป็น Route Handlers ที่รับ `POST` ใน `app/api/**/route.ts` และ deploy เป็น Next.js app
- Firebase Realtime Database เก็บห้อง, presence, location และข้อมูลลับแยกตามผู้เล่น; Firebase Auth ใช้ anonymous auth สำหรับผู้เล่น
- Client เรียก API ผ่าน `app/lib/apiRequest.ts`: แนบ Firebase ID token เป็น Bearer token และแปลงข้อความ error จาก API เป็น `Error`
- Server ตรวจ token ด้วย Firebase Admin ใน production; ใน development `verifyAuth` อ่าน uid จาก JWT payload โดยไม่ verify ลายเซ็น (ใช้เฉพาะ dev)
- Auth persistence ปัจจุบันเป็น `browserLocalPersistence` เมื่อใช้ Firebase จริง และ `browserSessionPersistence` เมื่อ `NEXT_PUBLIC_USE_EMULATOR=true`; จึงแชร์ผู้เล่นข้ามแท็บใน production ได้
- หน้า admin ใช้ Google sign-in และตรวจสิทธิ์จาก `admins/{uid}`; การจัดการ admin/location ทำผ่าน server endpoints
- Cron endpoint ตรวจ `X-CRON-SECRET` เทียบกับ `CRON_SECRET`; repo ที่ตรวจ ณ วันอัปเดตนี้ไม่มีไฟล์ workflow สำหรับตั้งเวลาเรียก cron

ทุกการเปลี่ยนสถานะเกมและการจัดการห้องใช้ server API/Admin SDK; Firebase client ใช้ subscribe ข้อมูล, จัดการ presence และอ่าน catalog ตาม database rules

## Gameplay Flow

```text
Firebase anonymous auth
  -> createRoom(name) หรือ joinRoom(roomId, name)
  -> lobby: host ตั้ง spy/joker/time; หน้า UI ให้ admin host เลือก location
  -> startGame: สุ่ม/เลือก location, สุ่มบทบาท, เขียน public + private data
  -> playing -> endRound (host กดจบ หรือ client ขอจบหลัง timeout)
  -> voting -> castVote (แก้โหวตได้) -> resolveVote เมื่อครบหรือหมดเวลา
       -> reveal ถ้าคนที่ได้คะแนนสูงสุดไม่ใช่ spy/joker หรือเสมอ/ไม่มีคะแนน
       -> guessing ถ้า spy หรือ joker ได้คะแนนสูงสุด
  -> spy ที่ได้รับสิทธิ์ส่ง submitGuess หรือ resolveGuess เมื่อหมดเวลา
  -> reveal -> host playAgain กลับ lobby
  -> player leaveRoom / host leaveRoom ยุบห้อง / host closeRoom ยุบห้อง
```

การนับคะแนนไม่รวม skip (`targetUid: null`); ผู้เล่นที่ได้คะแนนสูงสุดคนเดียวเป็นผู้ถูกโหวตออก หากคะแนนสูงสุดเสมอจะไม่มีผู้ถูกโหวตออก

## Database Shape

```text
rooms/{roomId}
  hostUid: string
  status: "lobby" | "playing" | "voting" | "guessing" | "reveal" | "ended"
  createdAt?: number
  selectedLocationId?: string | null  // ค่าที่จะใช้รอบถัดไป; null = random
  locationId?: string                 // location รอบปัจจุบัน เปิดเผย id ตั้งแต่เริ่มเกม
  location?: string                   // ชื่อ location เปิดเผยเมื่อ reveal
  spyCount?: number
  jokerCount?: number
  roundDuration?: number              // ms
  voteDuration?: number               // ms
  guessDuration?: number              // ms
  players/{uid}
    name: string
    online: boolean
    joinedAt: number
    lastOfflineAt?: number
  round?
    roundId: string
    startedAt: number
    duration: number
    endsAt: number
    voteEndsAt?: number
    guessEndsAt?: number
  votes/{voterUid}: { targetUid: string | null, votedAt: number }
  guess?: { locationName: string, guessedBy: string, guessedAt: number }
  result?: { winner: "players" | "spy" | "draw" | "team", spyUids: string[], jokerUids: string[], votedOutUid: string | null }

roomPrivate/{roomId}/{uid}
  roundId: string
  isSpy: boolean
  isJoker: boolean
  role?: string
  location?: string
  canGuess?: boolean

presence/{roomId}/{uid}: true

locations/{locationId}
  name: string
  roles: string[]
  active: boolean
  createdAt?: number
  createdBy?: string
```

`roomPrivate` อ่านได้เฉพาะ uid เจ้าของ node เพราะ RTDB rules cascade: การอนุญาต `.read` ที่ `rooms/{roomId}` ทำให้ child rules ไม่สามารถปิดสิทธิ์อ่านได้ ข้อมูลบทบาทและชื่อสถานที่จึงไม่เก็บใน public room ระหว่างเล่น ส่วน `locationId` อยู่ใน public room ตั้งแต่เริ่มเกม

## Rules and Defaults

- ผู้เล่นขั้นต่ำ 3 คน สูงสุด 8 คน (`MIN_PLAYERS`, `MAX_PLAYERS`)
- Location ต้องมี roles อย่างน้อย 7 รายการ (`MIN_ROLES`); catalog และ validation อยู่ใน `app/lib/server/`
- Spy ต้องมีอย่างน้อย 1 คน และต้องเหลือผู้เล่นที่ไม่ใช่ spy/joker อย่างน้อย 1 คน
- Joker อยู่ในช่วง 0–5; ค่า default คือ 0
- เวลาเล่น 1–15 นาที (default 8 นาที), เวลาโหวต 10–120 วินาที (default 30 วินาที), เวลาเดา 10–120 วินาที (default 30 วินาที)
- ค่าระยะเวลาถูก clamp ที่ create/start และตรวจซ้ำเมื่อใช้เริ่ม phase ถัดไป
- `startGame` ใช้ Fisher–Yates shuffle ผ่าน helper `shuffled`; สุ่ม location หากไม่มี `selectedLocationId`
- ผู้เล่นทั่วไปกดขีดฆ่า location ได้เฉพาะใน browser ของตัวเอง; state เก็บใน `localStorage` แยกตาม room/round
- UI ให้เฉพาะ host ตั้งค่าเกม; location selector แสดงเฉพาะ admin host แต่ server endpoint ตรวจว่า location ที่ส่งมามีอยู่และ active เท่านั้น

### Winner logic

1. Joker ถูกโหวตออก: spy ที่มีสิทธิ์เดาถูก = `team`; เดาผิด/ไม่มีคำตอบ = `players`.
2. Spy ถูกโหวตออก: spy คนนั้นเดาถูก = `draw`; เดาผิด/ไม่มีคำตอบ = `players`.
3. คนปกติถูกโหวต, ไม่มีคะแนน หรือคะแนนสูงสุดเสมอ = `spy`.
4. หากไม่มี spy private data เหลือเมื่อ resolve (เช่น spy ออกจากห้องระหว่างรอบ) = `players`.

เมื่อ Joker ถูกโหวต spy ทั้งหมดมี `canGuess`; เมื่อ spy ถูกโหวต มีสิทธิ์เฉพาะ spy ที่ถูกโหวต หากมีหลาย spy

## API Endpoints

ทุก endpoint ต่อไปนี้เป็น `POST` เว้นแต่ระบุไว้ และต้องมี Bearer Firebase ID token ยกเว้น cleanup endpoints ซึ่งใช้ cron secret

### Rooms

- `/api/rooms/createRoom`: `{ name, locationId?, spyCount?, jokerCount?, roundDuration?, voteDuration?, guessDuration? }` -> `{ roomId }`; สร้าง host และ lobby, ตรวจ location ว่า active ถ้าระบุ, ตรวจ spy count ตามเพดานห้อง, clamp joker/time
- `/api/rooms/joinRoom`: `{ roomId, name }`; normalize room code เป็นตัวพิมพ์ใหญ่, รับเฉพาะ lobby, ป้องกันชื่อซ้ำและห้องเกิน 8 คน; uid ที่มี player อยู่แล้วจะถูก mark online
- `/api/rooms/leaveRoom`: ลบ player/presence/private/vote ของผู้เรียก; host ออกหรือไม่มีผู้เล่นอื่น online จะลบทั้งห้อง
- `/api/rooms/closeRoom`: host เท่านั้น; ลบ `rooms`, `presence`, `roomPrivate` ของห้อง

### Game

- `/api/game/startGame`: host และ lobby เท่านั้น; ต้องมีผู้เล่นอย่างน้อย 3 คนและ active location; เลือก location, แจก spy/joker/role, สร้าง `roundId`, แล้ว multi-path update public/private state พร้อมข้อมูล phase
- `/api/game/endRound`: player เท่านั้น; `host_ended` ทำได้เฉพาะ host, `timeout` ทำได้เมื่อถึง `round.endsAt`; เปลี่ยนเป็น voting และตั้ง `voteEndsAt`
- `/api/game/castVote`: player ใน phase voting; `{ roomId, targetUid }` โดย null คือ skip; เขียนทับโหวตเดิมและเรียก resolver เมื่อจำนวน vote ถึงจำนวนผู้เล่น
- `/api/game/resolveVote`: player ใน voting; ใช้เมื่อทุกคนโหวตแล้วหรือ `voteEndsAt` ผ่าน; เข้าสู่ guessing หรือ reveal ตามผล
- `/api/game/submitGuess`: spy ที่มี `canGuess` เท่านั้น; transaction ที่ `rooms/{roomId}/guess` รับคำตอบแรกเพียงครั้งเดียว แล้ว finalize เป็น reveal
- `/api/game/resolveGuess`: player ใน guessing; finalize ได้เมื่อมีคำตอบหรือ `guessEndsAt` ผ่าน
- `/api/game/playAgain`: host; ล้าง round/votes/guess/result/private และ private residue ใต้ players แล้วกลับ lobby โดยคงผู้เล่นและ settings
- `/api/game/kickPlayer`: host ใน lobby; ลบผู้เล่นเป้าหมายพร้อม presence/private

### Locations and admins

- Locations: `/api/locations/addLocation`, `updateLocation`, `toggleLocationActive`, `deleteLocation`, `seedLocations` — admin เท่านั้น; seed เติมข้อมูลจาก `app/lib/server/data/locations.ts` โดยไม่ซ้ำชื่อ
- Admins: `/api/admins/listAdmins`, `addAdmin`, `removeAdmin` — admin เท่านั้น; client อ่าน `admins/{uid}` ของตัวเองได้แต่เขียนไม่ได้
- การเพิ่ม/แก้ไข location ผ่าน `cleanAndValidateLocation`; toggle/delete ใช้ validation ของ endpoint

### Utility and cleanup

- `/api/ping`: Bearer auth; ตอบ `{ ok: true, uid }`
- `/api/cleanupRooms`: `X-CRON-SECRET`; ลบห้องเกิน 6 ชั่วโมงหรือทุกคน offline เกิน 10 นาที แล้วกวาด presence/private ของห้องที่ไม่มี
- `/api/cleanupAuthUsers`: `X-CRON-SECRET`; ลบ anonymous auth users เก่ากว่า cutoff (default 24 ชั่วโมง); รับ `{ cutoffSeconds? }`

## Frontend Flow

- `app/page.tsx`: `AuthProvider` sign-in anonymous, กรอกชื่อ, สร้างหรือ join ห้องผ่าน API แล้ว navigate ไป `/room/{roomId}`
- `app/room/[roomId]/page.tsx`: `useRoom` subscribe public room และ private ของ uid; `usePresence` จัดการ online/offline; render ตาม `lobby`, `playing`, `voting`, `guessing`, `reveal`; ถ้า player ถูกลบจะกลับหน้าแรก
- `useRoom`: รอ private snapshot ก่อนแสดง phase ที่ต้องใช้ role/location; merge เฉพาะข้อมูล private ของ uid ตัวเอง และตรวจ `roundId` กัน private data ของรอบเก่า
- `usePresence`: ตั้ง `onDisconnect` ให้ presence หายและ player offline พร้อม `lastOfflineAt`; ขณะเชื่อมต่อเขียน online; เมื่อ cleanup จะเช็คว่า player ยังอยู่ก่อนเขียน offline
- `LobbyView`: แสดงรายชื่อ/online, host เลือก spy/joker/time, admin host เลือก location, host kick ได้และเริ่มเมื่อมีอย่างน้อย 3 คน
- `PlayingView`: countdown อ้าง `endsAt`; แสดง role card และ location reference; host จบรอบได้; client เรียก timeout endpoint เมื่อหมดเวลา
- `VotingView`: countdown จาก `voteEndsAt`; โหวต player หรือ skip; เมื่อหมดเวลา client เรียก `resolveVote`
- `GuessView`: countdown จาก `guessEndsAt`; เฉพาะ spy ที่ `canGuess` เลือก active location และส่งคำตอบ; คนอื่นรอโดยไม่เห็นผู้เดา; timeout เรียก `resolveGuess`
- `RevealView`: แสดงผู้ถูกโหวต, คำเดา (ถ้ามี), location, Joker, spy, winner และปุ่ม host เล่นใหม่

## Deployment Notes

- Client ต้องตั้ง `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`; `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` เป็น optional
- Server Firebase Admin ใช้ `FIREBASE_SERVICE_ACCOUNT_KEY` หรือ `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`; ต้องมี `CRON_SECRET` สำหรับ cleanup
- เปิด Firebase Anonymous sign-in; เปิด Google sign-in และ authorized domain สำหรับ admin
- สร้าง admin แรกที่ `admins/{uid}` ผ่าน Firebase Console/trusted server เพราะ client write ถูกปิด
- ต้องมี active location อย่างน้อยหนึ่งรายการก่อน start game
- `firebase.json` ชี้ rules ไปที่ `database.rules.json`; deploy rules แยกจาก Next.js deployment ด้วย `firebase deploy --only database`
- Local emulator: ตั้ง `NEXT_PUBLIC_USE_EMULATOR=true`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_DATABASE_EMULATOR_HOST`; client auth ใช้ session persistence เมื่อ emulator เปิด
- Build script ใน `package.json` คือ `next build --webpack`; scripts ปัจจุบันมี `dev`, `build`, `start`, `lint`
- Cleanup routes ยังต้องมี scheduler ภายนอกเรียก `POST /api/cleanupRooms` และ `POST /api/cleanupAuthUsers` พร้อม `X-CRON-SECRET`; ไม่มี workflow schedule อยู่ใน repo ณ วันที่อัปเดต
