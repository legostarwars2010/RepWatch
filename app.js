// app.js - builds and exports the Express app
require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', apiRoutes);

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
