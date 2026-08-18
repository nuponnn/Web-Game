# Shape Brief: Spyfall Game UI

## Job and Audience

**ผู้เล่น:** กลุ่มเพื่อน/ครอบครัว 3-8 คน ที่ต้องการเล่น Spyfall บนเว็บ
**สถานการณ์:** เปิดเว็บบนมือถือหรือคอม ต้องการเริ่มเกมให้เร็วที่สุด
**Mindset:** อยากเล่นเกม ไม่อยากเสียเวลาทำความเข้าใจ UI

## Outcome and Proof

**Primary task:** สร้างห้องหรือเข้าห้องด้วยรหัส 4 ตัว แล้วเริ่มเล่น
**Success:** ผู้เล่นใหม่เข้าใจ flow ภายใน 5 วินาที ไม่ต้องมี tutorial
**Proof:** ทุกหน้าจอเข้าใจได้ทันที ไม่ต้องอ่านคำอธิบาย

## Selected Direction

**Visual World:** Minimal Modern — Clean & Pure
- พื้นที่เยอะ (white space) ให้ตาพัก
- พื้นหลังขาว/เกือบขาว #FAFAFA
- Accent สีเดียว: **Indigo #4F46E5** (มั่นใจ ไม่เด็ก ไม่ทางการ)
- ตัวอักษรดำ #111827 บนพื้นขาว ชัดเจน อ่านง่าย
- ไม่มี drop shadow หนักๆ ใช้ border เบากว่า
- ปุ่มใหญ่ 14px+ กดง่ายบนมือถือ
- Border radius 12px ทุกปุ่ม/card (โค้งมนriendly)

**Typography:** Inter ตัวเดียวจบ — หัวข้อ 18-20px bold, ข้อความ 14-16px regular
**Color palette:**
- Background: #FAFAFA
- Surface: #FFFFFF
- Text primary: #111827
- Text secondary: #6B7280
- Accent: #4F46E5 (Indigo 600)
- Accent hover: #4338CA
- Success: #10B981
- Danger: #EF4444

**Layout:** Center-aligned, single column บนมือถือ, max-width 480px

## Scope and Boundaries

**ทำทุกหน้า:**
1. Home page — Create/Join room
2. Lobby — รายชื่อผู้เล่น + host settings
3. Playing — แสดง role/location ตามสถานะ
4. Voting — โหวตเลือก spy
5. Reveal — ผลแพ้ชนะ

**ไม่ทำ:**
- Admin panel
- ไม่แก้ logic/backend
- ไม่เปลี่ยน game flow

**Fidelity:** Production-ready UI + responsive
**Interactivity:** ทุกปุ่ม click ได้จริง ทุก state แสดงผลได้จริง

## States and Ranges

**Home:**
- Loading (anonymous auth)
- สร้างห้อง
- เข้าห้องด้วยรหัส
- Error state

**Lobby:**
- ไม่มีผู้เล่น (waiting)
- 2-8 คน
- Host controls (settings)
- Non-host (waiting only)

**Playing:**
- Spy (ไม่เห็น location)
- Joker (เห็น location ไม่มี role)
- Townsfolk (เห็น location + role)
- Countdown running

**Voting:**
- ยังไม่โหวต
- โหวตแล้ว (เปลี่ยนได้)
- โหวตครบ + รอ resolve
- Timeout

**Reveal:**
- Players win
- Spy wins
- Joker wins

## Interaction and Layout

**Hierarchy:** ข้อมูลสำคัญสุดอยู่กลางหน้า
**Topology:** Single screen per state ไม่ต้อง scroll
**Responsiveness:** Mobile-first, desktop ขยาย max-width
**Affordances:** ปุ่มใหญ่ สีชัด มี hover/active state
**Feedback:** Loading state ทุกการกระทำ, error message ชัดเจน
**Transitions:** Smooth state change ไม่ต้อง animation แพง

## Constraints

**Platform:** Web (Next.js + Tailwind)
**Localization:** ผสมไทย/อังกฤษ
**Framework:** Tailwind CSS
**Components:** Native HTML elements + minimal custom
**Font:** Inter (Google Fonts)
