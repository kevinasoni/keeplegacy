const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  if (!process.env.MONGO_URI) {
    throw new Error("Mongo missing");
  }

  await mongoose.connect(process.env.MONGO_URI);

  isConnected = true;
}

app.get("/", async (req, res) => {
  await connectDB();
  res.send("API running");
});

module.exports = app;