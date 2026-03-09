# Discord Money Bot

บอท Discord สำหรับบันทึกรายรับรายจ่าย พร้อม dashboard, ห้อง log, แนบรูปหลักฐานผ่าน DM และ fallback ให้อัปโหลดในห้องเดิมได้ถ้า DM ส่งไม่สำเร็จ

## ฟีเจอร์
- `/setupmoney` สำหรับสร้าง dashboard
- `/setmoneylog` สำหรับตั้งห้อง log
- ปุ่มเพิ่มรายรับ / รายจ่าย / รีเฟรช dashboard
- กรอกข้อมูลผ่าน modal
- แนบรูปหลักฐานผ่าน DM กับบอท
- ถ้า DM ไม่ได้ ระบบจะแจ้ง error code จริง และมีปุ่มให้อัปโหลดรูปในห้องเดิมแทน
- เก็บข้อมูลใน PostgreSQL
- มี SQL migration สำหรับฐานข้อมูลเก่า
- พร้อม deploy บน Railway

## ติดตั้ง
```bash
npm install
cp .env.example .env
```

ใส่ค่าใน `.env`
```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
GUILD_ID=... # optional แต่แนะนำตอนทดสอบ
DATABASE_URL=...
PORT=3000
```

## ถ้าคุณใช้ฐานข้อมูลเก่า
โปรเจกต์นี้พยายาม migrate schema ให้อัตโนมัติตอน start อยู่แล้ว แต่ถ้าเคยเจอ error พวก `created_by`, `entry_date`, `proof_url` มาก่อน ให้รันไฟล์นี้ก่อน:

```bash
psql "DATABASE_URLของคุณ" -f sql/001_full_migration.sql
```

หรือคัดลอก SQL ในไฟล์ `sql/001_full_migration.sql` ไปรันใน PostgreSQL client ที่คุณใช้อยู่

## รัน
```bash
npm start
```

## สิ่งที่ต้องเปิดใน Discord Developer Portal
### OAuth2 Scopes
- bot
- applications.commands

### Bot Permissions
- View Channels
- Send Messages
- Use Slash Commands
- Attach Files
- Embed Links

### Privileged Gateway Intents
- Message Content Intent

## การใช้งาน
1. เชิญบอทเข้าเซิร์ฟเวอร์
2. ใช้ `/setupmoney`
3. ใช้ `/setmoneylog` เพื่อตั้งห้อง log
4. กดปุ่มเพิ่มรายรับ/รายจ่าย
5. ถ้าบอทส่ง DM ได้ ให้ส่งรูปใน DM หรือพิมพ์ `skip`
6. ถ้า DM ไม่ได้ บอทจะโชว์ code จริงและมีปุ่ม `อัปโหลดรูปในห้องนี้`

## Deploy บน Railway
- Push โปรเจกต์ขึ้น GitHub
- สร้างโปรเจกต์บน Railway จาก GitHub repo
- เพิ่ม PostgreSQL service
- ตั้งค่า environment variables ตาม `.env.example`
- Deploy
