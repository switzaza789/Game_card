ANIMAL SCORE CARD GAME - v0.3.0-prototype

เกมการ์ด Local Hot-seat สำหรับผู้เล่น 2 คนบนเครื่องเดียวกัน

โหมดการเล่น
- Local PvP: โหมดเดิมสำหรับผู้เล่น 2 คนสลับกันเล่นบนเครื่องเดียวกัน มีหน้าจอส่งเครื่องเพื่อซ่อนมือของอีกฝ่าย
- PvE vs Computer: ผู้เล่นมนุษย์เป็น P1 และคอมพิวเตอร์ Normal AI เป็น P2 ไม่มีหน้าจอส่งเครื่องก่อนตา AI

Normal AI เป็น heuristic แบบกำหนดตายตัว ไม่ใช่ machine learning และไม่ได้ใช้ออนไลน์เซอร์วิสใด ๆ AI ส่งคำสั่งผ่าน engine, validator, reducer, effect, RNG และ log เดียวกับผู้เล่นมนุษย์ จึงไม่แก้ state โดยตรงและไม่ข้ามกติกา

AI เห็นเฉพาะข้อมูลที่ใช้เล่นได้อย่างยุติธรรม เช่น มือของตัวเอง สนาม สุสาน คะแนน สถานะสาธารณะ และการ์ดบนบอร์ดของคู่ต่อสู้ AI ไม่ใช้ตัวตนการ์ดในมือ P1, ลำดับ deck ของ P1, หรือผล RNG ในอนาคตเพื่อเลือก action

ระบบวิวัฒนาการ
- Animal ลงสนามที่ Level 1
- Support ที่ตรงชนิดยังคงอัปเกรด Animal เป็น Level 2 ตามกติกาเดิม
- Animal Level 2 ที่ทำคะแนนสำเร็จใน SCORE phase ของเจ้าของจะได้แต้มวิวัฒนาการ 1 แต้ม
- เมื่อครบ 2 แต้ม Animal จะวิวัฒนาการเป็น Level 3 หลังคิดคะแนนรอบนั้นเสร็จ คะแนน Level 3 จะเริ่มมีผลใน SCORE phase ถัดไป
- Animal ที่ออกจากสนาม เช่น กลับขึ้นมือ ถูกแทนที่ ถูกสลับ หรือลงสุสาน จะเสียแต้มวิวัฒนาการทั้งหมด
- ถ้าคะแนนถูกข้ามหรือถูกป้องกันจนไม่ได้คะแนน จะไม่ได้แต้มวิวัฒนาการ

วิธีเริ่ม PvE: ที่เมนูหลักเลือก "PvE vs Computer / Normal AI" เกมจะเริ่มที่ P1 ก่อน เมื่อ P1 จบเทิร์น ระบบจะแสดงสถานะ "AI Turn" และให้ P2 เล่นอัตโนมัติ จากนั้นกลับมาที่ P1

Save/Resume: เซฟที่เป็น PvE จะบันทึก gameMode ไปพร้อม active match ถ้าโหลดเซฟเก่าที่ไม่มี gameMode ระบบจะถือว่าเป็น Local PvP เพื่อความเข้ากันได้ย้อนหลัง ถ้า resume ตอนเป็นตา AI ระบบจะเล่นต่ออัตโนมัติโดยมี guard กัน loop ซ้ำ

ข้อจำกัดที่ทราบ: Normal AI เน้นตัดสินใจแบบ heuristic เช่น ชนะทันทีถ้าทำได้ กันคู่ต่อสู้ทำคะแนน ใช้ Support/Weakness ที่คุ้มค่า และ recycle เมื่อไม่มี action ดี ๆ จึงยังไม่ใช่ AI ขั้นสูงหรือ adaptive

Simulation: คำสั่ง npm run playtest:pve100 รัน PvE 100 match เพื่อเช็กเสถียรภาพและ stuck state เท่านั้น ไม่ใช่หลักฐานสรุป balance สำหรับมนุษย์

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
- npm run playtest:pve100

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
