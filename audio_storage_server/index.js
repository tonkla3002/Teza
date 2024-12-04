const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

// สร้างแอป Express
const app = express();

// Increase the payload limit to 1GB
app.use(bodyParser.json({ limit: '1gb' }));
app.use(express.json({ limit: '1gb' }));
app.use(cors());

// Other configurations remain the same
app.use(cors());


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Teza',
    password: '1234',
    port: 5433,
});


// const upload = multer({ storage: storage });

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware สำหรับตรวจสอบ API Key
const apiKeyMiddleware = async (req, res, next) => {
    const apiKey = req.header('x-api-key'); // รับ API Key จาก Header 'x-api-key'

    if (!apiKey) {
        return res.status(401).json({ error: 'API Key is required' });
    }

    try {
        // ตรวจสอบ API Key ในฐานข้อมูล
        const result = await pool.query('SELECT * FROM users WHERE api_key = $1', [apiKey]);

        if (result.rows.length > 0) {
            req.user = result.rows[0]; // เก็บข้อมูลผู้ใช้ที่ตรงกับ API Key
            console.log("Connect successes")
            next(); // ให้คำขอดำเนินการต่อ
        } else {
            res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


app.get('/',(req,res)=>{
    res.send("Hello World")
})


app.post('/api/generate-key', async (req, res) => {
    const { userId } = req.body; // รับ user ID จากคำขอ

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const newApiKey = generateApiKey();

    try {
        // บันทึก API Key ในฐานข้อมูล
        await pool.query('UPDATE users SET api_key = $1 WHERE id = $2', [newApiKey, userId]);
        res.json({ message: 'API Key generated successfully', apiKey: newApiKey });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/data', apiKeyMiddleware, (req, res) => {
    res.json({ message: 'Access granted to secure data!', user: req.user });
});


app.post('/upload-audio/admin', async (req, res) => {
    try {
        const { audioData, filename } = req.body; // รับ base64 data และชื่อไฟล์

        // แปลง base64 เป็นบัฟเฟอร์
        const audioBuffer = Buffer.from(audioData, 'base64');

        // บันทึกไฟล์ลงในโฟลเดอร์ uploads
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, audioBuffer);

        // บันทึกลง PostgreSQL
        const query = 'INSERT INTO audiofiles (filename, data) VALUES ($1, $2)';
        await pool.query(query, [filename, audioBuffer]);

        res.status(200).json({ message: 'Audio saved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error saving audio' });
    }
});


app.post('/upload-audio',apiKeyMiddleware, async (req, res) => {
    try {
        const { audioData, filename } = req.body; // รับ base64 data และชื่อไฟล์

        // แปลง base64 เป็นบัฟเฟอร์
        const audioBuffer = Buffer.from(audioData, 'base64');

        // บันทึกไฟล์ลงในโฟลเดอร์ uploads
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, audioBuffer);

        // บันทึกลง PostgreSQL
        const query = 'INSERT INTO audiofiles (filename, data) VALUES ($1, $2)';
        await pool.query(query, [filename, audioBuffer]);

        res.status(200).json({ message: 'Audio saved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error saving audio' });
    }
});

app.get('/files/showAll/admin', async (req, res) => {
    try {
        const result = await pool.query('SELECT id,filename FROM audiofiles ');

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        }

        
        res.send(result.rows);  // ส่งข้อมูลไฟล์เสียงกลับไป
    } catch (err) {
        res.status(500).json({ message: 'Error fetching file', error: err });
    }
});


app.get('/play-audio/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
  
      // ดึงข้อมูลไฟล์เสียงจาก PostgreSQL
      const query = 'SELECT data FROM audiofiles WHERE filename = $1';
      const result = await pool.query(query, [filename]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Audio file not found' });
      }
  
      // ดึงข้อมูลเสียงจากฐานข้อมูล
      const audioBuffer = result.rows[0].data;
  
      // ตั้งค่า header เพื่อบอกว่าเป็นไฟล์เสียง
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  
      // ส่งข้อมูลไฟล์เสียงกลับ
      res.send(audioBuffer);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error retrieving audio' });
    }
  });


app.get('/download-audio/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // ดึงข้อมูลไฟล์เสียงจาก PostgreSQL
        const query = 'SELECT data FROM audiofiles WHERE filename = $1';
        const result = await pool.query(query, [filename]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Audio file not found' });
        }

        // ดึงข้อมูลเสียงจากฐานข้อมูล (แบบ base64)
        const audioBuffer = result.rows[0].data;

        // ตั้งค่า header ให้ดาวน์โหลดไฟล์เป็นไฟล์เสียง
        res.setHeader('Content-Type', 'audio/wav');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // ส่งข้อมูลไฟล์เสียงให้ดาวน์โหลด
        res.send(audioBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving audio' });
    }
});


// เริ่มต้นเซิร์ฟเวอร์
app.listen(5555, () => {
    console.log('Server is running on port 5555');
});