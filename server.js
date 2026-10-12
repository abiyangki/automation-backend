const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

// ===== MONGODB =====
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected - OBBO Brain ONLINE"))
    .catch(e => console.log("DB Error:", e.message));
}

const Invoice = mongoose.model("Invoice", new mongoose.Schema({
  customer: String,
  amount: Number,
  date: { type: Date, default: Date.now }
}));

const Message = mongoose.model("Message", new mongoose.Schema({
  user: String,
  message: String,
  reply: String,
  date: { type: Date, default: Date.now }
}));

// ===== HOME =====
app.get("/", (req, res) => {
  res.json({ 
    message: "OBBO Brain ONLINE 🤖🌍", 
    brain: "Pakuwa AI Robot",
    status: "Africa Automation Engine - Ready",
    endpoints: ["/api/health", "/api/chat", "/api/dashboard/stats", "/workflow/invoice"]
  });
});

// ===== HEALTH =====
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ONLINE", 
    db: mongoose.connection.readyState === 1 ? "Connected" : "Not Connected",
    brain: "OBBO Pakuwa",
    launch: "60 days"
  });
});

// ===== CHAT =====
app.post("/api/chat", async (req, res) => {
  const { message, user } = req.body;
  let reply = `Salam ${user || 'Omera'}! I am OBBO - Pakuwa AI Robot 🤖\n\n`;
  
  if (!message) reply += "How can I help?";
  else if (message.toLowerCase().includes("obbo wu cho") || message.toLowerCase().includes("who are you")) {
    reply += "I am OBBO - Pakuwa AI Robot, built by Omera! My brain is hosted on Render, memory on MongoDB Atlas, mission: automate Africa in 60 days! 🚀";
  } else {
    reply += `You said: "${message}"\n\n✅ Brain: ONLINE\n✅ DB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Offline'}\n\nReady for East Africa launch!`;
  }

  if (process.env.MONGO_URI) {
    try { await Message.create({ user: user||"anon", message, reply }); } catch(e){}
  }

  res.json({ reply });
});

// ===== INVOICE WORKFLOW =====
app.post("/workflow/invoice", async (req, res) => {
  try {
    const { customer, amount } = req.body;
    if (!process.env.MONGO_URI) return res.json({ success: false, error: "No DB" });
    const inv = await Invoice.create({ customer, amount });
    res.json({ success: true, invoice: inv });
  } catch(e){ res.json({ success:false, error:e.message }); }
});

// ===== METER WEBHOOK =====
app.post("/webhook/meter", async (req, res) => {
  console.log("Meter data:", req.body);
  res.json({ success: true, received: req.body });
});

// ===== DASHBOARD API - NEW! =====
app.get("/api/dashboard/stats", async (req, res) => {
  try {
    const invoiceCount = process.env.MONGO_URI ? await Invoice.countDocuments() : 0;
    const messageCount = process.env.MONGO_URI ? await Message.countDocuments() : 0;
    const recentInvoices = process.env.MONGO_URI ? await Invoice.find().sort({date:-1}).limit(5) : [];
    
    res.json({
      brain: "ONLINE",
      db: mongoose.connection.readyState === 1 ? "Connected" : "No DB",
      invoices: invoiceCount,
      chats: messageCount,
      uptime: Math.floor(process.uptime()),
      launchDays: 60,
      meters: { active: 12, total: 20, regions: ["Kenya", "Tanzania", "Uganda", "Rwanda"] },
      recentInvoices
    });
  } catch(e){ res.json({ error: e.message }); }
});

app.get("/api/invoices", async (req, res) => {
  try {
    if (!process.env.MONGO_URI) return res.json([]);
    const invoices = await Invoice.find().sort({date:-1});
    res.json(invoices);
  } catch(e){ res.json([]); }
});

// ===== CHAT HISTORY =====
app.get("/api/chats", async (req, res) => {
  if (!process.env.MONGO_URI) return res.json([]);
  const chats = await Message.find().sort({date:-1}).limit(20);
  res.json(chats);
});

// ===== LAST LINE - MUST BE LAST! =====
app.listen(process.env.PORT || 10000, "0.0.0.0", () => {
  console.log("🤖 OBBO Brain ONLINE on Render - Africa Automation Engine Ready! 🌍");
});
