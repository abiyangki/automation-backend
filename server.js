const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("Automation Backend is running");
});

// Example workflow endpoint
app.post("/invoice", (req, res) => {
  const data = req.body;

  // Simple example response
  res.json({
    message: "Invoice generated successfully",
    input: data
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Server running on port " + port);
});
