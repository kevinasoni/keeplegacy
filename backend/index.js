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


/* ================= MULTER ================= */

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


/* ================= AUTH ROUTES ================= */

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


app.get("/", (req, res) => {
  res.send("API running");
});


module.exports = app;