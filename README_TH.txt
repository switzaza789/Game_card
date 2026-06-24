ANIMAL SCORE CARD GAME - v0.3.0-prototype

เกมการ์ด Local Hot-seat สำหรับผู้เล่น 2 คนบนเครื่องเดียวกัน

วิธีติดตั้งและรันในเครื่อง
1. npm ci
2. npm run dev
3. เปิด URL ที่ Vite แสดงใน browser

คำสั่งตรวจสอบ
- npm run lint
- npm test
- npm run test:coverage
- npm run build
- npm audit --audit-level=moderate

Production preview
1. npm run build
2. npm run preview
3. เปิด URL ที่ Vite preview แสดงใน browser

GitHub Pages deployment
- มี workflow ที่ .github/workflows/deploy-pages.yml
- Workflow ทำงานเมื่อ push เข้า main หรือสั่ง workflow_dispatch
- Workflow ใช้ npm ci, lint, test และ build ก่อน deploy dist ด้วย official GitHub Pages actions
- ตั้งค่า Vite production base เป็น /Game_card/
- URL สาธารณะที่คาดไว้หลังเปิดใช้ GitHub Pages คือ https://switzaza789.github.io/Game_card/
- เอกสารนี้ยังไม่ยืนยันว่า URL สาธารณะเปิดใช้งานแล้ว ต้องตรวจหลัง workflow สำเร็จบน GitHub

วิธีเล่นโดยย่อ
1. ผู้เล่น 1 และผู้เล่น 2 สลับกันเล่นบนอุปกรณ์เดียวกัน
2. แต่ละฝ่ายมี Deck 24 ใบ มือเริ่มต้น 5 ใบ และ Animal Zone 3 ช่อง
3. ใน Action Phase ลง Animal ได้ 1 ครั้ง และใช้ Utility ได้ 1 ครั้ง
4. Support, Weakness, Special และ Recycle ใช้สิทธิ์ Utility ร่วมกัน
5. Animal ที่อยู่บนสนามทำคะแนนตาม Level ใน Score Phase
6. ผู้เล่นที่ถึง 15 คะแนนก่อนชนะ หากครบ Turn Limit ให้ตัดสินตาม tiebreaker
7. หน้าจอส่งเครื่องจะซ่อนมือก่อนให้อีกฝ่ายเล่น

Local Storage
- เกมที่ยังไม่จบจะถูกบันทึกใน Local Storage ของ browser
- เซฟผูกกับ browser และอุปกรณ์นั้น ไม่ sync ข้ามเครื่อง
- การล้าง cache/site data ของ browser อาจลบเซฟและประวัติได้
- ไม่มีการเก็บชื่อ อีเมล บัญชีผู้ใช้ หรือข้อมูลส่วนตัว

การล้างเซฟ
- ใช้ปุ่มลบเซฟจากเมนูหลักเมื่อมีเกมค้าง
- ใช้ปุ่มรีเซ็ตเกมระหว่าง match เพื่อกลับเมนูและลบ active save
- ใช้ปุ่มลบประวัติทั้งหมดในหน้าประวัติการเล่นเพื่อล้าง match history

Export และ Import
- ส่งออกไฟล์เซฟเพื่อเก็บ match log เป็น JSON
- นำเข้า JSON เพื่อ resume/debug match ใน browser เดิมหรือ browser อื่น
- ถ้า Clipboard API ถูกบล็อก เกมจะแสดงกล่อง JSON ให้คัดลอกเอง
- Import ใช้ runtime validator และปฏิเสธ JSON ที่เสียหรือ schema ไม่ตรง

Playtest Feedback
- เมื่อ match จบแล้ว สามารถกดส่งออกฟีดแบ็ก Playtest
- Rating ทุกช่องเป็น optional และต้องเป็นจำนวนเต็ม 1-5
- ช่องข้อความเป็น optional
- ไม่มีการส่งข้อมูลอัตโนมัติ ไม่มี network request และไม่มี analytics
- JSON จะอยู่ในเครื่องจนกว่าผู้ใช้จะคัดลอกหรือส่งออกเอง

สถานะ Phase 7
- Deployment configuration complete
- GitHub Pages activation pending
- Public deployment verified: not yet verified in this environment
- Playtest guide, report template, and GitHub issue templates added
- Playtest feedback JSON export added

Known limitations
- ใช้ placeholder art แทนภาพการ์ดจริง
- ยังไม่มี animation ซับซ้อน
- Save เป็น browser-device-only
- ไม่มี backend, login, cloud database, online PvP, AI opponent, blockchain, NFT หรือ wallet
- การ verify URL สาธารณะของ GitHub Pages ต้องทำหลัง workflow สำเร็จบน GitHub
