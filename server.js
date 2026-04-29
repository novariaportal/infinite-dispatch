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

// Cleaned list of airlines and their available CPL/MPL/ATPL fleets based on your JSON data
const airlines = [
  { name: "Delta Air Lines", fleet: ["CRJ-700", "CRJ-900", "Airbus A220-300", "Airbus A319", "Airbus A321", "Boeing 717-200", "Boeing 737-800", "Boeing 737-900", "Boeing 757-200", "Boeing 767-300", "Airbus A330-300", "Airbus A330-900", "Airbus A350"] },
  { name: "British Airways", fleet: ["Airbus A318", "Airbus A319", "Airbus A320", "Airbus A321", "Boeing 777-200ER", "Boeing 777-300ER", "Boeing 787-8", "Boeing 787-9", "Boeing 787-10", "Airbus A380"] },
  { name: "Singapore Airlines", fleet: ["Boeing 737-8 MAX", "Airbus A350", "Boeing 777-300ER", "Airbus A380", "Boeing 787-10"] },
  { name: "Spirit Airlines", fleet: ["Airbus A319", "Airbus A320", "Airbus A321"] },
  { name: "KLM", fleet: ["Boeing 737-700", "Boeing 737-800", "Boeing 737-900", "Boeing 777-200ER", "Boeing 777-300ER", "Boeing 787-9", "Boeing 787-10"] },
  { name: "Emirates", fleet: ["Boeing 777-200LR", "Boeing 777-300ER", "Boeing 777F", "Airbus A380"] },
  { name: "Qantas", fleet: ["Boeing 737-800", "Boeing 787-9", "Airbus A330-300", "Airbus A380", "Bombardier Dash 8-Q400", "Boeing 717-200"] },
  { name: "JetBlue", fleet: ["Airbus A220-300", "Airbus A320", "Airbus A321", "E190"] },
  { name: "United Airlines", fleet: ["Airbus A320", "Boeing 737-700", "Boeing 737-800", "Boeing 737-900", "Boeing 757-200", "Boeing 767-300", "Boeing 777-200ER", "Boeing 787-8", "Boeing 787-9", "Boeing 787-10"] }
];

// Mock Database (We will swap this for a real database later)
const users = {};
// Tracker memory for Autopilot Plus Session Stitching
const activeFlights = {}; 

// 1. Bio Verification & Account Creation
app.post('/api/verify', (req, res) => {
  const { username, code, password } = req.body;
  
  // RNG: Pick a random airline for their career!
  const randomAirline = airlines[Math.floor(Math.random() * airlines.length)];
  
  // Scrape IFC forum profile here. Mocking success for now:
  users[username] = {
    username,
    password, 
    rank: 'PPL',
    balance: 500, // Start with $500
    hours: 0,
    employer: randomAirline.name,
    allowedFleet: randomAirline.fleet,
    typeRatings: ['Cessna 172', 'Cirrus SR22 GTS', 'TBM-930'] // PPL starting aircraft
  };
  res.json({ success: true, message: `Account created! You have been randomly hired by ${randomAirline.name}!` });
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