const express = require("express");
const router = express.Router();
const { getAllReps } = require("../models/reps");

// GET /api/reps
router.get("/reps", async (req, res) => {
  try {
    const reps = await getAllReps();
    res.json(reps);
  } catch (err) {
    console.error("Error fetching reps:", err);
    res.status(500).json({ error: "Failed to fetch representatives" });
  }
});

module.exports = router;
