const express = require("express");
const { initDb } = require("./db/init");
const apiRoutes = require("./routes/api");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Root test
app.get("/", (req, res) => res.send("RepWatch API is live"));

// Register routes
app.use("/api", apiRoutes);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  await initDb();
});

console.log("DB URL:", process.env.DATABASE_URL);

