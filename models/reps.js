
const { pool } = require("../db/pool");

// Fetch all representatives
async function getAllReps() {
  const result = await pool.query("SELECT * FROM representatives ORDER BY id");
  return result.rows;
}

module.exports = {
  getAllReps
};

// copilot remove all the instances of pool in this code and change them to reference pool.js
