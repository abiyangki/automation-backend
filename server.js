const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();

// FIXES
app.use(express.json());
app.use(cors({ origin: "*" })); // Allow frontend

// MongoDB
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected - OBBO Brain DB online"))
    .catch(err => console.log("MongoDB error:", err.message));
}

// Models
const Invoice = mongoose.model("Invoice", {
  customer: String, amount: Number, currency: String, date: Date
});

const Message = mongoose.model("Message", {
  user: String, text: String, reply: String, date: { type: Date, default: Date.now }
});

// Root
app.get("/", (req, res) => {
  res.send("OBBO Brain - Pakuwa AI Robot - ONLINE - NPM Render - 60 days to East Africa! 🧠✅");
});

// Invoice
app.get("/workflow/invoice", async (req, res) => {
  try {
    if (!process.env.MONGO_URI) return res.json({ status: "no_db" });
    const invoice = new Invoice({ customer: "Test Customer", amount: 100, currency: "USD", date: new Date() });
    await invoice.save();
    res.json({ status: "success", invoice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Meter Webhook
app.post("/webhook/meter", (req, res) => {
  console.log("Meter:", req.body);
  res.json({ status: "OBBO Brain received meter", data: req.body });
});

// ===== NEW: OBBO CHAT BRAIN =====
app.post("/api/chat", async (req, res) => {
  const { message, text, user } = req.body;
  const userMsg = message || text || "Salam";
  
  console.log(`OBBO Chat from ${user || 'Omera'}: ${userMsg}`);
  
  // Simple OBBO Brain Logic - Replace with OpenAI later if you want
  let reply = "";
  const lower = userMsg.toLowerCase();
  
  if (lower.includes("salam") || lower.includes("hello") || lower.includes("hi")) {
    reply = "Wa Aleikum Salam Omera! 🌍 I am OBBO - Pakuwa AI Robot - ONLINE! How can I help you today? 60 days to East Africa launch!";
  } else if (lower.includes("invoice")) {
    reply = "I can handle invoices! Use /workflow/invoice endpoint or tell me customer details and I will create it for you.";
  } else if (lower.includes("meter") || lower.includes("africa")) {
    reply = "Africa Automation Engine is ACTIVE! Meter webhook is at /webhook/meter - Ready for East Africa!";
  } else if (lower.includes("who are you") || lower.includes("obbo")) {
    reply = "I am OBBO - Pakuwa AI Robot, built by Omera! My brain is hosted on Render, memory on MongoDB Atlas, mission: automate Africa in 60 days! 🚀";
  } else {
    reply = `OBBO Brain received: "${userMsg}" — I am online and learning! Tell me how I can help with Africa Automation?`;
  }
  
  // Save to DB if available
  if (process.env.MONGO_URI) {
    try { await new Message({ user: user || "Omera", text: userMsg, reply }).save(); } catch(e){}
  }
  
  res.json({ reply, response: reply, status: "success" });
});

// Health
app.get("/api/health", (req, res) => res.json({ status: "ONLINE", brain: "Pakuwa AI Robot", days: 60 }));

app.listen(process.env.PORT || 10000, "0.0.0.0", () => {
  console.log("OBBO Brain running on", process.env.PORT || 10000);
});
