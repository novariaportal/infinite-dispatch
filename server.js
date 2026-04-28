const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fetch the secret key from the server environment
const IF_API_KEY = process.env.IF_API_KEY;

// Mock Database (We will swap this for a real database later)
const users = {};
// Tracker memory for Autopilot Plus Session Stitching
const activeFlights = {}; 

// 1. Bio Verification & Account Creation
app.post('/api/verify', (req, res) => {
  const { username, code, password } = req.body;
  
  // Scrape IFC forum profile here. Mocking success for now:
  users[username] = {
    username,
    password, 
    rank: 'PPL',
    balance: 500, // Start with $500
    hours: 0,
    typeRatings: ['C172', 'SR22', 'TBM9'] // PPL starting aircraft
  };
  res.json({ success: true, message: 'Account verified and created!' });
});

// 2. Login Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  
  if (user && user.password === password) {
    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 3. Password Reset Route (Requires bio verification again)
app.post('/api/reset-password', (req, res) => {
  const { username, newPassword, code } = req.body;
  
  if (users[username]) {
    // In production, we check the IFC profile for the reset code first!
    users[username].password = newPassword;
    res.json({ success: true, message: 'Password reset successfully! You can now log in.' });
  } else {
    res.status(404).json({ success: false, message: 'User not found.' });
  }
});

// 4. SimBrief Fetcher
app.get('/api/simbrief/:username', async (req, res) => {
  try {
    const response = await axios.get(`https://www.simbrief.com/api/xml.fetcher.php?username=${req.params.username}&json=1`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SimBrief data' });
  }
});

// 5. Infinite Flight Tracker Endpoint (Skeleton for Autopilot+)
app.post('/api/dispatch', (req, res) => {
  const { username, callsign } = req.body;
  
  // Mark user as active, start the Checkpoint tracking logic here
  activeFlights[username] = { callsign, status: 'Departed', startTime: Date.now() };
  
  res.json({ success: true, message: 'Flight Dispatched! Tracking started on IF Live Servers.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Infinite Dispatch server running on port ${PORT}`));