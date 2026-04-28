const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock Database (We will swap this for MongoDB later)
const users = {};

// 1. Bio Verification & Account Creation
app.post('/api/verify', (req, res) => {
  const { username, code, password } = req.body;
  
  // In reality, this is where we scrape the IFC forum profile to check for the 'code'.
  // For now, we mock a successful verification and create the account.
  users[username] = {
    username,
    password, // Store hashed in production!
    rank: 'PPL',
    balance: 500, // Start with $500
    hours: 0
  };
  res.json({ success: true, message: 'Account verified and created!' });
});

// 2. Login Route (For returning users)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  
  if (user && user.password === password) {
    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 3. SimBrief Fetcher API Endpoint
app.get('/api/simbrief/:username', async (req, res) => {
  try {
    const response = await axios.get(`https://www.simbrief.com/api/xml.fetcher.php?username=${req.params.username}&json=1`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch SimBrief data' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Infinite Dispatch server running on port ${PORT}`));