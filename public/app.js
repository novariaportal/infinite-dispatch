function getSystemUpdateKey() {
  return 'infinite_dispatch_system_update_2026_05_seen';
}

function maybeShowSystemUpdate() {
  const seen = localStorage.getItem(getSystemUpdateKey());
  const el = document.getElementById('systemUpdate');
  if (!el) return;
  if (seen === '1') {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
  }
}

function dismissSystemUpdate() {
  localStorage.setItem(getSystemUpdateKey(), '1');
  const el = document.getElementById('systemUpdate');
  if (el) el.style.display = 'none';
}

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const baseAirport = document.getElementById('baseAirport')?.value;
  
  if (!username || !password) return alert("Enter both username and password");

  let res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  if (!res.ok) {
    // Register flow requires base airport
    if (!baseAirport || baseAirport.trim().length < 4) {
      return alert('Enter a Base Airport ICAO code (e.g., WSSS) to register.');
    }

    res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code: '1234', password, baseAirport })
    });
    
    const verifyData = await res.json();
    if (verifyData.message) alert(verifyData.message);
    
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  }

  const data = await res.json();
  if (data.success) {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('resetSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';

    document.getElementById('userInfo').innerText = `Pilot: ${data.user.username}`;
    document.getElementById('userRank').innerText = data.user.rank;
    document.getElementById('userBalance').innerText = data.user.balance;
    document.getElementById('userHours').innerText = data.user.hours;
    document.getElementById('userEmployer').innerText = data.user.employer || "Unassigned";
    document.getElementById('userBase').innerText = data.user.baseAirport || '----';
    document.getElementById('jobSlots').innerText = data.user.jobSlots ?? 0;

    maybeShowSystemUpdate();
  } else {
    alert(data.message);
  }
}

function toggleReset() {
  const auth = document.getElementById('authSection');
  const reset = document.getElementById('resetSection');
  if (auth.style.display === 'none' || auth.style.display === '') {
    auth.style.display = 'block';
    reset.style.display = 'none';
  } else {
    auth.style.display = 'none';
    reset.style.display = 'block';
  }
}

async function resetPassword() {
  const username = document.getElementById('resetUsername').value;
  const newPassword = document.getElementById('newPassword').value;
  
  if (!username || !newPassword) return alert("Enter username and new password");
  
  const res = await fetch('/api/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, newPassword, code: 'RESET-1234' })
  });
  
  const data = await res.json();
  alert(data.message);
  if(data.success) toggleReset();
}

async function fetchSimBrief() {
  const sbUser = document.getElementById('sbUsername').value;
  const btn = document.getElementById('dispatchBtn');
  btn.style.display = 'none';
  document.getElementById('sbResult').innerText = "Fetching...";
  
  try {
    const res = await fetch(`/api/simbrief/${sbUser}`);
    const data = await res.json();
    
    if(data.general) {
      document.getElementById('sbResult').innerText = 
        `Flight: ${data.general.icao_airline}${data.general.flight_number}\n` +
        `Route: ${data.origin.icao_code} ➔ ${data.destination.icao_code}\n` +
        `Aircraft Type: ${data.aircraft.icaocode}\n` +
        `Block Fuel: ${data.fuel.plan_ramp} lbs/kgs`;
      btn.style.display = 'block'; // Show dispatch button
    } else {
      document.getElementById('sbResult').innerText = 'No recent flight plan found.';
    }
  } catch (err) {
    document.getElementById('sbResult').innerText = 'Error fetching SimBrief data.';
  }
}

async function dispatchFlight() {
  const username = document.getElementById('userInfo').innerText.replace('Pilot: ', '');
  const res = await fetch('/api/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, callsign: 'DISPATCH1' })
  });
  const data = await res.json();
  alert(data.message);
  document.getElementById('dispatchBtn').style.display = 'none';
  document.getElementById('sbResult').innerText = "Status: EN ROUTE (Tracking Active...)";
}
