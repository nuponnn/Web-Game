# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

ผู้เล่น 3-8 คน ที่ต้องการเล่นเกมSpy-style deduction game บนเว็บ ทั้งกลุ่มเพื่อน/ครอบครัว (สร้างห้องแล้วชวนคนรู้จัก) และ online community (หาห้องเล่นกับคนทั่วไป) ผู้เล่นหลักใช้มือถือหรือคอมพิวเตอร์ ไม่ต้องติดตั้งแอป

## Product Purpose

เป็น web-based party game สำหรับการเล่น Spyfall บนบราวเซอร์ ทำให้กลุ่มเพื่อนหรือคนออนไลน์สามารถสร้างห้องและเริ่มเล่นได้ภายในไม่กี่วินาที โดยไม่ต้องดาวน์โหลดหรือสมัครสมาชิก

## Positioning

Firebase-powered real-time multiplayer ที่สร้างห้องได้ทันที ไม่ต้องรอmatchmaking ไม่มีโฆษณา ไม่ต้องสมัคร แค่ตั้งชื่อแล้วกดสร้างห้อง เหมาะกับการเล่นชั่วคราวกับกลุ่มคนที่อยู่ด้วยกัน

## Operating Context

- ผู้เล่น login แบบ anonymous ไม่ต้องสมัคร
- Host สร้างห้องได้ 4 ตัวอักษร (เช่น A7KQ) แล้วชวนคนอื่นเข้ามาด้วยรหัส
- Host กำหนด game settings: จำนวน Spy, จำนวน Joker, เวลาหา Spy, เวลาโหวต
- ห้องจะถูกลบอัตโนมัติเมื่อ host หลุด หรือไม่มีผู้เล่นออนไลน์ หรือค้างเกิน 6 ชม.
- Admin จัดการ locations (สถานที่) ผ่านหน้า /admin
- Backend: Firebase Realtime Database + Callable Functions

## Capabilities and Constraints

**ทำได้แล้ว:**
- สร้าง/เข้าห้องด้วยรหัส 4 ตัว
- โหวตเลือก Spy/Joker/Townsfolk
- Joker role (0-5 คน) — ต้องโดนโหวตออกถึงชนะ
- ระบบ room cleanup อัตโนมัติ
- Admin จัดการ locations dynamic

**ยังไม่ได้ทำ:**
- Leave room (manual) สำหรับผู้เล่นที่อยากออกจากห้องโดยไม่ต้องปิด tab
- Loading skeleton / error boundary
- Metadata ชื่อเกม (ยังเป็น "Create Next App")
- Tailwind classes จริงจัง (ตอนนี้ใช้ inline style)
- ไม่มี design system

**Constraints:**
- ผู้เล่นสูงสุด 8 คนต่อห้อง
- ต้องมีผู้เล่นอย่างน้อย 3 คนถึงเริ่มเกมได้
- Anonymous auth เท่านั้น (ไม่ต้องสมัคร)

## Brand Commitments

ไม่มี brand identity ตอนนี้ ต้องการออกแบบ UI ใหม่ทั้งหมด

## Evidence on Hand

- โค้ดที่ทำงานได้จริงทุก flow (create/join/start/vote/reveal/playAgain)
- `SPYFALL_FLOW.md` — เอกสาร flow ละเอียด 695 บรรทัด
- Firebase emulator พร้อมทดสอบ
- Admin panel ที่ /admin

## Product Principles

1. ความเร็วในการเริ่มเกมสำคัญที่สุด — ต้องสร้างห้องและเริ่มเล่นได้ภายใน 10 วินาที
2. ไม่ต้องสมัคร ไม่ต้องดาวน์โหลด — เปิดเว็บก็เล่นได้เลย
3. ข้อมูลลับของผู้เล่นต้องปลอดภัย — spy อ่านข้อมูลคนอื่นไม่ได้แม้ผ่าน DevTools
4. ห้องจะหายไปเองเมื่อไม่มีคน — ไม่ต้องมานั่งลบมือ

## Accessibility & Inclusion

ไม่มี requirements เฉพาะ แต่ UI ควรใช้งานได้ทั้งมือถือและคอม
