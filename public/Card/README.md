# Card Artwork

## Naming Convention

All artwork files follow the pattern:

```
<CardID>-<locale>.<extension>
```

Where:
- `CardID` is the unique card identifier (e.g. `A001`, `S002`, `W003`, `X004`)
- `locale` is one of: `th` (Thai) or `en` (English)
- `extension` is the original file extension (e.g. `.png`)

### Examples

- `A001-th.png` — Thai artwork for Playful Dog (A001)
- `A001-en.png` — English artwork for Playful Dog (A001)

## Bilingual Card IDs Covered (24 of 24)

| ID   | Thai name       | English name    |
|------|-----------------|-----------------|
| A001 | สุนัขจอมซน      | Playful Dog     |
| A002 | แมวขี้สงสัย      | Curious Cat     |
| A003 | กระต่ายว่องไว    | Swift Rabbit    |
| A004 | หมีใจดี          | Gentle Bear     |
| A005 | นกส่งข่าว        | Messenger Bird  |
| A006 | ปลาจอมพลัง       | Energetic Fish  |
| A007 | เต่าเกราะแข็ง    | Armored Turtle  |
| A008 | ลิงจอมเจ้าเล่ห์   | Clever Monkey   |
| S001 | กระดูกแสนอร่อย    | Delicious Bone  |
| S002 | ไหมพรมหลากสี     | Colorful Yarn   |
| S003 | แครอทสด          | Fresh Carrot    |
| S004 | น้ำผึ้งหวาน       | Sweet Honey     |
| S005 | เมล็ดพืชชั้นดี    | Premium Seeds   |
| S006 | อาหารปลาพิเศษ    | Special Fish Food |
| W001 | ที่ครอบปาก         | Muzzle          |
| W002 | เลเซอร์พอยน์เตอร์  | Laser Pointer   |
| W003 | กับดักบนพื้น      | Ground Trap     |
| W004 | กรงนก            | Bird Cage       |
| W005 | เบ็ดตกปลา        | Fishing Hook    |
| X001 | เพลงกล่อมหลับ    | Lullaby         |
| X002 | เกราะป้องกันจุดอ่อน | Weakness Shield |
| X003 | เปลี่ยนตัวด่วน    | Quick Swap      |
| X004 | ลมแรงพัดปลิว     | Strong Wind     |
| X005 | ขโมยอาหาร        | Food Thief      |

## Missing Artwork

All 24 Card IDs now have bilingual artwork.

## Supported Locales

- `th` — Thai
- `en` — English

## Fallback Behavior

When loading card artwork, the following fallback order is used:

1. Requested locale image (e.g. `A001-en.png`)
2. Alternate locale image (e.g. `A001-th.png`)
3. Generic card-artwork placeholder (CSS fallback)
