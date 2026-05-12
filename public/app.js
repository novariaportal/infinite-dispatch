const supabaseUrl = window.SUPABASE_URL;
const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey || supabaseUrl.includes('YOUR_SUPABASE')) {
  console.warn('Supabase config missing. Update public/config.js.');
}

const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

const THEME_KEY = 'infinite_dispatch_theme';
const GLASS_KEY = 'infinite_dispatch_glass';
const LIVERY_CACHE_KEY = 'infinite_dispatch_livery_cache_v2';

const LIVERY_API_KEY = 'tyy8znhl0u5kbbb2vuvdhfetmsil041u';
const INVALID_LIVERY_PATTERN = /generic|special|factory|house|prototype|test|demo|demonstrator|delivery/i;
const MANUFACTURER_PREFIX_PATTERN = /^(airbus|boeing|embraer|bombardier|cessna|cirrus|dassault|beechcraft|textron)\b/i;
const JOB_WEIGHT_SCALE = 4;
const BASE_PAY_PER_NM = 14;
const BASE_TYPE_RATING_PRICE = 7000;
const LICENSE_LEVELS = ['PPL', 'CPL', 'MPL', 'ATPL'];
const LICENSE_META = {
  PPL: { position: 'FO', multiplier: 1.0 },
  CPL: { position: 'SFO', multiplier: 1.5 },
  MPL: { position: 'CPT', multiplier: 2.0 },
  ATPL: { position: 'SR CPT', multiplier: 2.5 }
};
const LICENSE_SHOP = [
  { code: 'PPL', price: 1500, details: 'Entry license for local and short routes.' },
  { code: 'CPL', price: 7000, details: 'Better compensation and regional command opportunities.' },
  { code: 'MPL', price: 18000, details: 'Advanced line operations with stronger pay multiplier.' },
  { code: 'ATPL', price: 42000, details: 'Highest captain tier for top-paying routes.' }
];
const AIRCRAFT_DISPLAY_ALIAS = {
  'Airbus A350': 'Airbus A350-900'
};

let currentUser = null;
let currentProfile = null;
let latestSimbriefPlan = null;
let latestGeneratedDispatch = null;
let availableJobs = [];
let acceptedJob = null;
let passengerAircraftCatalog = [];
let liveryCache = {};

const POPULARITY_MULTIPLIER = {
  'Airbus A320': 1.06,
  'Airbus A321': 1.08,
  'Airbus A350': 1.15,
  'Airbus A350-900': 1.15,
  'Airbus A380': 1.2,
  'Boeing 737-800': 1.08,
  'Boeing 737-8 MAX': 1.1,
  'Boeing 777-300ER': 1.16,
  'Boeing 787-9': 1.14,
  'Boeing 787-10': 1.13,
  'Boeing 747-8': 1.14
};

const AIRCRAFT_RANGE_NM = {
  'A-10': 2200,
  'Airbus A220-300': 3400,
  'Airbus A318': 3100,
  'Airbus A319': 3700,
  'Airbus A320': 3300,
  'Airbus A321': 4000,
  'Airbus A330-200': 7200,
  'Airbus A330-200F': 4000,
  'Airbus A330-300': 6350,
  'Airbus A330-900': 7200,
  'Airbus A340-600': 7900,
  'Airbus A350': 8100,
  'Airbus A350-900': 8100,
  'Airbus A380': 8200,
  'Boeing 717-200': 2000,
  'Boeing 737-700': 3300,
  'Boeing 737-8 MAX': 3550,
  'Boeing 737-800': 3050,
  'Boeing 737-900': 3200,
  'Boeing 747-200': 6500,
  'Boeing 747-400': 7300,
  'Boeing 747-8': 7700,
  'Boeing 757-200': 3900,
  'Boeing 767-300': 5900,
  'Boeing 777-200ER': 7065,
  'Boeing 777-200LR': 8555,
  'Boeing 777-300ER': 7370,
  'Boeing 777F': 4950,
  'Boeing 787-10': 6400,
  'Boeing 787-8': 7355,
  'Boeing 787-9': 7600,
  'Bombardier Dash 8-Q400': 1100
};

const DEFAULT_EMPLOYERS = ['Singapore Airlines', 'Qantas', 'Emirates', 'KLM', 'British Airways', 'United Airlines'];

const AIRPORTS = {
  WSSS: { name: 'Singapore', region: 'SEA', lat: 1.35, lon: 103.99 },
  WIII: { name: 'Jakarta', region: 'SEA', lat: -6.12, lon: 106.66 },
  VTBS: { name: 'Bangkok', region: 'SEA', lat: 13.69, lon: 100.75 },
  WMKK: { name: 'Kuala Lumpur', region: 'SEA', lat: 2.74, lon: 101.7 },
  RJTT: { name: 'Tokyo Haneda', region: 'NEA', lat: 35.55, lon: 139.78 },
  RJAA: { name: 'Tokyo Narita', region: 'NEA', lat: 35.77, lon: 140.39 },
  VHHH: { name: 'Hong Kong', region: 'NEA', lat: 22.31, lon: 113.92 },
  ZBAA: { name: 'Beijing', region: 'NEA', lat: 40.08, lon: 116.58 },
  YSSY: { name: 'Sydney', region: 'AU', lat: -33.94, lon: 151.17 },
  YMML: { name: 'Melbourne', region: 'AU', lat: -37.67, lon: 144.84 },
  YBBN: { name: 'Brisbane', region: 'AU', lat: -27.38, lon: 153.12 },
  YPPH: { name: 'Perth', region: 'AU', lat: -31.94, lon: 115.97 },
  YPAD: { name: 'Adelaide', region: 'AU', lat: -34.95, lon: 138.53 },
  NZAA: { name: 'Auckland', region: 'NZ', lat: -37.01, lon: 174.79 },
  EGLL: { name: 'London Heathrow', region: 'EU', lat: 51.47, lon: -0.45 },
  EGKK: { name: 'London Gatwick', region: 'EU', lat: 51.15, lon: -0.19 },
  LFPG: { name: 'Paris CDG', region: 'EU', lat: 49.01, lon: 2.55 },
  EHAM: { name: 'Amsterdam', region: 'EU', lat: 52.31, lon: 4.76 },
  OMDB: { name: 'Dubai', region: 'ME', lat: 25.25, lon: 55.36 },
  OTHH: { name: 'Doha', region: 'ME', lat: 25.27, lon: 51.61 },
  OJED: { name: 'Jeddah', region: 'ME', lat: 21.68, lon: 39.16 },
  OERK: { name: 'Riyadh', region: 'ME', lat: 24.96, lon: 46.7 },
  OMAA: { name: 'Abu Dhabi', region: 'ME', lat: 24.43, lon: 54.65 },
  LTBA: { name: 'Istanbul Ataturk', region: 'EU', lat: 40.98, lon: 28.82 },
  EDDF: { name: 'Frankfurt', region: 'EU', lat: 50.03, lon: 8.57 },
  LFPO: { name: 'Paris Orly', region: 'EU', lat: 48.73, lon: 2.38 },
  RKSI: { name: 'Seoul Incheon', region: 'NEA', lat: 37.47, lon: 126.45 },
  RJBB: { name: 'Osaka Kansai', region: 'NEA', lat: 34.43, lon: 135.24 },
  KJFK: { name: 'New York JFK', region: 'NA', lat: 40.64, lon: -73.78 },
  KLAX: { name: 'Los Angeles', region: 'NA', lat: 33.94, lon: -118.4 },
  KSFO: { name: 'San Francisco', region: 'NA', lat: 37.62, lon: -122.38 },
  KSEA: { name: 'Seattle', region: 'NA', lat: 47.45, lon: -122.31 },
  KMIA: { name: 'Miami', region: 'NA', lat: 25.79, lon: -80.29 },
  KORD: { name: 'Chicago O Hare', region: 'NA', lat: 41.97, lon: -87.9 }
};

const AIRLINE_ROUTE_PROFILES = {
  Qantas: {
    hubs: ['YSSY', 'YMML', 'YBBN', 'YPPH'],
    longHaul: ['WSSS', 'NZAA', 'KLAX', 'EGLL'],
    regional: ['YSSY', 'YMML', 'YBBN', 'YPPH', 'YPAD'],
    positioningFromBase: {
      WSSS: ['YSSY', 'YMML', 'YBBN', 'YPPH']
    }
  },
  'Singapore Airlines': {
    hubs: ['WSSS'],
    longHaul: ['EGLL', 'LFPG', 'RJTT', 'VHHH', 'KJFK', 'YSSY', 'OMDB', 'RKSI'],
    regional: ['WIII', 'VTBS', 'WMKK', 'YSSY', 'YMML', 'YBBN']
  },
  Emirates: {
    hubs: ['OMDB'],
    longHaul: ['EGLL', 'KJFK', 'WSSS', 'YSSY', 'RJTT', 'LFPG', 'KLAX'],
    regional: ['OMAA', 'OTHH', 'OERK', 'OJED', 'WSSS', 'VTBS', 'WMKK']
  },
  KLM: {
    hubs: ['EHAM'],
    longHaul: ['EGLL', 'LFPG', 'KJFK', 'KMIA', 'WSSS', 'KORD'],
    regional: ['EGLL', 'LFPG', 'EDDF', 'EGKK']
  },
  'British Airways': {
    hubs: ['EGLL', 'EGKK'],
    longHaul: ['KJFK', 'WSSS', 'YSSY', 'LFPG', 'OMDB', 'KORD', 'KLAX'],
    regional: ['LFPG', 'EHAM', 'EDDF', 'EGKK']
  },
  'United Airlines': {
    hubs: ['KORD', 'KSFO', 'KJFK'],
    longHaul: ['EGLL', 'LFPG', 'WSSS', 'RJTT', 'KLAX', 'KMIA'],
    regional: ['KJFK', 'KLAX', 'KORD', 'KSFO', 'KSEA', 'KMIA']
  },
  Saudia: {
    hubs: ['OJED', 'OERK'],
    longHaul: ['WSSS', 'EGLL', 'LFPG', 'RJTT', 'KJFK'],
    regional: ['OMDB', 'OTHH', 'OERK', 'OJED', 'OMAA']
  },
  'Qatar Airways': {
    hubs: ['OTHH'],
    longHaul: ['EGLL', 'KJFK', 'YSSY', 'WSSS', 'RJTT', 'LFPG'],
    regional: ['OMDB', 'OERK', 'OJED', 'OMAA', 'WSSS']
  },
  'Etihad Airways': {
    hubs: ['OMAA'],
    longHaul: ['EGLL', 'KJFK', 'YSSY', 'WSSS', 'RJTT', 'LFPG'],
    regional: ['OMDB', 'OTHH', 'OERK', 'OJED', 'WSSS']
  },
  Lufthansa: {
    hubs: ['EDDF'],
    longHaul: ['KJFK', 'KORD', 'WSSS', 'RJTT', 'OMDB', 'YSSY'],
    regional: ['EGLL', 'LFPG', 'EHAM', 'EGKK', 'LTBA']
  },
  'Air France': {
    hubs: ['LFPG', 'LFPO'],
    longHaul: ['KJFK', 'WSSS', 'RJTT', 'OMDB', 'YSSY'],
    regional: ['EGLL', 'EHAM', 'EDDF', 'LTBA', 'EGKK']
  },
  'Cathay Pacific': {
    hubs: ['VHHH'],
    longHaul: ['WSSS', 'YSSY', 'EGLL', 'KJFK', 'RJTT', 'LFPG'],
    regional: ['RJTT', 'RKSI', 'WSSS', 'VTBS', 'WMKK']
  },
  ANA: {
    hubs: ['RJTT', 'RJAA'],
    longHaul: ['WSSS', 'YSSY', 'EGLL', 'KJFK', 'VHHH'],
    regional: ['RJBB', 'RKSI', 'VHHH', 'ZBAA', 'WSSS']
  },
  'Japan Airlines': {
    hubs: ['RJTT', 'RJAA'],
    longHaul: ['WSSS', 'YSSY', 'EGLL', 'KJFK', 'VHHH'],
    regional: ['RJBB', 'RKSI', 'VHHH', 'ZBAA', 'WSSS']
  },
  'Turkish Airlines': {
    hubs: ['LTBA'],
    longHaul: ['EGLL', 'KJFK', 'WSSS', 'OMDB', 'RJTT'],
    regional: ['EDDF', 'LFPG', 'EHAM', 'OERK', 'OJED']
  },
  'Delta Air Lines': {
    hubs: ['KJFK', 'KLAX'],
    longHaul: ['EGLL', 'LFPG', 'WSSS', 'RJTT', 'YSSY'],
    regional: ['KORD', 'KSFO', 'KSEA', 'KMIA', 'KJFK']
  },
  'American Airlines': {
    hubs: ['KJFK', 'KORD'],
    longHaul: ['EGLL', 'LFPG', 'WSSS', 'RJTT', 'KLAX'],
    regional: ['KLAX', 'KSEA', 'KMIA', 'KSFO', 'KORD']
  }
};

const REGION_FALLBACKS = {
  SEA: ['WIII', 'VTBS', 'WMKK', 'WSSS', 'VHHH', 'YSSY'],
  AU: ['YSSY', 'YMML', 'YBBN', 'YPAD', 'YPPH'],
  EU: ['EGLL', 'LFPG', 'EHAM', 'EGKK', 'EDDF', 'LTBA'],
  ME: ['OMDB', 'OTHH', 'OJED', 'OERK', 'OMAA', 'WSSS'],
  NA: ['KJFK', 'KLAX', 'KORD', 'KSFO', 'KSEA', 'KMIA'],
  NEA: ['RJTT', 'RJAA', 'VHHH', 'ZBAA', 'RKSI', 'RJBB']
};

function randomInt(min, max) {
  const range = max - min + 1;
  if (window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return min + (array[0] % range);
  }
  return min + (Date.now() % range);
}

function pickRandom(list) {
  if (!list || list.length === 0) return null;
  return list[randomInt(0, list.length - 1)];
}

function uniqueStrings(arr) {
  return [...new Set((arr || []).filter(Boolean).map((x) => String(x).trim()))];
}

function normalizeAirlineName(rawName = '') {
  let name = String(rawName || '').replace(/\s+/g, ' ').trim();
  if (!name) return null;

  const lower = name.toLowerCase();
  if (INVALID_LIVERY_PATTERN.test(lower) || MANUFACTURER_PREFIX_PATTERN.test(lower)) return null;

  name = name
    .replace(/\b(19|20)\d{2}s?\b/g, '')
    .replace(/\b(retro|heritage|classic|old livery|vintage)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const aliasMatchers = [
    [/^british airways/i, 'British Airways'],
    [/^qantas/i, 'Qantas'],
    [/^singapore airlines/i, 'Singapore Airlines'],
    [/^emirates/i, 'Emirates'],
    [/^klm/i, 'KLM'],
    [/^united airlines?/i, 'United Airlines'],
    [/^(saudia|saudi arabian airlines?)/i, 'Saudia'],
    [/^qatar airways/i, 'Qatar Airways'],
    [/^etihad airways/i, 'Etihad Airways'],
    [/^lufthansa/i, 'Lufthansa'],
    [/^air france/i, 'Air France'],
    [/^cathay pacific/i, 'Cathay Pacific'],
    [/^(ana|all nippon airways)/i, 'ANA'],
    [/^japan airlines/i, 'Japan Airlines'],
    [/^turkish airlines/i, 'Turkish Airlines'],
    [/^delta air lines?/i, 'Delta Air Lines'],
    [/^american airlines?/i, 'American Airlines']
  ];

  for (const [pattern, canonical] of aliasMatchers) {
    if (pattern.test(name)) return canonical;
  }

  return AIRLINE_ROUTE_PROFILES[name] ? name : null;
}

function getAircraftDisplayName(aircraftName = '') {
  return AIRCRAFT_DISPLAY_ALIAS[aircraftName] || aircraftName;
}

function getAircraftRangeNm(aircraftName = '') {
  const displayName = getAircraftDisplayName(aircraftName);
  if (AIRCRAFT_RANGE_NM[displayName]) return AIRCRAFT_RANGE_NM[displayName];
  if (AIRCRAFT_RANGE_NM[aircraftName]) return AIRCRAFT_RANGE_NM[aircraftName];

  const size = getAircraftSizeClass(aircraftName);
  if (size === 'wide') return 7000;
  if (size === 'mid') return 5000;
  if (size === 'narrow') return 3200;
  return 1200;
}

function licenseStateFor(licenseCode = 'PPL') {
  return LICENSE_META[licenseCode] || LICENSE_META.PPL;
}

function highestLicense(currentCode, requiredCode) {
  const currentIdx = Math.max(0, LICENSE_LEVELS.indexOf(currentCode));
  const requiredIdx = Math.max(0, LICENSE_LEVELS.indexOf(requiredCode));
  return LICENSE_LEVELS[Math.max(currentIdx, requiredIdx)] || 'PPL';
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
  if (totalHours < 150) return { license: 'PPL', ...licenseStateFor('PPL') };
  if (totalHours < 350) return { license: 'CPL', ...licenseStateFor('CPL') };
  if (totalHours < 550) return { license: 'MPL', ...licenseStateFor('MPL') };
  return { license: 'ATPL', ...licenseStateFor('ATPL') };
}

function getHashParams() {
  const hash = window.location.hash || '';
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(cleaned);
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

function showSection(sectionId) {
  const ids = ['authSection', 'resetSection', 'recoverySection', 'dashboardSection'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = id === sectionId ? 'block' : 'none';
  });
}

function showPage(pageId) {
  const pages = document.querySelectorAll('.page');
  pages.forEach((page) => page.classList.toggle('active', page.id === pageId));

  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.page === pageId));
}

function applyAppearanceFromStorage() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  const glassEnabled = localStorage.getItem(GLASS_KEY) === '1';

  document.documentElement.setAttribute('data-theme', savedTheme);
  document.body.classList.toggle('glass-mode', glassEnabled);

  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) themeSelect.value = savedTheme;

  const glassToggle = document.getElementById('glassToggle');
  if (glassToggle) glassToggle.checked = glassEnabled;
}

function onThemeChange() {
  const value = document.getElementById('themeSelect')?.value || 'light';
  document.documentElement.setAttribute('data-theme', value);
  localStorage.setItem(THEME_KEY, value);
}

function onGlassToggle() {
  const enabled = !!document.getElementById('glassToggle')?.checked;
  document.body.classList.toggle('glass-mode', enabled);
  localStorage.setItem(GLASS_KEY, enabled ? '1' : '0');
}

async function handleRecoveryRedirectIfPresent() {
  const params = getHashParams();
  if (params.type !== 'recovery') return false;

  showSection('recoverySection');
  try {
    const { data } = await supabaseClient.auth.getUser();
    document.getElementById('userInfo').innerText = data?.user?.email
      ? `Password reset for: ${data.user.email}`
      : 'Password reset';
  } catch {
    document.getElementById('userInfo').innerText = 'Password reset';
  }

  return true;
}

async function completePasswordRecovery() {
  const newPassword = document.getElementById('newPassword')?.value || '';
  const confirm = document.getElementById('confirmNewPassword')?.value || '';

  if (!newPassword || newPassword.length < 8) {
    alert('Password must be at least 8 characters.');
    return;
  }
  if (newPassword !== confirm) {
    alert('Passwords do not match.');
    return;
  }

  try {
    const sessionRes = await supabaseClient.auth.getSession();
    if (!sessionRes?.data?.session) {
      alert('Reset session not found. Please reopen your reset link.');
      return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
      alert(error.message);
      return;
    }

    await supabaseClient.auth.signOut();
    history.replaceState(null, '', window.location.pathname);
    alert('Password updated. Please log in with your new password.');
    showSection('authSection');
  } catch (err) {
    console.error('completePasswordRecovery error:', err);
    alert(err?.message || String(err));
  }
}

async function createProfile(user, baseAirport) {
  const totalHours = 0;
  const prog = getProgression(totalHours);

  const profile = {
    id: user.id,
    username: user.email,
    base_airport: baseAirport.trim().toUpperCase(),
    employer: pickRandom(DEFAULT_EMPLOYERS) || 'Singapore Airlines',
    hours: totalHours,
    balance: 500,
    license: prog.license,
    position: prog.position,
    pay_multiplier: prog.multiplier,
    job_slots: getJobSlotCount(totalHours),
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

async function ensureProfile(user, baseAirportMaybe) {
  try {
    return await getProfile(user.id);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    const isMissing = msg.toLowerCase().includes('0 rows') || msg.toLowerCase().includes('row not found') || msg.toLowerCase().includes('json object requested') || msg.toLowerCase().includes('pgrst116');

    if (!isMissing) throw e;

    const baseAirport = (baseAirportMaybe || '').trim();
    if (baseAirport.length < 4) {
      const entered = prompt('Profile not found. Enter your Base Airport ICAO (e.g., WSSS):');
      if (!entered || entered.trim().length < 4) {
        throw new Error('Base Airport is required to create your profile.');
      }
      return createProfile(user, entered);
    }

    return createProfile(user, baseAirport);
  }
}

async function refreshDerivedProfile(profile) {
  const prog = getProgression(profile.hours || 0);
  const jobSlots = getJobSlotCount(profile.hours || 0);
  const effectiveLicense = highestLicense(profile.license, prog.license);
  const effectiveState = licenseStateFor(effectiveLicense);
  const updates = {};
  if (profile.license !== effectiveLicense) updates.license = effectiveLicense;
  if (profile.position !== effectiveState.position) updates.position = effectiveState.position;
  if (Number(profile.pay_multiplier) !== effectiveState.multiplier) updates.pay_multiplier = effectiveState.multiplier;
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

function setAuthButtonLoading(isLoading) {
  const btn = document.querySelector('button[onclick="login()"]');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerText = isLoading ? 'Processing...' : 'Login / Register';
}

async function login() {
  const email = document.getElementById('email').value?.trim();
  const password = document.getElementById('password').value;
  const baseAirport = document.getElementById('baseAirport')?.value;

  if (!email || !password) return alert('Enter email and password');

  try {
    setAuthButtonLoading(true);

    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = (error.message || '').toLowerCase();

      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        alert('Invalid email or password. If you already registered, use the same password.');
        return;
      }

      if (msg.includes('rate limit') || msg.includes('too many')) {
        alert(error.message);
        return;
      }

      if (!baseAirport || baseAirport.trim().length < 4) {
        return alert('Enter a Base Airport ICAO code (e.g., WSSS) to register.');
      }

      const signUpResult = await supabaseClient.auth.signUp({ email, password });
      if (signUpResult.error) {
        alert(signUpResult.error.message);
        return;
      }

      const user = signUpResult.data.user;
      if (!user) {
        alert('Registration created. Please check your email to confirm your account, then log in.');
        return;
      }

      await createProfile(user, baseAirport);

      const loginResult = await supabaseClient.auth.signInWithPassword({ email, password });
      if (loginResult.error) {
        alert(loginResult.error.message);
        return;
      }

      data = loginResult.data;
    }

    if (data?.user) {
      currentUser = data.user;
      const profile = await ensureProfile(data.user, baseAirport);
      currentProfile = await refreshDerivedProfile(profile);
      await initializeDashboard();
    }
  } catch (err) {
    console.error('Login error:', err);
    alert(err?.message || String(err));
  } finally {
    setAuthButtonLoading(false);
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  latestGeneratedDispatch = null;
  acceptedJob = null;
  availableJobs = [];
  document.getElementById('userInfo').innerText = 'Not logged in';
  showSection('authSection');
}

function toggleReset() {
  const auth = document.getElementById('authSection');
  const reset = document.getElementById('resetSection');
  const recovery = document.getElementById('recoverySection');

  if (recovery && recovery.style.display !== 'none') {
    showSection('authSection');
    return;
  }

  if (auth.style.display === 'none' || auth.style.display === '') {
    auth.style.display = 'block';
    reset.style.display = 'none';
    if (recovery) recovery.style.display = 'none';
  } else {
    auth.style.display = 'none';
    reset.style.display = 'block';
    if (recovery) recovery.style.display = 'none';
  }
}

async function resetPassword() {
  const email = document.getElementById('resetEmail').value;
  if (!email) return alert('Enter your email');

  const redirectTo = window.location.origin;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return alert(error.message);
  alert('Password reset email sent. Open the email link to set a new password.');
}

function renderDashboard(profile) {
  document.getElementById('userInfo').innerText = `Pilot: ${profile.username}`;
  document.getElementById('userRank').innerText = profile.license;
  document.getElementById('userBalance').innerText = profile.balance;
  document.getElementById('userHours').innerText = profile.hours;
  document.getElementById('jobSlots').innerText = profile.job_slots ?? 0;
  document.getElementById('userEmployer').innerText = profile.employer || 'Unassigned';
  document.getElementById('userBase').innerText = profile.base_airport || '----';
  document.getElementById('sidebarEmployer').innerText = `Employer: ${profile.employer || 'Unassigned'}`;
  document.getElementById('sidebarBase').innerText = `Base: ${profile.base_airport || '----'}`;
}

function restoreLiveryCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVERY_CACHE_KEY) || '{}');
    liveryCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    liveryCache = {};
  }
}

function persistLiveryCache() {
  localStorage.setItem(LIVERY_CACHE_KEY, JSON.stringify(liveryCache));
}

function getAircraftSizeClass(aircraftName = '') {
  const name = aircraftName.toLowerCase();
  if (name.includes('a380') || name.includes('747') || name.includes('777') || name.includes('a350')) return 'wide';
  if (name.includes('787') || name.includes('767') || name.includes('757') || name.includes('a330')) return 'mid';
  if (name.includes('a320') || name.includes('a321') || name.includes('737') || name.includes('a220')) return 'narrow';
  return 'regional';
}

function getSizeMultiplier(sizeClass) {
  switch (sizeClass) {
    case 'wide':
      return 1.4;
    case 'mid':
      return 1.22;
    case 'narrow':
      return 1.08;
    default:
      return 0.95;
  }
}

function getPopularityMultiplier(aircraftName) {
  return POPULARITY_MULTIPLIER[aircraftName] || 1.0;
}

function getTypeRatingMultiplier(aircraftName) {
  const ratings = currentProfile?.type_ratings || [];
  if (!ratings.length) return 1.0;

  if (ratings.some((r) => r.toLowerCase() === aircraftName.toLowerCase())) return 1.2;

  const family = aircraftName.split(' ')[0]?.toLowerCase();
  if (ratings.some((r) => r.toLowerCase().startsWith(family))) return 1.1;

  if (ratings.length >= 8) return 1.06;
  return 1.0;
}

function isPassengerAircraft(name = '') {
  return !/^(a-10)$|freighter|cargo|\b777f\b|\ba330-200f\b/i.test(name);
}

async function loadAircraftCatalog() {
  if (passengerAircraftCatalog.length) return passengerAircraftCatalog;

  const res = await fetch('/data/aircraft_models.json');
  const payload = await res.json();
  const models = Array.isArray(payload?.result) ? payload.result : [];

  passengerAircraftCatalog = models
    .filter((m) => m?.id && m?.name && isPassengerAircraft(m.name))
    .map((m) => ({ id: m.id, name: m.name, displayName: getAircraftDisplayName(m.name) }));

  return passengerAircraftCatalog;
}

async function fetchAircraftOperators(aircraftId) {
  if (liveryCache[aircraftId]?.length) return liveryCache[aircraftId];

  try {
    const res = await fetch(`https://api.infiniteflight.com/public/v2/aircraft/${aircraftId}/liveries?apikey=${LIVERY_API_KEY}`);
    const payload = await res.json();
    const liveries = Array.isArray(payload?.result) ? payload.result : [];

    const operators = uniqueStrings(
      liveries
        .map((l) => normalizeAirlineName(l?.name || l?.liveryName || l?.airlineName))
        .filter((name) => name && AIRLINE_ROUTE_PROFILES[name])
    );

    liveryCache[aircraftId] = operators;
    persistLiveryCache();
    return operators;
  } catch (err) {
    console.warn('Failed to load liveries for aircraft:', aircraftId, err);
    return liveryCache[aircraftId] || [];
  }
}

function weightedAircraftPick(models) {
  const weighted = [];
  models.forEach((aircraft) => {
    const weight = Math.round((getPopularityMultiplier(aircraft.name) + getSizeMultiplier(getAircraftSizeClass(aircraft.name))) * JOB_WEIGHT_SCALE);
    for (let i = 0; i < weight; i += 1) weighted.push(aircraft);
  });
  return pickRandom(weighted) || pickRandom(models);
}

function randomDistanceForAircraft(aircraftName) {
  const range = getAircraftRangeNm(aircraftName);
  const maxDistance = Math.max(350, Math.floor(range * 0.82));
  const minDistance = Math.min(500, Math.max(120, Math.floor(range * 0.12)));
  return randomInt(minDistance, maxDistance);
}

function calculateJobPay(distanceNm, aircraftName) {
  const displayName = getAircraftDisplayName(aircraftName);
  const sizeClass = getAircraftSizeClass(displayName);
  const sizeMult = getSizeMultiplier(sizeClass);
  const popularityMult = getPopularityMultiplier(displayName);
  const typeRatingMult = getTypeRatingMultiplier(displayName);
  const pilotMult = Number(currentProfile?.pay_multiplier || 1);

  const pay = distanceNm * BASE_PAY_PER_NM * sizeMult * popularityMult * typeRatingMult * pilotMult;
  return Math.round(pay);
}

async function generatePassengerJob(index) {
  const models = await loadAircraftCatalog();
  const base = (currentProfile?.base_airport || 'WSSS').toUpperCase();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const aircraft = weightedAircraftPick(models);
    if (!aircraft) continue;

    const operators = await fetchAircraftOperators(aircraft.id);
    if (!operators.length) continue;

    const airline = pickRandom(operators);
    if (!airline) continue;

    const previewLegs = buildCuratedRoute(base, airline, aircraft.displayName || aircraft.name);
    if (previewLegs.length < 2 || previewLegs.length > 3) continue;

    const distanceNm = randomDistanceForAircraft(aircraft.name);
    const pay = calculateJobPay(distanceNm, aircraft.name);

    return {
      id: `${Date.now()}_${index}_${attempt}`,
      airline,
      aircraftId: aircraft.id,
      aircraft: aircraft.displayName || aircraft.name,
      distanceNm,
      pay,
      passengerService: true
    };
  }

  return null;
}

function renderJobMarket() {
  const list = document.getElementById('jobsList');
  const countEl = document.getElementById('jobsCount');

  list.innerHTML = '';
  countEl.innerText = availableJobs.length;

  if (!availableJobs.length) {
    list.innerHTML = '<div class="list-item muted">No jobs available. Press Refresh Jobs.</div>';
    return;
  }

  availableJobs.forEach((job) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-row"><strong>${job.airline}</strong><span>$${job.pay.toLocaleString()}</span></div>
      <div class="list-row muted"><span>${job.aircraft}</span><span>${job.distanceNm} nm</span></div>
      <div class="list-row muted"><span>Passenger Service: Yes</span><span>${getTypeRatingMultiplier(job.aircraft) > 1 ? 'Type Rating Bonus Applied' : 'Standard Type Rating Pay'}</span></div>
      <button onclick="acceptJob('${job.id}')">Accept Job</button>
    `;
    list.appendChild(item);
  });
}

async function loadJobMarket() {
  if (!currentProfile) return;

  const slots = Number(currentProfile.job_slots || 0);
  availableJobs = [];
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = Math.max(20, slots * 40);

  while (availableJobs.length < slots && attempts < maxAttempts) {
    const job = await generatePassengerJob(attempts);
    attempts += 1;
    if (!job) continue;

    const signature = `${job.airline}|${job.aircraft}|${job.distanceNm}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    availableJobs.push(job);
  }

  while (availableJobs.length < slots && availableJobs.length > 0) {
    const cloneSource = pickRandom(availableJobs);
    const adjustedDistance = cloneSource.distanceNm + (availableJobs.length * 17);
    availableJobs.push({
      ...cloneSource,
      id: `${cloneSource.id}_c${availableJobs.length}`,
      distanceNm: adjustedDistance,
      pay: calculateJobPay(adjustedDistance, cloneSource.aircraft)
    });
  }

  renderJobMarket();
}

function acceptJob(jobId) {
  const job = availableJobs.find((j) => j.id === jobId);
  if (!job) return;

  acceptedJob = job;
  latestGeneratedDispatch = null;

  document.getElementById('acceptedJobDetails').innerHTML = `
    <strong>${job.airline}</strong><br>
    Aircraft: ${job.aircraft}<br>
    Pay: $${job.pay.toLocaleString()}<br>
    Passenger Service: Yes
  `;

  document.getElementById('generateDispatchBtn').disabled = false;
  document.getElementById('dispatchResult').innerText = 'Accepted. Generate Flight / Dispatch when ready.';
  document.getElementById('startTrackingBtn').style.display = 'none';
  showPage('dispatchPage');
}

function getAirportRegion(icao) {
  return AIRPORTS[icao]?.region || 'SEA';
}

function haversineNm(originIcao, destinationIcao) {
  const a = AIRPORTS[originIcao];
  const b = AIRPORTS[destinationIcao];
  if (!a || !b) return randomInt(300, 2200);

  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const inner =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
  const km = 6371 * c;
  return Math.round(km * 0.539957);
}

function routeWithinRange(origin, destination, maxRangeNm) {
  const distance = haversineNm(origin, destination);
  return distance > 0 && distance <= Math.floor(maxRangeNm * 0.95);
}

function pickRangeValidAirport(origins, destinations, maxRangeNm, blocked = []) {
  const blockedSet = new Set(blocked);
  const options = uniqueStrings(destinations).filter((icao) => (
    AIRPORTS[icao] &&
    !blockedSet.has(icao) &&
    origins.some((origin) => routeWithinRange(origin, icao, maxRangeNm))
  ));
  return pickRandom(options);
}

function buildCuratedRoute(base, airline, aircraftName) {
  const cleanBase = (base || 'WSSS').toUpperCase();
  const profile = AIRLINE_ROUTE_PROFILES[airline];
  if (!profile || !AIRPORTS[cleanBase]) return [];

  const maxRangeNm = getAircraftRangeNm(aircraftName);
  const hubs = uniqueStrings(profile.hubs || []);
  const regional = uniqueStrings(profile.regional || []);
  const longHaul = uniqueStrings(profile.longHaul || []);
  const homeBase = hubs.includes(cleanBase);

  let leg1 = null;
  if (!homeBase) {
    const positioning = uniqueStrings([
      ...(profile.positioningFromBase?.[cleanBase] || []),
      ...hubs,
      ...longHaul
    ]);
    leg1 = pickRangeValidAirport([cleanBase], positioning, maxRangeNm, [cleanBase]);
  } else {
    leg1 = pickRangeValidAirport([cleanBase], uniqueStrings([...regional, ...longHaul]), maxRangeNm, [cleanBase]);
  }

  if (!leg1) return [];

  const leg2Pools = homeBase
    ? uniqueStrings([...regional, ...hubs, ...longHaul])
    : uniqueStrings([...regional, ...longHaul, ...hubs]);

  const leg2 = pickRangeValidAirport([leg1], leg2Pools, maxRangeNm, [cleanBase, leg1]);
  if (leg2 && routeWithinRange(leg2, cleanBase, maxRangeNm)) {
    return [
      { origin: cleanBase, destination: leg1 },
      { origin: leg1, destination: leg2 },
      { origin: leg2, destination: cleanBase }
    ];
  }

  if (routeWithinRange(leg1, cleanBase, maxRangeNm)) {
    return [
      { origin: cleanBase, destination: leg1 },
      { origin: leg1, destination: cleanBase }
    ];
  }

  const bridge = pickRangeValidAirport([leg1], [...hubs, ...regional], maxRangeNm, [cleanBase, leg1]);
  if (bridge && routeWithinRange(bridge, cleanBase, maxRangeNm)) {
    return [
      { origin: cleanBase, destination: leg1 },
      { origin: leg1, destination: bridge },
      { origin: bridge, destination: cleanBase }
    ];
  }

  return [];
}

function renderGeneratedDispatch(routePlan) {
  const text = routePlan.legs
    .map((leg, idx) => `Leg ${idx + 1}: ${leg.origin} -> ${leg.destination} (${leg.distanceNm} nm)`)
    .join('\n');

  const totalPay = Math.round(routePlan.legs.reduce((sum, l) => sum + l.pay, 0));

  document.getElementById('dispatchResult').innerText =
    `${routePlan.airline} | ${routePlan.aircraft}\n` +
    `Passenger Service: Yes\n` +
    `${text}\n` +
    `Total Dispatch Pay: $${totalPay.toLocaleString()}\n` +
    `Route returns to base by leg ${routePlan.legs.length}.`;

  document.getElementById('startTrackingBtn').style.display = 'block';
}

function generateDispatch() {
  if (!acceptedJob || !currentProfile) {
    alert('Accept a job first.');
    return;
  }

  const base = (currentProfile.base_airport || 'WSSS').toUpperCase();
  const maxRangeNm = getAircraftRangeNm(acceptedJob.aircraft);
  const legs = buildCuratedRoute(base, acceptedJob.airline, acceptedJob.aircraft);
  if (legs.length < 2 || legs.length > 3) {
    alert('Unable to generate a valid multi-leg route. Try another job.');
    return;
  }

  const routeLegs = [];
  for (const leg of legs) {
    const distanceNm = haversineNm(leg.origin, leg.destination);
    if (distanceNm > Math.floor(maxRangeNm * 0.95)) {
      alert('Unable to generate route within aircraft range. Try refreshing jobs.');
      return;
    }
    routeLegs.push({
      ...leg,
      distanceNm,
      pay: calculateJobPay(distanceNm, acceptedJob.aircraft)
    });
  }

  latestGeneratedDispatch = {
    airline: acceptedJob.airline,
    aircraft: acceptedJob.aircraft,
    passengerService: true,
    legs: routeLegs
  };

  renderGeneratedDispatch(latestGeneratedDispatch);
}

function buildShopCatalog() {
  const list = passengerAircraftCatalog.slice();
  return list.map((aircraft) => {
    const displayName = aircraft.displayName || aircraft.name;
    const sizeClass = getAircraftSizeClass(displayName);
    const sizeMult = getSizeMultiplier(sizeClass);
    const popularity = getPopularityMultiplier(displayName);
    const price = Math.round(BASE_TYPE_RATING_PRICE * sizeMult * popularity);
    return {
      ...aircraft,
      displayName,
      sizeClass,
      popularity,
      price
    };
  });
}

function renderPilotShop() {
  const host = document.getElementById('shopList');
  const licenseHost = document.getElementById('licenseShopList');
  const licenseState = document.getElementById('currentLicenseState');
  host.innerHTML = '';
  if (licenseHost) licenseHost.innerHTML = '';
  if (licenseState) {
    const state = licenseStateFor(currentProfile?.license || 'PPL');
    licenseState.innerText = `Current: ${currentProfile?.license || 'PPL'} (${state.position}) • Pay x${Number(currentProfile?.pay_multiplier || state.multiplier).toFixed(1)}`;
  }

  if (licenseHost) {
    LICENSE_SHOP.forEach((license) => {
      const ownedIdx = LICENSE_LEVELS.indexOf(currentProfile?.license || 'PPL');
      const targetIdx = LICENSE_LEVELS.indexOf(license.code);
      const isOwnedOrHigher = targetIdx <= ownedIdx;
      const card = document.createElement('div');
      card.className = 'list-item';
      card.innerHTML = `
        <div class="list-row"><strong>${license.code}</strong><span>$${license.price.toLocaleString()}</span></div>
        <div class="list-row muted"><span>${license.details}</span><span>${licenseStateFor(license.code).position} • x${licenseStateFor(license.code).multiplier.toFixed(1)}</span></div>
        <button ${isOwnedOrHigher ? 'disabled' : ''} onclick="buyLicense('${license.code}')">${isOwnedOrHigher ? 'Owned' : 'Purchase License'}</button>
      `;
      licenseHost.appendChild(card);
    });
  }

  const catalog = buildShopCatalog();
  const owned = (currentProfile?.type_ratings || []).map((x) => x.toLowerCase());

  catalog.forEach((item) => {
    const hasRating = owned.includes(item.displayName.toLowerCase());
    const card = document.createElement('div');
    card.className = 'list-item';
    card.innerHTML = `
      <div class="list-row"><strong>${item.displayName}</strong><span>$${item.price.toLocaleString()}</span></div>
      <div class="list-row muted"><span>Size: ${item.sizeClass}</span><span>Popularity: x${item.popularity.toFixed(2)}</span></div>
      <button ${hasRating ? 'disabled' : ''} onclick="buyTypeRating('${item.id}')">${hasRating ? 'Owned' : 'Purchase Type Rating'}</button>
    `;
    host.appendChild(card);
  });
}

async function buyLicense(licenseCode) {
  if (!currentProfile || !LICENSE_META[licenseCode]) return;

  const selected = LICENSE_SHOP.find((l) => l.code === licenseCode);
  if (!selected) return;

  const currentIdx = LICENSE_LEVELS.indexOf(currentProfile.license || 'PPL');
  const targetIdx = LICENSE_LEVELS.indexOf(licenseCode);
  if (targetIdx <= currentIdx) {
    alert('You already hold this license or higher.');
    return;
  }

  if ((currentProfile.balance || 0) < selected.price) {
    alert('Insufficient balance.');
    return;
  }

  const state = licenseStateFor(licenseCode);
  const updates = {
    balance: currentProfile.balance - selected.price,
    license: licenseCode,
    position: state.position,
    pay_multiplier: state.multiplier
  };

  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentProfile.id)
    .select('*')
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  currentProfile = data;
  renderDashboard(currentProfile);
  renderPilotShop();
  await loadJobMarket();
  alert(`Purchased ${licenseCode}.`);
}

async function buyTypeRating(aircraftId) {
  if (!currentProfile) return;

  const aircraft = passengerAircraftCatalog.find((a) => a.id === aircraftId);
  if (!aircraft) return;

  const displayName = aircraft.displayName || aircraft.name;
  const sizeClass = getAircraftSizeClass(displayName);
  const price = Math.round(BASE_TYPE_RATING_PRICE * getSizeMultiplier(sizeClass) * getPopularityMultiplier(displayName));

  const currentRatings = uniqueStrings(currentProfile.type_ratings || []);
  if (currentRatings.some((r) => r.toLowerCase() === displayName.toLowerCase())) {
    alert('Type rating already owned.');
    return;
  }

  if ((currentProfile.balance || 0) < price) {
    alert('Insufficient balance.');
    return;
  }

  const updates = {
    balance: currentProfile.balance - price,
    type_ratings: [...currentRatings, displayName]
  };

  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentProfile.id)
    .select('*')
    .single();

  if (error) {
    alert(error.message);
    return;
  }

  currentProfile = data;
  renderDashboard(currentProfile);
  renderPilotShop();
  await loadJobMarket();
  alert(`Purchased ${displayName} type rating.`);
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

async function createTrackingSession(trackingSource) {
  if (!currentUser) return null;

  const serverType = document.getElementById('serverType')?.value || 'casual';
  const source = trackingSource || {};

  const fallbackCallsign = source.airline
    ? `${source.airline.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}${randomInt(100, 999)}`
    : 'DISPATCH1';

  const callsign = latestSimbriefPlan?.general
    ? `${latestSimbriefPlan.general.icao_airline}${latestSimbriefPlan.general.flight_number}`
    : fallbackCallsign;

  const payload = {
    user_id: currentUser.id,
    callsign,
    origin: source.origin || latestSimbriefPlan?.origin?.icao_code || null,
    destination: source.destination || latestSimbriefPlan?.destination?.icao_code || null,
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
  document.getElementById('sbResult').innerText = 'Fetching...';

  try {
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${sbUser}&json=1`);
    const data = await res.json();

    if (data.general) {
      latestSimbriefPlan = data;
      document.getElementById('sbResult').innerText =
        `Flight: ${data.general.icao_airline}${data.general.flight_number}\n` +
        `Route: ${data.origin.icao_code} -> ${data.destination.icao_code}\n` +
        `Aircraft Type: ${data.aircraft.icaocode}\n` +
        `Block Fuel: ${data.fuel.plan_ramp}`;
      await saveSimBriefPlan(data);
    } else {
      document.getElementById('sbResult').innerText = 'No recent flight plan found.';
    }
  } catch (err) {
    document.getElementById('sbResult').innerText = 'Error fetching SimBrief data.';
  }
}

async function dispatchFlight() {
  let source = null;
  if (latestGeneratedDispatch?.legs?.length) {
    source = {
      airline: latestGeneratedDispatch.airline,
      origin: latestGeneratedDispatch.legs[0].origin,
      destination: latestGeneratedDispatch.legs[0].destination
    };
  }

  const tracking = await createTrackingSession(source);
  if (!tracking) {
    alert('Unable to start tracking. Check Supabase setup.');
    return;
  }

  alert('Flight dispatched. Tracking session started.');
  document.getElementById('startTrackingBtn').style.display = 'none';
  await loadTrackingHistory();
  showPage('historyPage');
}

async function loadTrackingHistory() {
  const list = document.getElementById('trackingHistory');
  const empty = document.getElementById('trackingHistoryEmpty');
  if (!list || !empty || !currentUser) return;

  const { data, error } = await supabaseClient
    .from('flight_tracking')
    .select('callsign, origin, destination, status, server_type, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) {
    console.warn('Failed to load tracking history:', error.message);
    return;
  }

  list.innerHTML = '';
  if (!data || data.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  data.forEach((flight) => {
    const item = document.createElement('li');
    const route = [flight.origin, flight.destination].filter(Boolean).join(' -> ');
    const server = (flight.server_type || 'casual').toUpperCase();
    const status = (flight.status || 'enroute').toUpperCase();
    const created = flight.created_at ? new Date(flight.created_at).toLocaleString() : '';

    item.innerHTML = `
      <div class="history-line">
        <span>${flight.callsign || 'DISPATCH'}</span>
        <span>${route || 'Route pending'}</span>
      </div>
      <div class="history-meta">
        <span>${server}</span>
        <span>${status}</span>
        <span>${created}</span>
      </div>
    `;
    list.appendChild(item);
  });
}

async function initializeDashboard() {
  if (!currentProfile) return;

  showSection('dashboardSection');
  showPage('overviewPage');
  renderDashboard(currentProfile);
  applyAppearanceFromStorage();
  restoreLiveryCache();
  await loadAircraftCatalog();
  await Promise.all([loadTrackingHistory(), loadJobMarket()]);
  renderPilotShop();
}

async function tryAutoLogin() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data?.session?.user) return;

  currentUser = data.session.user;
  const profile = await ensureProfile(currentUser);
  currentProfile = await refreshDerivedProfile(profile);
  await initializeDashboard();
}

window.addEventListener('load', async () => {
  applyAppearanceFromStorage();

  try {
    const handled = await handleRecoveryRedirectIfPresent();
    if (handled) return;
  } catch (e) {
    console.warn('Failed to handle recovery redirect:', e);
  }

  try {
    await tryAutoLogin();
  } catch (e) {
    console.warn('Auto-login skipped:', e?.message || e);
  }
});

window.onThemeChange = onThemeChange;
window.onGlassToggle = onGlassToggle;
window.showPage = showPage;
window.login = login;
window.logout = logout;
window.toggleReset = toggleReset;
window.resetPassword = resetPassword;
window.completePasswordRecovery = completePasswordRecovery;
window.fetchSimBrief = fetchSimBrief;
window.dispatchFlight = dispatchFlight;
window.loadJobMarket = loadJobMarket;
window.acceptJob = acceptJob;
window.generateDispatch = generateDispatch;
window.buyLicense = buyLicense;
window.buyTypeRating = buyTypeRating;
