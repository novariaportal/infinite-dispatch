const supabaseUrl = window.SUPABASE_URL;
const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey || supabaseUrl.includes('YOUR_SUPABASE')) {
  console.warn('Supabase config missing. Update public/config.js.');
}

const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

let currentUser = null;
let latestSimbriefPlan = null;

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getJobSlotCount(totalHours) {
  if (totalHours < 150) return 2;
  if (totalHours < 350) return 4;
  if (totalHours < 550) return 5;
  if (totalHours < 650) return 7;
  if (totalHours < 900) return 8;
  return randomInt(9, 18);
}

function getProgression(totalHours) {
  if (totalHours < 150) return { license: 'PPL', position: 'FO', multiplier: 1.0 };
  if (totalHours < 350) return { license: 'CPL', position: 'SFO', multiplier: 1.5 };
  if (totalHours < 550) return { license: 'MPL', position: 'CPT', multiplier: 2.0 };
  return { license: 'ATPL', position: 'SR CPT', multiplier: 2.5 };
}

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

async function createProfile(user, baseAirport) {
  const randomAirline = airlines[Math.floor(Math.random() * airlines.length)];
  const totalHours = 0;
  const prog = getProgression(totalHours);
  const jobSlots = getJobSlotCount(totalHours);

  const profile = {
    id: user.id,
    username: user.email,
    base_airport: baseAirport.trim().toUpperCase(),
    employer: randomAirline.name,
    hours: totalHours,
    balance: 500,
    license: prog.license,
    position: prog.position,
    pay_multiplier: prog.multiplier,
    job_slots: jobSlots,
    type_ratings: ['Cessna 172', 'Cirrus SR22 GTS', 'TBM-930']
  };

  const { error } = await supabaseClient.from('profiles').insert([profile]);
  if (error) throw error;
  return profile;
}

async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

async function refreshDerivedProfile(profile) {
  const prog = getProgression(profile.hours || 0);
  const jobSlots = getJobSlotCount(profile.hours || 0);

  const updates = {};
  if (profile.license !== prog.license) updates.license = prog.license;
  if (profile.position !== prog.position) updates.position = prog.position;
  if (Number(profile.pay_multiplier) !== prog.multiplier) updates.pay_multiplier = prog.multiplier;
  if (profile.job_slots !== jobSlots) updates.job_slots = jobSlots;

  if (Object.keys(updates).length === 0) return profile;

  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function renderDashboard(profile) {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('resetSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';

  document.getElementById('userInfo').innerText = `Pilot: ${profile.username}`;
  document.getElementById('userRank').innerText = profile.license;
  document.getElementById('userBalance').innerText = profile.balance;
  document.getElementById('userHours').innerText = profile.hours;
  document.getElementById('userEmployer').innerText = profile.employer || "Unassigned";
  document.getElementById('userBase').innerText = profile.base_airport || '----';
  document.getElementById('jobSlots').innerText = profile.job_slots ?? 0;

  maybeShowSystemUpdate();
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const baseAirport = document.getElementById('baseAirport')?.value;

  if (!email || !password) return alert("Enter email and password");

  let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    if (!baseAirport || baseAirport.trim().length < 4) {
      return alert('Enter a Base Airport ICAO code (e.g., WSSS) to register.');
    }

    const signUpResult = await supabaseClient.auth.signUp({ email, password });
    if (signUpResult.error) return alert(signUpResult.error.message);

    const user = signUpResult.data.user;
    if (!user) return alert('Check your email to confirm your account.');

    try {
      await createProfile(user, baseAirport);
    } catch (createError) {
      return alert(createError.message);
    }

    const loginResult = await supabaseClient.auth.signInWithPassword({ email, password });
    if (loginResult.error) return alert(loginResult.error.message);
    data = loginResult.data;
  }

  if (data?.user) {
    currentUser = data.user;
    try {
      const profile = await getProfile(data.user.id);
      const refreshed = await refreshDerivedProfile(profile);
      renderDashboard(refreshed);
    } catch (profileError) {
      alert(profileError.message);
    }
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
  const email = document.getElementById('resetEmail').value;
  if (!email) return alert('Enter your email');

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
  if (error) return alert(error.message);
  alert('Password reset email sent.');
}

async function saveSimBriefPlan(plan) {
  if (!currentUser) return;

  const payload = {
    user_id: currentUser.id,
    flight_number: plan?.general?.flight_number || null,
    airline_icao: plan?.general?.icao_airline || null,
    origin: plan?.origin?.icao_code || null,
    destination: plan?.destination?.icao_code || null,
    aircraft: plan?.aircraft?.icaocode || null,
    plan_json: plan
  };

  const { error } = await supabaseClient.from('flight_plans').insert([payload]);
  if (error) {
    console.warn('Failed to save SimBrief plan:', error.message);
  }
}

async function createTrackingSession() {
  if (!currentUser) return null;

  const callsign = latestSimbriefPlan?.general
    ? `${latestSimbriefPlan.general.icao_airline}${latestSimbriefPlan.general.flight_number}`
    : 'DISPATCH1';

  const serverType = document.getElementById('serverType')?.value || 'casual';

  const payload = {
    user_id: currentUser.id,
    callsign,
    origin: latestSimbriefPlan?.origin?.icao_code || null,
    destination: latestSimbriefPlan?.destination?.icao_code || null,
    status: 'enroute',
    server_type: serverType
  };

  const { data, error } = await supabaseClient
    .from('flight_tracking')
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    console.warn('Failed to start tracking:', error.message);
    return null;
  }

  return data;
}

async function fetchSimBrief() {
  const sbUser = document.getElementById('sbUsername').value;
  const btn = document.getElementById('dispatchBtn');
  btn.style.display = 'none';
  document.getElementById('sbResult').innerText = "Fetching...";
  
  try {
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${sbUser}&json=1`);
    const data = await res.json();
    
    if (data.general) {
      latestSimbriefPlan = data;
      document.getElementById('sbResult').innerText = 
        `Flight: ${data.general.icao_airline}${data.general.flight_number}\n` +
        `Route: ${data.origin.icao_code} ➔ ${data.destination.icao_code}\n` +
        `Aircraft Type: ${data.aircraft.icaocode}\n` +
        `Block Fuel: ${data.fuel.plan_ramp} lbs/kgs`;
      btn.style.display = 'block';
      await saveSimBriefPlan(data);
    } else {
      document.getElementById('sbResult').innerText = 'No recent flight plan found.';
    }
  } catch (err) {
    document.getElementById('sbResult').innerText = 'Error fetching SimBrief data.';
  }
}

async function dispatchFlight() {
  const tracking = await createTrackingSession();
  if (!tracking) {
    alert('Unable to start tracking. Check Supabase setup.');
    return;
  }
  alert('Flight dispatched. Tracking session started.');
  document.getElementById('dispatchBtn').style.display = 'none';
  document.getElementById('sbResult').innerText = "Status: EN ROUTE (Tracking Active...)";
}
