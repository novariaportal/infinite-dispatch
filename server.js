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

/**
 * SYSTEM UPDATE (2026-05)
 * - Base airport chosen at signup and cannot be changed.
 * - Random employer is chosen from liveries, but must be able to operate from base (simplified for now).
 * - Job market now has fixed visible slot counts based on total hours.
 * - Schedules should return to base within 3 legs (route-gen to be implemented).
 * - Pilot Shop limited to Rest Days + Type Ratings (UI/logic to be implemented).
 */

// Minimal seed list (will be replaced by parsed livery list + base-airport filtering)
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

function getJobSlotCount(totalHours) {
  if (totalHours < 150) return 2;
  if (totalHours < 350) return 4;
  if (totalHours < 550) return 5;
  if (totalHours < 650) return 7;
  if (totalHours < 900) return 8;
  // 900+ fluctuates but always above 8
  return 10;
}

function getProgression(totalHours) {
  // Standardized progression (rank + license in tandem)
  if (totalHours < 150) return { license: 'PPL', position: 'FO', multiplier: 1.0 };
  if (totalHours < 350) return { license: 'CPL', position: 'SFO', multiplier: 1.5 };
  if (totalHours < 550) return { license: 'MPL', position: 'CPT', multiplier: 2.0 };
  return { license: 'ATPL', position: 'SR CPT', multiplier: 2.5 };
}

// Mock Database (replace with Supabase later)
const users = {};
const activeFlights = {};

// 1. Account Creation (now includes base airport)
app.post('/api/verify', (req, res) => {
  const { username, code, password, baseAirport } = req.body;

  if (!baseAirport || typeof baseAirport !== 'string' || baseAirport.trim().length < 4) {
    return res.status(400).json({ success: false, message: 'Base airport (ICAO) is required.' });
  }

  const randomAirline = airlines[Math.floor(Math.random() * airlines.length)];
  const totalHours = 0;
  const prog = getProgression(totalHours);

  users[username] = {
    username,
    password,
    baseAirport: baseAirport.trim().toUpperCase(),
    // Career
    hours: totalHours,
    license: prog.license,
    position: prog.position,
    payMultiplier: prog.multiplier,
    rank: prog.license, // keep existing UI field name for now
    // Economy
    balance: 500,
    // Employment
    employer: randomAirline.name,
    allowedFleet: randomAirline.fleet,
    typeRatings: ['Cessna 172', 'Cirrus SR22 GTS', 'TBM-930'],
    // Job board
    jobSlots: getJobSlotCount(totalHours),
    // System update banner
    lastSeenSystemUpdate: null,
  };

  res.json({
    success: true,
    message: `Account created! Base: ${users[username].baseAirport}. You have been randomly hired by ${randomAirline.name}!`,
  });
});

// 2. Login Route (also refreshes derived fields like jobSlots)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users[username];

  if (user && user.password === password) {
    // Recompute progression + slots from hours
    const prog = getProgression(user.hours || 0);
    user.license = prog.license;
    user.position = prog.position;
    user.payMultiplier = prog.multiplier;
    user.rank = prog.license;
    user.jobSlots = getJobSlotCount(user.hours || 0);

    res.json({ success: true, user });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 3. Password Reset Route
app.post('/api/reset-password', (req, res) => {
  const { username, newPassword, code } = req.body;

  if (users[username]) {
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

// 5. Dispatch endpoint
app.post('/api/dispatch', (req, res) => {
  const { username, callsign } = req.body;

  activeFlights[username] = { callsign, status: 'Departed', startTime: Date.now() };

  res.json({ success: true, message: 'Flight Dispatched! Tracking started on IF Live Servers.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Infinite Dispatch server running on port ${PORT}`));
