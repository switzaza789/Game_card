ANIMAL SCORE CARD GAME — Prototype v0.3
ชุดส่งมอบสำหรับเริ่มพัฒนาเกมจริง

ไฟล์หลัก
1. Animal_Score_Card_Database_v0.3.xlsx
   - Source of Truth ของการ์ด 24 ใบ
   - Game Rules
   - Status Effects
   - DB Schema Reference

2. cards_seed.json
   - ข้อมูลการ์ดสำหรับ Import เข้า Backend/Frontend

3. game_config.json
   - ค่ากติกาหลัก เช่น Deck Size, Score, Turn Phase

4. prototype_schema.sql
   - SQLite Schema สำหรับ Prototype

5. prototype.sqlite
   - ฐานข้อมูลพร้อมตาราง cards และ Seed การ์ดครบ 24 ใบ

6. battle_wireframe.html
   - Wireframe Responsive เปิดได้โดยดับเบิลคลิก
   - มี Interaction ตัวอย่างเล็กน้อย

7. battle_wireframe.png
   - Preview Layout สำหรับทีมออกแบบและโปรแกรมเมอร์

ลำดับพัฒนาที่แนะนำ
A. โหลด game_config.json และ cards_seed.json
B. สร้าง Match State ใน Server
C. ทำ Turn State Machine: READY > DRAW > SCORE > ACTION > END
D. ทำ Server Validation ทุก Action
E. ทำหน้าจอตาม battle_wireframe.html
F. เริ่มจาก Local Hot-seat ก่อน แล้วค่อยเพิ่ม Online PvP
