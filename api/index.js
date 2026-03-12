const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const nodemailer = require('nodemailer');
const multer = require('multer');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const DATA_SECRET = process.env.DATA_SECRET || 'secret';


/* ================= MONGODB ================= */

let isConnected = false;

async function connectDB() {

  if (isConnected) return;

  if (!process.env.MONGO_URI) {
    throw new Error("Mongo missing");
  }

  await mongoose.connect(process.env.MONGO_URI);

  isConnected = true;
}


/* ================= MULTER (VERCEL SAFE) ================= */

const storage = multer.memoryStorage();
const upload = multer({ storage });


/* ================= MODELS ================= */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String,
  createdAt: { type: Date, default: Date.now }
});

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);


const beneficiarySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  email: String
});

const Beneficiary =
  mongoose.models.Beneficiary ||
  mongoose.model("Beneficiary", beneficiarySchema);


const medicalSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  doctorName: String,
  prescriptions: String,
  medicalReport: String
});

const MedicalInfo =
  mongoose.models.MedicalInfo ||
  mongoose.model("MedicalInfo", medicalSchema);


const privateSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  encryptedData: String
});

const UserPrivateData =
  mongoose.models.UserPrivateData ||
  mongoose.model("UserPrivateData", privateSchema);


/* ================= AUTH ================= */

const authMiddleware = (req, res, next) => {

  const token =
    req.headers.authorization?.split(" ")[1];

  if (!token)
    return res.status(401).json({ error: "No token" });

  try {

    const decoded =
      jwt.verify(token, JWT_SECRET);

    req.user = { id: decoded.id };

    next();

  } catch {

    res.status(401).json({ error: "Invalid token" });

  }
};


/* ================= EMAIL ================= */

const transporter = nodemailer.createTransport({

  service: "gmail",

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }

});


/* ================= AUTH ================= */

app.post("/api/auth/register", async (req, res) => {

  await connectDB();

  const { name, email, password } = req.body;

  const existing =
    await User.findOne({ email });

  if (existing)
    return res.json({ error: "Exists" });

  const hash =
    await bcrypt.hash(password, 10);

  await new User({
    name,
    email,
    passwordHash: hash
  }).save();

  res.json({ message: "Registered" });

});


app.post("/api/auth/login", async (req, res) => {

  await connectDB();

  const { email, password } = req.body;

  const user =
    await User.findOne({ email });

  if (!user)
    return res.json({ error: "Invalid" });

  const ok =
    await bcrypt.compare(
      password,
      user.passwordHash
    );

  if (!ok)
    return res.json({ error: "Invalid" });

  const token =
    jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

  res.json({ token });

});


/* ================= MEDICAL ================= */

app.post(
  "/api/medical-info",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {

    await connectDB();

    const record =
      new MedicalInfo({

        userId: req.user.id,

        doctorName: req.body.doctorName,
        prescriptions: req.body.prescriptions,

        medicalReport:
          req.file?.originalname || null
      });

    await record.save();

    res.json(record);

  }
);


app.get(
  "/api/medical-info",
  authMiddleware,
  async (req, res) => {

    await connectDB();

    const data =
      await MedicalInfo.find({
        userId: req.user.id
      });

    res.json(data);

  }
);


/* ================= BENEFICIARY ================= */

app.post(
  "/api/beneficiaries",
  authMiddleware,
  async (req, res) => {

    await connectDB();

    await new Beneficiary({

      userId: req.user.id,
      name: req.body.name,
      email: req.body.email

    }).save();

    res.json({ ok: true });

  }
);


app.get(
  "/api/beneficiaries",
  authMiddleware,
  async (req, res) => {

    await connectDB();

    const list =
      await Beneficiary.find({
        userId: req.user.id
      });

    res.json(list);

  }
);


/* ================= USER DATA ================= */

app.post(
  "/api/user-data",
  authMiddleware,
  async (req, res) => {

    await connectDB();

    const encrypted =
      CryptoJS.AES.encrypt(
        JSON.stringify(req.body),
        DATA_SECRET
      ).toString();

    await UserPrivateData.findOneAndUpdate(
      { userId: req.user.id },
      { encryptedData: encrypted },
      { upsert: true }
    );

    res.json({ ok: true });

  }
);


/* ================= AI ================= */

const gemini =
  new GoogleGenerativeAI(
    process.env.GEMINI_API_KEY || ""
  );

app.post("/api/ai-chat", async (req, res) => {

  if (!process.env.GEMINI_API_KEY)
    return res.json({ response: "No key" });

  const model =
    gemini.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

  const r =
    await model.generateContent(
      req.body.message
    );

  res.json({
    response:
      r.response.text()
  });

});


app.get("/", (req, res) => {
  res.send("API running");
});

const app = require("../backend/index");

module.exports = app;