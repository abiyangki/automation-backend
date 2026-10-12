const express = require("express");
const mongoose = require("mongoose");
const app = express();

// FIX 1: json middleware FIRST
app.use(express.json());

// FIX 2: Mongo connect but don't crash if missing
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected - OBBO Brain DB online"))
    .catch(err => console.log("MongoDB error:", err.message));
} else {
  console.log("No MONGO_URI - Running without DB - OK for test");
}

const Invoice = mongoose.model("Invoice", {
  customer: String,
  amount: Number,
  currency: String,
  date: Date
});

// Root - To test Render alive
app.get("/", (req, res) => {
  res.send("OBBO Brain - Pakuwa AI Robot - ONLINE - NPM Render - 60 days to East Africa!");
});

// Your invoice route - FIXED
app.get("/workflow/invoice", async (req, res) => {
  try {
    if (!process.env.MONGO_URI) {
      return res.json({ status: "no_db", message: "Add MONGO_URI in Render Env to save" });
    }
    const invoice = new Invoice({
      customer: "Test Customer",
      amount: 100,
      currency: "USD",
      date: new Date()
    });
    await invoice.save();
    res.json({ status: "success", message: "Invoice saved", invoice });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// NEW: OBBO Brain Webhook for meter
app.post("/webhook/meter", (req, res) => {
  console.log("Meter data:", req.body);
  res.json({ status: "OBBO Brain received meter", data: req.body });
});

app.listen(process.env.PORT || 10000, "0.0.0.0", () => {
  console.log("Server running on port", process.env.PORT || 10000);
});
