# Spyfall — Sequence Diagram

อัปเดตล่าสุด: 2026-10-24 อ้างอิง API และ UI ใน `app/` ปัจจุบัน

## หนึ่งรอบการเล่น

```mermaid
sequenceDiagram
    autonumber
    actor Host as Host
    actor Players as ผู้เล่น
    participant UI as Next.js UI
    participant Auth as Firebase Auth
    participant API as Next.js Route Handler
    participant RTDB as Firebase Realtime Database

    Host->>Auth: anonymous sign-in
    Auth-->>UI: Firebase user
    Host->>UI: สร้างห้อง + ชื่อ
    UI->>API: POST /api/rooms/createRoom (Bearer ID token)
    API->>Auth: verify ID token (production)
    Auth-->>API: uid
    API->>RTDB: สร้าง rooms/{roomId}, host player, settings ที่ส่งมา
    API-->>UI: { roomId }
    UI->>RTDB: subscribe rooms/{roomId} + roomPrivate/{roomId}/{hostUid}
    UI->>RTDB: register presence/onDisconnect

    loop ผู้เล่นแต่ละคนเข้าห้อง
        Players->>Auth: anonymous sign-in
        Auth-->>UI: Firebase user
        Players->>UI: ใส่ room code และชื่อ
        UI->>API: POST /api/rooms/joinRoom (Bearer ID token)
        API->>RTDB: ตรวจ lobby, uid เดิม, ชื่อซ้ำ, จำนวนผู้เล่น
        RTDB-->>API: บันทึก player หรือ mark online
        API-->>UI: { ok: true }
        UI->>RTDB: subscribe public room + private ของ uid ตัวเอง
        UI->>RTDB: register presence/onDisconnect
    end

    Host->>UI: ตั้งค่า spy/joker/time และกดเริ่ม
    UI->>API: POST /api/game/startGame
    API->>Auth: verify ID token
    API->>RTDB: ตรวจ host/lobby/ผู้เล่น/active locations
    API->>API: เลือก location, shuffle และกำหนดบทบาท
    API->>RTDB: root multi-path update: public round + roomPrivate รายคน
    RTDB-->>UI: status = playing และ private snapshot ของแต่ละ uid
    UI-->>Players: แสดง role card และรายการ locations

    alt Host จบรอบก่อนเวลา
        Host->>UI: กดจบรอบ
        UI->>API: POST /api/game/endRound (reason = host_ended)
    else หมดเวลาเล่น
        UI->>API: POST /api/game/endRound (reason = timeout)
    end
    API->>RTDB: ตรวจ host/เวลา แล้วตั้ง status = voting และ voteEndsAt
    RTDB-->>UI: status = voting

    par ผู้เล่นส่งโหวต
        loop ผู้เล่นแต่ละคน
            Players->>UI: เลือกเป้าหมายหรือ skip
            UI->>API: POST /api/game/castVote
            API->>RTDB: เขียน votes/{uid} (แทนที่โหวตเดิมได้)
            API->>RTDB: อ่านห้องล่าสุด
            opt จำนวนโหวตถึงจำนวนผู้เล่น
                API->>API: เรียก resolveVoteLogic
            end
        end
    and หมดเวลาโหวต
        UI->>API: POST /api/game/resolveVote
        API->>RTDB: ตรวจว่าครบทุกโหวตหรือ voteEndsAt ผ่าน
        API->>API: เรียก resolveVoteLogic
    end

    API->>RTDB: อ่าน votes และ roomPrivate เพื่อคำนวณผู้ถูกโหวต/บทบาท
    alt Spy หรือ Joker ได้คะแนนสูงสุดคนเดียว
        API->>RTDB: ตั้ง status = guessing, guessEndsAt และ canGuess ให้ spy ที่มีสิทธิ์
        RTDB-->>UI: status = guessing
        alt Spy ส่งคำตอบก่อนหมดเวลา
            Players->>UI: spy เลือก location
            UI->>API: POST /api/game/submitGuess
            API->>Auth: verify ID token และตรวจ isSpy/canGuess
            API->>RTDB: transaction บันทึก guess แรก (set-if-absent)
            API->>RTDB: อ่านข้อมูลล่าสุด ถ้ายัง guessing ให้ finalizeVote
        else หมดเวลาเดา
            UI->>API: POST /api/game/resolveGuess
            API->>Auth: verify ID token และตรวจ player
            API->>RTDB: ตรวจว่ามี guess หรือ guessEndsAt ผ่าน แล้ว finalizeVote
        end
        API->>RTDB: ตั้ง status = reveal, location และ result/winner
    else ไม่มีคะแนน, คะแนนเสมอ หรือคนปกติได้คะแนนสูงสุด
        API->>RTDB: finalizeVote โดยตรงเป็น reveal
    end
    RTDB-->>UI: status = reveal
    UI-->>Host: แสดงผู้ถูกโหวต, guess, location, roles และ winner
    UI-->>Players: แสดงผลรอบ

    opt Host เล่นอีกรอบ
        Host->>UI: กดเล่นอีกครั้ง
        UI->>API: POST /api/game/playAgain
        API->>Auth: verify ID token และตรวจ host
        API->>RTDB: ล้าง round/votes/guess/result/private และ player role residue
        API->>RTDB: ตั้ง status = lobby (คงผู้เล่นและ settings)
        RTDB-->>UI: status = lobby
    end
```

## ออกจากห้องและ cleanup

```mermaid
sequenceDiagram
    actor Player as Player
    participant UI as Next.js UI
    participant API as Next.js Route Handler
    participant RTDB as Firebase Realtime Database

    Player->>UI: ยืนยันออกจากห้อง
    UI->>API: POST /api/rooms/leaveRoom (Bearer ID token)
    API->>RTDB: ตรวจ membership
    alt ผู้เรียกเป็น host หรือไม่มีผู้เล่นอื่น online
        API->>RTDB: ลบ rooms/{roomId}, presence และ roomPrivate ทั้งห้อง
    else ผู้เล่นทั่วไป
        API->>RTDB: ลบ player/presence/private/vote ของ uid
    end
    API-->>UI: { ok: true }

    Note over UI,RTDB: onDisconnect และ cleanup client ช่วยปรับ presence/online/lastOfflineAt
    Note over API,RTDB: cleanupRooms ใช้ X-CRON-SECRET; ลบห้องอายุเกิน 6 ชม. หรือทุกคน offline เกิน 10 นาที และกวาดข้อมูล orphan
    Note over API,RTDB: cleanupAuthUsers ลบ anonymous users ก่อน cutoff (default 24 ชม.)
```

## การตัดสินผล

| ผลโหวต | ผลเดาของ spy | ผู้ชนะ |
|---|---|---|
| Joker ถูกโหวต | เดาถูก | Spy และ Joker (`team`) |
| Joker ถูกโหวต | เดาผิด/ไม่มีคำตอบ | ผู้เล่น (`players`) |
| Spy ถูกโหวต | เดาถูก | เสมอ (`draw`) |
| Spy ถูกโหวต | เดาผิด/ไม่มีคำตอบ | ผู้เล่น (`players`) |
| คนปกติถูกโหวต, ไม่มีคะแนน หรือคะแนนสูงสุดเสมอ | ไม่เข้าสู่ phase เดา | Spy (`spy`) |
| ไม่มี spy เหลือใน private data ตอน resolve | ไม่เข้าสู่ phase เดา | ผู้เล่น (`players`) |

Skip ไม่เพิ่มคะแนนให้ผู้เล่นคนใด; ถ้าคะแนนสูงสุดเสมอ ระบบถือว่าไม่มีผู้ถูกโหวตออก

## การแยกข้อมูลและสิทธิ์

- Client ทุกคน subscribe `rooms/{roomId}` เพื่อดู phase, players, votes และผลตาม rules; client เขียน gameplay state ผ่าน API เท่านั้น
- `roomPrivate/{roomId}/{uid}` อ่านได้เฉพาะ uid เจ้าของ; `useRoom` merge role/location/canGuess ของตัวเอง และตรวจ `roundId` ก่อนใช้
- `submitGuess` ตรวจว่า caller เป็น spy ที่มี `canGuess`; transaction ที่ `rooms/{roomId}/guess` รับคำตอบแรกเพียงครั้งเดียว
- API ใช้ Firebase Admin SDK จึงต้อง verify Bearer ID token ใน production; cleanup ใช้ cron secret แทน player token
- Presence เขียนจาก client SDK: เมื่อเชื่อมต่อจะตั้ง online, `onDisconnect` บันทึก offline และ `lastOfflineAt`; การออก/ยุบห้องถูกจัดการโดย API
- `locationId` ของรอบอยู่ใน public room ตั้งแต่ start; ชื่อ location ถูกเปิดเผยเมื่อ reveal
