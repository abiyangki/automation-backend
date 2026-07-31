const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

const mongoose = require("mongoose");

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

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("Automation Backend is running");
});

// Invoice workflow endpoint
app.get("/workflow/invoice", (req, res) => {
  res.json({
    status: "success",
    message: "Invoice workflow endpoint is working",
    invoice: {
      id: "INV-001",
      customer: "Test Customer",
      amount: 100,
      currency: "USD",
      date: new Date().toISOString()
    }
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
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



