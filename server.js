const express = require("express");
const mongoose = require("mongoose");
const app = express();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

const Invoice = mongoose.model("Invoice", {
  customer: String,
  amount: Number,
  currency: String,
  date: Date
});

app.get("/workflow/invoice", async (req, res) => {
  const invoice = new Invoice({
    customer: "Test Customer",
    amount: 100,
    currency: "USD",
    date: new Date()
  });

  await invoice.save();

  res.json({
    status: "success",
    message: "Invoice saved to database",
    invoice
  });
});

app.listen(3000, () => console.log("Server running on port 3000"));


app.use(express.json());

app.post("/workflow/invoice", async (req, res) => {
  try {
    const { customer, amount, currency, date } = req.body;

    const invoice = new Invoice({
      customer,
      amount,
      currency,
      date: date ? new Date(date) : new Date()
    });

    await invoice.save();

    res.json({
      status: "success",
      message: "Invoice saved to database",
      invoice
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to save invoice",
      error: err.message
    });
  }
});





