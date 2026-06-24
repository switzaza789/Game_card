ANIMAL SCORE CARD GAME - Prototype v0.3

เกมการ์ด Local Hot-seat สำหรับผู้เล่น 2 คนบนเครื่องเดียวกัน

วิธีติดตั้งและรัน
1. npm install
2. npm run dev
3. เปิด URL ที่ Vite แสดงใน browser

คำสั่งตรวจสอบ
- npm run lint
- npm test
- npm run test:coverage
- npm run build
- npm audit --audit-level=moderate

วิธีเล่นโดยย่อ
1. ผู้เล่น 1 และผู้เล่น 2 สลับกันเล่นบนอุปกรณ์เดียวกัน
2. แต่ละฝ่ายมี Deck 24 ใบ มือเริ่มต้น 5 ใบ และ Animal Zone 3 ช่อง
3. ใน Action Phase ลง Animal ได้ 1 ครั้ง และใช้ Utility ได้ 1 ครั้ง
4. Support, Weakness, Special และ Recycle ใช้สิทธิ์ Utility ร่วมกัน
5. Animal ที่อยู่บนสนามทำคะแนนตาม Level ใน Score Phase
6. ผู้เล่นที่ถึง 15 คะแนนก่อนชนะ หากครบ Turn Limit ให้ตัดสินตาม tiebreaker
7. หน้าจอส่งเครื่องจะซ่อนมือก่อนให้อีกฝ่ายเล่น

ระบบบันทึกเกม
- เกมที่ยังไม่จบจะถูกบันทึกใน Local Storage ของ browser
- สามารถเล่นต่อ ลบเซฟ รีเซ็ตเกม ดูประวัติการแข่งขัน ส่งออก log JSON และนำเข้า log JSON เพื่อ debug ได้
- ไม่มีการเก็บข้อมูลส่วนบุคคล ไม่มี cloud และไม่มีระบบบัญชีผู้ใช้

สถานะ QA Phase 6
- Lint ผ่าน
- Test ผ่าน
- Coverage ผ่าน
- Production build ผ่าน
- npm audit ผ่านระดับ moderate
- ตรวจแล้วว่าไม่มี direct Local Storage นอก persistence layer ใน production code
- ตรวจแล้วว่า production engine ไม่มี Date.now() หรือ new Date()
- ตรวจแล้วว่าไม่มีระบบต้องห้าม เช่น blockchain, wallet, login, backend, cloud, online PvP หรือ AI

Known limitations
- ใช้ placeholder art แทนภาพการ์ดจริง
- ยังไม่มี animation ซับซ้อน
- Export ใช้ Clipboard API ถ้า browser บล็อก จะเปิดกล่อง JSON ให้คัดลอกเอง
- การตรวจ responsive และ complete match flow ทำด้วย automated regression และ manual code/UI review ในสภาพแวดล้อมนี้
