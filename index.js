const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-secret';
const DATA_SECRET = process.env.DATA_SECRET || 'user-data-secret';


/* ---------------- CREATE UPLOADS FOLDER IF NOT EXISTS ---------------- */

const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}


/* ---------------- STATIC UPLOADS ---------------- */

app.use("/uploads", express.static(uploadsDir));


/* ---------------- FILE UPLOAD SETUP ---------------- */

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }

});

const upload = multer({ storage });


/* ---------------- MongoDB ---------------- */

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/legacyDB')
.then(() => {

  console.log('MongoDB connected');

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

})
.catch(err => console.error(err));


/* ---------------- USER MODEL ---------------- */

const userSchema = new mongoose.Schema({

  name: String,
  email: { type: String, unique: true },
  passwordHash: String,

  reminderEnd: Date,

  reminderSent: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }

});

const User = mongoose.model('User', userSchema);


/* ---------------- BENEFICIARY MODEL ---------------- */

const beneficiarySchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  name: String,
  email: String

});

const Beneficiary = mongoose.model('Beneficiary', beneficiarySchema);


/* ---------------- MEDICAL INFO MODEL ---------------- */

const medicalSchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  doctorName: String,
  prescriptions: String,

  medicalReport: String,

  createdAt: { type: Date, default: Date.now }

});

const MedicalInfo = mongoose.model('MedicalInfo', medicalSchema);


/* ---------------- PRIVATE DATA MODEL ---------------- */

const userPrivateDataSchema = new mongoose.Schema({

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  encryptedData: String,

  updatedAt: { type: Date, default: Date.now }

});

const UserPrivateData = mongoose.model('UserPrivateData', userPrivateDataSchema);


/* ---------------- AUTH ---------------- */

const authMiddleware = (req, res, next) => {

  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = { id: decoded.id };

    next();

  } catch {

    res.status(401).json({ error: 'Invalid token' });

  }

};


/* ---------------- EMAIL SETUP ---------------- */

const transporter = nodemailer.createTransport({

  service: "gmail",

  auth: {

    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS

  }

});


const sendEmail = async (to, subject, text) => {

  try {

    await transporter.sendMail({

      from: process.env.EMAIL_USER,
      to,
      subject,
      text

    });

  } catch (err) {

    console.error("Email error:", err.message);

  }

};


/* ---------------- AUTH ROUTES ---------------- */

app.post('/api/auth/register', async (req, res) => {

  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });

  if (existing) return res.status(400).json({ error: 'Email exists' });

  const hash = await bcrypt.hash(password, 10);

  await new User({

    name,
    email,
    passwordHash: hash

  }).save();

  res.json({ message: 'Registered' });

});


app.post('/api/auth/login', async (req, res) => {

  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ error: 'Invalid' });

  const match = await bcrypt.compare(password, user.passwordHash);

  if (!match) return res.status(400).json({ error: 'Invalid' });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1d' });

  res.json({ token });

});


/* ---------------- MEDICAL INFO ROUTES ---------------- */

app.post("/api/medical-info",
authMiddleware,
upload.single("medicalReportsFile"),
async (req, res) => {

  try {

    const record = new MedicalInfo({

      userId: req.user.id,

      doctorName: req.body.doctorName,
      prescriptions: req.body.prescriptions,

      medicalReport: req.file ? req.file.filename : null

    });

    await record.save();

    res.json(record);

  } catch (err) {

    console.error(err);

    res.status(500).json({ error: "Upload failed" });

  }

});


app.get("/api/medical-info", authMiddleware, async (req, res) => {

  const records = await MedicalInfo.find({ userId: req.user.id });

  res.json(records);

});

app.delete("/api/medical-info/:id", authMiddleware, async (req, res) => {

  await MedicalInfo.deleteOne({
    _id: req.params.id,
    userId: req.user.id
  });

  res.json({ message: "Deleted" });

});

/* ---------------- DASHBOARD SUMMARY ---------------- */

app.get('/api/dashboard/summary', authMiddleware, async (req, res) => {

  const userId = req.user.id;

  const beneficiariesCount = await Beneficiary.countDocuments({ userId });

  const medicalInfoCount = await MedicalInfo.countDocuments({ userId });

  return res.status(200).json({

    medicalInfoCount,
    bankAccountsCount: 0,
    insuranceTypes: "0 Policies",
    personalDocsCount: 0,
    investmentsSummary: "No Investments",
    propertyCount: 0,
    childrenPlansCount: 0,
    taxDetailsSummary: "No Data",
    rationCardMembers: 0,
    cibilScoreStatus: "Not Available",
    consolidatedPortfolioSummary: "No Data",
    beneficiariesCount

  });

});


/* ---------------- BENEFICIARIES ---------------- */

app.post('/api/beneficiaries', authMiddleware, async (req, res) => {

  const { name, email } = req.body;

  const b = new Beneficiary({

    userId: req.user.id,
    name,
    email

  });

  await b.save();

  res.json({ message: "Added" });

});


app.get('/api/beneficiaries', authMiddleware, async (req, res) => {

  const list = await Beneficiary.find({ userId: req.user.id });

  res.json(list);

});


app.delete('/api/beneficiaries/:id', authMiddleware, async (req, res) => {

  await Beneficiary.deleteOne({ _id: req.params.id });

  res.json({ message: "Deleted" });

});


/* ---------------- REMINDER ---------------- */

app.post('/api/set-reminder', authMiddleware, async (req, res) => {

  const { days = 0, hours = 0, minutes = 0 } = req.body;

  const totalMs =
    (days * 24 * 60 * 60 * 1000) +
    (hours * 60 * 60 * 1000) +
    (minutes * 60 * 1000);

  if (totalMs <= 0) {
    return res.status(400).json({ error: "Invalid time" });
  }

  const endTime = new Date(Date.now() + totalMs);

  const user = await User.findById(req.user.id);

  user.reminderEnd = endTime;
  user.reminderSent = false;

  await user.save();

  res.json({ message: "Reminder set" });

});


/* ---------------- CRON JOB ---------------- */

cron.schedule("* * * * *", async () => {

  const now = new Date();

  try {

    const users = await User.find({
      reminderEnd: { $ne: null },
      reminderSent: false
    });

    for (let user of users) {

      if (now >= user.reminderEnd) {

        const beneficiaries = await Beneficiary.find({ userId: user._id });

        for (let b of beneficiaries) {

          if (b.email) {

            await sendEmail(
              b.email,
              "⏰ Reminder Alert",
              `Hello ${b.name}, reminder from ${user.email} has ended.`
            );

          }

        }

        user.reminderSent = true;
        user.reminderEnd = null;

        await user.save();

      }

    }

  } catch (err) {

    console.error("Cron error:", err.message);

  }

});


/* ---------------- USER DATA ---------------- */

app.post('/api/user-data', authMiddleware, async (req, res) => {

  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(req.body.data),
    DATA_SECRET
  ).toString();

  await UserPrivateData.findOneAndUpdate(

    { userId: req.user.id },

    { encryptedData: encrypted, updatedAt: new Date() },

    { upsert: true }

  );

  res.json({ success: true });

});


app.get('/api/user-data', authMiddleware, async (req, res) => {

  const record = await UserPrivateData.findOne({ userId: req.user.id });

  if (!record) return res.json(null);

  const bytes = CryptoJS.AES.decrypt(record.encryptedData, DATA_SECRET);

  const data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

  res.json(data);

});


/* ---------------- GEMINI AI ---------------- */

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

app.post('/api/ai-chat', async (req, res) => {

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ response: "AI not configured" });
  }

  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const result = await model.generateContent(req.body.message);

  res.json({ response: result.response.text() });

});


/* ---------------- ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {

  console.error("Global Error:", err.stack);

  res.status(500).json({ error: "Something broke!" });

});


/* ---------------- ROOT ---------------- */

app.get('/', (req, res) => {

  res.send('Backend running');

});