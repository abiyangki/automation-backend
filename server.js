const express = require("express");
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

app.use(express.json());

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server running on port", process.env.PORT || 3000);
});
