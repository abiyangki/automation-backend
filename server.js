// =========================
//  BASIC EXPRESS SETUP
// =========================
const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json());

// =========================
//  MONGODB CONNECTION
// =========================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB error:", err));

// =========================
//  INVOICE MODEL
// =========================
const Invoice = mongoose.model("Invoice", {
  customer: String,
  amount: Number,
  currency: String,
  date: Date,
});

// =========================
//  TEST ROUTE
//  (Creates an invoice)
// =========================
app.get("/workflow/invoice", async (req, res) => {
  try {
    const invoice = new Invoice({
      customer: "Test Customer",
      amount: 100,
      currency: "USD",
      date: new Date(),
    });

    await invoice.save();

    res.json({
      status: "success",
      message: "Invoice saved to database",
      invoice,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to save invoice",
      error: error.message,
    });
  }
});

// =========================
//  START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

