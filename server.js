const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
const LOCAL_DEMO_MODE = process.env.LOCAL_DEMO_MODE === '1';

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      return;
    }
    if (filePath.endsWith('.svg') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  }
}));

function logEvent(level, event, details = {}) {
  const payload = {
    level,
    event,
    details,
    timestamp: new Date().toISOString()
  };
  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    console.error(line);
    return;
  }
  console.log(line);
}

app.post('/api/telemetry', (req, res) => {
  const body = req.body || {};
  const event = String(body.event || '').trim() || 'CLIENT_EVENT';
  const level = String(body.level || 'error').trim().toLowerCase();
  const message = String(body.message || '').trim();
  const context = (body.context && typeof body.context === 'object' && !Array.isArray(body.context))
    ? body.context
    : {};

  if (!message) {
    return res.status(400).json({ success: false, message: 'message is required' });
  }

  logEvent(level, event, {
    message,
    context,
    stack: typeof body.stack === 'string' ? body.stack : null
  });
  return res.status(202).json({ success: true });
});

if (LOCAL_DEMO_MODE) {
  const users = {};
  const activeFlights = {};
  const airlines = [
    { name: 'Delta Air Lines', fleet: ['Boeing 737-800', 'Airbus A350'] },
    { name: 'British Airways', fleet: ['Boeing 787-9', 'Airbus A380'] },
    { name: 'Singapore Airlines', fleet: ['Airbus A350', 'Boeing 787-10'] },
    { name: 'Emirates', fleet: ['Boeing 777-300ER', 'Airbus A380'] }
  ];

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const getJobSlotCount = (totalHours) => {
    if (totalHours < 150) return 2;
    if (totalHours < 350) return 4;
    if (totalHours < 550) return 5;
    if (totalHours < 650) return 7;
    if (totalHours < 900) return 8;
    return randomInt(9, 18);
  };
  const getProgression = (totalHours) => {
    if (totalHours < 150) return { license: 'PPL', position: 'FO', multiplier: 1.0 };
    if (totalHours < 350) return { license: 'CPL', position: 'SFO', multiplier: 1.5 };
    if (totalHours < 550) return { license: 'MPL', position: 'CPT', multiplier: 2.0 };
    return { license: 'ATPL', position: 'SR CPT', multiplier: 2.5 };
  };

  app.post('/api/verify', (req, res) => {
    try {
      const { username, password, baseAirport } = req.body || {};
      const normalizedBaseAirport = String(baseAirport || '').trim().toUpperCase();
      if (!username || !password || !/^[A-Z]{4}$/.test(normalizedBaseAirport)) {
        return res.status(400).json({ success: false, message: 'username, password, and ICAO baseAirport are required.' });
      }

      const randomAirline = airlines[Math.floor(Math.random() * airlines.length)];
      const totalHours = 0;
      const prog = getProgression(totalHours);
      users[username] = {
        username,
        password,
        baseAirport: normalizedBaseAirport,
        hours: totalHours,
        license: prog.license,
        position: prog.position,
        payMultiplier: prog.multiplier,
        rank: prog.license,
        balance: 500,
        employer: randomAirline.name,
        allowedFleet: randomAirline.fleet,
        typeRatings: ['Cessna 172', 'Cirrus SR22 GTS', 'TBM-930'],
        jobSlots: getJobSlotCount(totalHours)
      };
      return res.json({ success: true, message: 'Demo account created.' });
    } catch (error) {
      logEvent('error', 'DEMO_VERIFY_FAILED', { message: error.message });
      return res.status(500).json({ success: false, message: 'Demo verify failed.' });
    }
  });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = users[username];
    if (!user || user.password !== password) {
      logEvent('warn', 'DEMO_LOGIN_REJECTED', { username: String(username || '') });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const prog = getProgression(user.hours || 0);
    user.license = prog.license;
    user.position = prog.position;
    user.payMultiplier = prog.multiplier;
    user.rank = prog.license;
    user.jobSlots = getJobSlotCount(user.hours || 0);
    return res.json({ success: true, user });
  });

  app.post('/api/reset-password', (req, res) => {
    const { username, newPassword } = req.body || {};
    if (!users[username]) return res.status(404).json({ success: false, message: 'User not found.' });
    users[username].password = newPassword;
    return res.json({ success: true, message: 'Password reset successfully.' });
  });

  app.post('/api/dispatch', (req, res) => {
    const { username, callsign } = req.body || {};
    if (!username || !callsign) return res.status(400).json({ success: false, message: 'username and callsign are required.' });
    activeFlights[username] = { callsign, status: 'Departed', startTime: Date.now() };
    return res.json({ success: true, message: 'Demo flight dispatched.' });
  });
} else {
  app.use('/api/verify', (_req, res) => res.status(410).json({
    success: false,
    message: 'Legacy in-memory auth is disabled. Use Supabase auth/profile flow.'
  }));
  app.use('/api/login', (_req, res) => res.status(410).json({
    success: false,
    message: 'Legacy in-memory auth is disabled. Use Supabase auth/profile flow.'
  }));
  app.use('/api/reset-password', (_req, res) => res.status(410).json({
    success: false,
    message: 'Legacy in-memory auth is disabled. Use Supabase auth/profile flow.'
  }));
  app.use('/api/dispatch', (_req, res) => res.status(410).json({
    success: false,
    message: 'Legacy in-memory dispatch endpoint is disabled. Use Supabase-backed client flow.'
  }));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logEvent('info', 'SERVER_STARTED', {
    port: PORT,
    localDemoMode: LOCAL_DEMO_MODE
  });
});
