async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) return alert("Enter both username and password");

  // Attempt login first
  let res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  // If user doesn't exist yet, we "Verify" and create the account
  if (!res.ok) {
    res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code: '1234', password })
    });
    // Log them in automatically after creation
    res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  }

  const data = await res.json();
  if (data.success) {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    
    document.getElementById('userInfo').innerText = `Pilot: ${data.user.username}`;
    document.getElementById('userRank').innerText = data.user.rank;
    document.getElementById('userBalance').innerText = data.user.balance;
    document.getElementById('userHours').innerText = data.user.hours;
  } else {
    alert(data.message);
  }
}

async function fetchSimBrief() {
  const sbUser = document.getElementById('sbUsername').value;
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
    } else {
      document.getElementById('sbResult').innerText = 'No recent flight plan found for this username.';
    }
  } catch (err) {
    document.getElementById('sbResult').innerText = 'Error fetching SimBrief data.';
  }
}