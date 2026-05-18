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
const MAX_CALLSIGN_LENGTH = 12;
const NM_PER_KM = 0.539957;
const MIN_VALID_TRACKING_SPEED_KTS = 40;
const NEW_PILOT_HOURS_THRESHOLD = 5;
const IFC_DISCOURSE_USER_BASE_URL = 'https://community.infiniteflight.com/u/';
const IFC_VERIFY_CODE_PREFIX = 'ID-LINK-';
const AIRLABS_MAX_LIMIT = 50;
const AIRLABS_FETCH_MAX_PAGES = 3;
const AIRLABS_MAX_CANDIDATES = 40;
const AIRLABS_FRONTEND_CACHE_TTL_MS = 2 * 60 * 1000;
const AIRLABS_FRONTEND_CACHE_MAX_ENTRIES = 120;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const JOB_MARKET_REFRESH_LIMIT = 2;
const JOB_MARKET_REFRESH_WINDOW_MS = 36 * MS_PER_HOUR;
const MAX_JOB_GENERATION_ATTEMPTS_PER_CYCLE = 20;
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
let airlabsCandidateCache = {};
let lastAirlabsHealth = {
  code: 'AIRLABS_NOT_CHECKED',
  ok: false,
  detail: 'No AirLabs request attempted yet.'
};
let lastJobMarketFailure = null;
let hasTrackingHistory = false;

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
const AIRLINE_CODE_LOOKUP = {
  Qantas: { iata: 'QF', icao: 'QFA' },
  'Singapore Airlines': { iata: 'SQ', icao: 'SIA' },
  Emirates: { iata: 'EK', icao: 'UAE' },
  KLM: { iata: 'KL', icao: 'KLM' },
  'British Airways': { iata: 'BA', icao: 'BAW' },
  'United Airlines': { iata: 'UA', icao: 'UAL' },
  Saudia: { iata: 'SV', icao: 'SVA' },
  'Qatar Airways': { iata: 'QR', icao: 'QTR' },
  'Etihad Airways': { iata: 'EY', icao: 'ETD' },
  Lufthansa: { iata: 'LH', icao: 'DLH' },
  'Air France': { iata: 'AF', icao: 'AFR' },
  'Cathay Pacific': { iata: 'CX', icao: 'CPA' },
  ANA: { iata: 'NH', icao: 'ANA' },
  'Japan Airlines': { iata: 'JL', icao: 'JAL' },
  'Turkish Airlines': { iata: 'TK', icao: 'THY' },
  'Delta Air Lines': { iata: 'DL', icao: 'DAL' },
  'American Airlines': { iata: 'AA', icao: 'AAL' }
};

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

function recordFailureCode(failureCounter, code) {
  if (!failureCounter || !code) return;
  failureCounter[code] = (failureCounter[code] || 0) + 1;
}

function getTopFailureCode(failureCounter) {
  const entries = Object.entries(failureCounter || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0] || null;
}

function formatJobGenerationFailureText(failure) {
  if (!failure?.code) return '';
  const detail = failure.detail ? ` — ${failure.detail}` : '';
  const attempts = Number.isFinite(failure.attempts) ? ` (attempts: ${failure.attempts})` : '';
  return `Error Code: ${failure.code}${attempts}${detail}`;
}

function formatAirlabsStatusText() {
  const detail = lastAirlabsHealth.detail ? ` — ${lastAirlabsHealth.detail}` : '';
  return `AirLabs Status: ${lastAirlabsHealth.code}${detail}`;
}

function buildNoJobsMessage() {
  const detailLine = formatJobGenerationFailureText(lastJobMarketFailure);
  const airlabsLine = formatAirlabsStatusText();
  const lines = [
    'No jobs available for your current type ratings. Try refreshing or buying another type rating.',
    detailLine,
    airlabsLine
  ].filter(Boolean);
  return `<div class="list-item muted">${lines.join('<br>')}</div>`;
}

function buildJobFailureDetail(code) {
  if (code === 'JOBGEN_AIRLABS_UNAVAILABLE') {
    const extra = lastAirlabsHealth.detail ? ` (${lastAirlabsHealth.detail})` : '';
    return `AirLabs issue: ${lastAirlabsHealth.code}${extra}`;
  }
  return 'Unable to assemble a valid job after retries.';
}

function shuffleArray(input = []) {
  const list = input.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    const swappedValue = list[i];
    list[i] = list[j];
    list[j] = swappedValue;
  }
  return list;
}

function uniqueStrings(arr) {
  return [...new Set((arr || []).filter(Boolean).map((x) => String(x).trim()))];
}

function normalizeTypeRatingName(ratingName = '') {
  const trimmed = String(ratingName || '').trim();
  if (!trimmed) return '';
  return getAircraftDisplayName(trimmed);
}

function pilotOwnsTypeForAircraft(profile, aircraftName = '') {
  const target = normalizeTypeRatingName(aircraftName).toLowerCase();
  if (!target) return false;

  return (profile?.type_ratings || [])
    .map((rating) => normalizeTypeRatingName(rating).toLowerCase())
    .includes(target);
}

function hasTypeRatings(profile) {
  return Array.isArray(profile?.type_ratings) && profile.type_ratings.length > 0;
}

function isMissingJobRefreshColumnError(error) {
  const code = String(error?.code || '').trim();
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error?.message || '');
  return /job_refresh/i.test(message);
}

function isMissingIdentityColumnError(error) {
  const code = String(error?.code || '').trim();
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error?.message || '');
  return /ifc_link|discourse_username|identity_link/i.test(message);
}

function withIdentityDefaults(profile) {
  const normalizedUsername = String(profile?.discourse_username || '').trim() || null;
  const rawStatus = String(profile?.ifc_link_status || 'unlinked').trim().toLowerCase();
  const allowedStatus = ['unlinked', 'pending', 'verified', 'failed'];
  const status = allowedStatus.includes(rawStatus) ? rawStatus : 'unlinked';
  return {
    ...profile,
    discourse_username: normalizedUsername,
    ifc_link_status: status,
    ifc_link_code: String(profile?.ifc_link_code || '').trim() || null,
    ifc_link_verified_at: profile?.ifc_link_verified_at || null,
    ifc_link_last_checked_at: profile?.ifc_link_last_checked_at || null,
    ifc_link_last_error: String(profile?.ifc_link_last_error || '').trim() || null
  };
}

function normalizeIfcUsername(raw = '') {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^@+/, '').replace(/\s+/g, '-');
  if (!/^[a-z0-9_.-]+$/i.test(normalized)) return null;
  return normalized;
}

function generateIfcVerificationCode() {
  return `${IFC_VERIFY_CODE_PREFIX}${randomInt(100000, 999999)}`;
}

function readIfcBioText(payload) {
  const raw = payload?.user?.user_profile?.bio_raw
    || payload?.user?.bio_raw
    || payload?.user?.user_profile?.bio
    || payload?.user?.bio
    || payload?.user?.user_profile?.bio_excerpt
    || payload?.user?.bio_excerpt
    || '';
  return String(raw || '');
}

function buildIfcProfileJsonUrl(username = '') {
  const normalized = normalizeIfcUsername(username);
  if (!normalized) return '';
  const configuredProxy = window.IFC_PROFILE_PROXY_URL;
  if (typeof configuredProxy !== 'string') return '';
  const proxyBase = configuredProxy.trim();
  if (!proxyBase) return '';
  return `${proxyBase}?username=${encodeURIComponent(normalized)}`;
}

function syncDiscourseInputsFromProfile(profile) {
  const input = document.getElementById('discourseUsernameInput');
  if (!input) return;
  input.value = profile?.discourse_username || '';
}

function renderDiscourseLinkStatus(profile) {
  const statusEl = document.getElementById('discourseLinkStatus');
  if (!statusEl) return;

  const normalized = withIdentityDefaults(profile || currentProfile || {});
  const status = normalized.ifc_link_status;
  const username = normalized.discourse_username;
  const code = normalized.ifc_link_code;
  const verifiedAt = normalized.ifc_link_verified_at;
  const lastError = normalized.ifc_link_last_error;

  if (status === 'verified' && username) {
    const verifiedLabel = verifiedAt ? new Date(verifiedAt).toLocaleString() : 'recently';
    statusEl.innerText = `✅ Linked: @${username} (verified ${verifiedLabel})`;
    return;
  }

  if (status === 'pending' && username && code) {
    const profileJsonUrl = buildIfcProfileJsonUrl(username);
    statusEl.innerText = `⏳ Pending: Add "${code}" to your IFC profile About Me on ${profileJsonUrl}, then click the confirmation button.`;
    return;
  }

  if (status === 'failed' && username && lastError) {
    statusEl.innerText = `⚠️ Last verification failed for @${username}: ${lastError}`;
    return;
  }

  if (username) {
    statusEl.innerText = `Not verified yet for @${username}.`;
    return;
  }

  statusEl.innerText = 'Not linked yet.';
}

function getAirlineNetworkAirports(airline) {
  const profile = AIRLINE_ROUTE_PROFILES[airline];
  if (!profile) return [];

  return uniqueStrings([
    ...(profile.hubs || []),
    ...(profile.regional || []),
    ...(profile.longHaul || []),
    ...Object.keys(profile.positioningFromBase || {}),
    ...Object.values(profile.positioningFromBase || {}).flat()
  ]);
}

function airlineServesBaseAirport(airline, baseAirport) {
  const cleanBase = String(baseAirport || '').trim().toUpperCase();
  if (!cleanBase) return false;
  return getAirlineNetworkAirports(airline).includes(cleanBase);
}

function getCompatibleEmployersForBase(baseAirport) {
  const cleanBase = String(baseAirport || '').trim().toUpperCase();
  const airlines = Object.keys(AIRLINE_ROUTE_PROFILES);
  if (!cleanBase) return DEFAULT_EMPLOYERS;

  const hubMatches = airlines.filter((airline) => AIRLINE_ROUTE_PROFILES[airline]?.hubs?.includes(cleanBase));
  if (hubMatches.length) return hubMatches;

  const networkMatches = airlines.filter((airline) => airlineServesBaseAirport(airline, cleanBase));
  if (networkMatches.length) return networkMatches;

  const baseRegion = getAirportRegion(cleanBase);
  const regionalMatches = airlines.filter((airline) => (
    (AIRLINE_ROUTE_PROFILES[airline]?.hubs || []).some((hub) => getAirportRegion(hub) === baseRegion)
  ));
  return regionalMatches.length ? regionalMatches : DEFAULT_EMPLOYERS;
}

function resolveEmployerForBase(baseAirport, preferredEmployer = null) {
  if (typeof preferredEmployer === 'string' && preferredEmployer.trim() === '') return '';
  const compatibleEmployers = getCompatibleEmployersForBase(baseAirport);
  const normalizedPreferred = normalizeAirlineName(preferredEmployer);
  if (normalizedPreferred && compatibleEmployers.includes(normalizedPreferred)) return normalizedPreferred;
  return compatibleEmployers[0] || normalizedPreferred || DEFAULT_EMPLOYERS[0];
}

function normalizeBaseAirport(baseAirport) {
  const normalized = String(baseAirport || '').trim().toUpperCase();
  if (!normalized || !AIRPORTS[normalized]) return null;
  return normalized;
}

function resolveProfileBaseAirport(profile) {
  return normalizeBaseAirport(profile?.base_airport);
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

function getAirlineCodes(airlineName = '') {
  return AIRLINE_CODE_LOOKUP[airlineName] || null;
}

function buildAirlabsCacheKey(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value).toUpperCase()}`)
    .join('|');
}

async function fetchAirlabsRoutes(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    query.set(key, String(value));
  });

  if (!query.has('limit')) query.set('limit', String(AIRLABS_MAX_LIMIT));
  if (!query.has('_fields')) {
    query.set('_fields', 'airline_iata,airline_icao,flight_number,dep_icao,arr_icao,duration,days');
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/airlabs-routes?${query.toString()}`, {
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${supabasePublishableKey}`
      }
    });
    if (!res.ok) {
      lastAirlabsHealth = {
        code: `AIRLABS_HTTP_${res.status}`,
        ok: false,
        detail: `Edge function returned HTTP ${res.status}.`
      };
      return { data: [], request: { has_more: false } };
    }
    const payload = await res.json();
    lastAirlabsHealth = {
      code: 'AIRLABS_OK',
      ok: true,
      detail: 'AirLabs edge route query succeeded.'
    };
    return payload || { data: [], request: { has_more: false } };
  } catch (error) {
    lastAirlabsHealth = {
      code: 'AIRLABS_FETCH_FAILED',
      ok: false,
      detail: error?.message || String(error)
    };
    return { data: [], request: { has_more: false } };
  }
}

async function fetchAirlabsCandidateLegs(params = {}) {
  const dep = String(params.dep_icao || '').trim().toUpperCase();
  const arr = String(params.arr_icao || '').trim().toUpperCase();
  const airline = String(params.airline || '').trim();
  const maxRangeNm = Number(params.maxRangeNm || 0);
  const baseParams = {};
  if (dep) baseParams.dep_icao = dep;
  if (arr) baseParams.arr_icao = arr;

  const codes = getAirlineCodes(airline);
  const expectedIata = String(codes?.iata || '').trim().toUpperCase();
  const expectedIcao = String(codes?.icao || '').trim().toUpperCase();
  if (codes?.iata) baseParams.airline_iata = codes.iata;
  if (codes?.icao) baseParams.airline_icao = codes.icao;
  baseParams.limit = AIRLABS_MAX_LIMIT;

  const cacheKey = buildAirlabsCacheKey({ ...baseParams, maxRangeNm: Math.floor(maxRangeNm || 0) });
  const cachedEntry = airlabsCandidateCache[cacheKey];
  if (cachedEntry && cachedEntry.expiresAt > Date.now()) return cachedEntry.legs;

  let offset = 0;
  let hasMore = true;
  let pages = 0;
  const candidates = [];

  while (hasMore && pages < AIRLABS_FETCH_MAX_PAGES && candidates.length < AIRLABS_MAX_CANDIDATES) {
    const payload = await fetchAirlabsRoutes({ ...baseParams, offset });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    rows.forEach((row) => {
      const rowIata = String(row?.airline_iata || '').trim().toUpperCase();
      const rowIcao = String(row?.airline_icao || '').trim().toUpperCase();
      const airlineMatched = (!expectedIata && !expectedIcao)
        || (expectedIata && rowIata === expectedIata)
        || (expectedIcao && rowIcao === expectedIcao);
      if (!airlineMatched) return;

      const origin = String(row?.dep_icao || '').toUpperCase();
      const destination = String(row?.arr_icao || '').toUpperCase();
      if (!AIRPORTS[origin] || !AIRPORTS[destination]) return;
      if (origin === destination) return;
      if (maxRangeNm && !routeWithinRange(origin, destination, maxRangeNm)) return;

      candidates.push({
        origin,
        destination,
        flightNumber: row?.flight_number || null,
        days: Array.isArray(row?.days) ? row.days : [],
        durationMinutes: Number.isFinite(Number(row?.duration)) ? Number(row.duration) : null
      });
    });

    hasMore = Boolean(payload?.request?.has_more);
    offset += AIRLABS_MAX_LIMIT;
    pages += 1;
  }

  const deduped = [];
  const seen = new Set();
  candidates.forEach((leg) => {
    const signature = `${leg.origin}-${leg.destination}-${leg.flightNumber || ''}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    deduped.push(leg);
  });

  const cacheKeys = Object.keys(airlabsCandidateCache);
  if (cacheKeys.length >= AIRLABS_FRONTEND_CACHE_MAX_ENTRIES) {
    cacheKeys
      .sort((a, b) => airlabsCandidateCache[a].expiresAt - airlabsCandidateCache[b].expiresAt)
      .slice(0, Math.ceil(AIRLABS_FRONTEND_CACHE_MAX_ENTRIES / 4))
      .forEach((key) => delete airlabsCandidateCache[key]);
  }

  airlabsCandidateCache[cacheKey] = {
    legs: deduped,
    expiresAt: Date.now() + AIRLABS_FRONTEND_CACHE_TTL_MS
  };
  return deduped;
}

async function buildAirlabsDispatchLegs(base, airline, aircraftName, seedLeg = null) {
  const maxRangeNm = getAircraftRangeNm(aircraftName);
  const firstLegCandidates = await fetchAirlabsCandidateLegs({ dep_icao: base, airline, maxRangeNm });
  if (!firstLegCandidates.length) return [];

  const preferredSeed = seedLeg && routeWithinRange(seedLeg.origin, seedLeg.destination, maxRangeNm)
    ? firstLegCandidates.find((leg) => leg.origin === seedLeg.origin && leg.destination === seedLeg.destination)
    : null;
  const firstLeg = preferredSeed || pickRandom(firstLegCandidates);
  if (!firstLeg) return [];

  const directReturnCandidates = await fetchAirlabsCandidateLegs({
    dep_icao: firstLeg.destination,
    arr_icao: base,
    airline,
    maxRangeNm
  });
  if (directReturnCandidates.length) {
    return [firstLeg, pickRandom(directReturnCandidates)];
  }

  const secondLegCandidates = await fetchAirlabsCandidateLegs({
    dep_icao: firstLeg.destination,
    airline,
    maxRangeNm
  });
  const shuffledSecondLegs = shuffleArray(
    secondLegCandidates.filter((leg) => leg.destination !== base)
  );

  for (const secondLeg of shuffledSecondLegs) {
    const finalLegCandidates = await fetchAirlabsCandidateLegs({
      dep_icao: secondLeg.destination,
      arr_icao: base,
      airline,
      maxRangeNm
    });
    if (finalLegCandidates.length) {
      return [firstLeg, secondLeg, pickRandom(finalLegCandidates)];
    }
  }

  return [];
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
  const ids = ['landingSection', 'authSection', 'resetSection', 'recoverySection', 'dashboardSection'];
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

  ['themeSelect', 'headerThemeSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = savedTheme;
  });

  ['glassToggle', 'headerGlassToggle'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = glassEnabled;
  });
}

function setTheme(value) {
  const themeValue = value === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', themeValue);
  localStorage.setItem(THEME_KEY, themeValue);
  ['themeSelect', 'headerThemeSelect'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = themeValue;
  });
}

function setGlassMode(enabled) {
  const isEnabled = !!enabled;
  document.body.classList.toggle('glass-mode', isEnabled);
  localStorage.setItem(GLASS_KEY, isEnabled ? '1' : '0');
  ['glassToggle', 'headerGlassToggle'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.checked = isEnabled;
  });
}

function onThemeChange() {
  setTheme(document.getElementById('themeSelect')?.value || 'light');
}

function onThemeChangeFromHeader() {
  setTheme(document.getElementById('headerThemeSelect')?.value || 'light');
}

function onGlassToggle() {
  setGlassMode(!!document.getElementById('glassToggle')?.checked);
}

function onGlassToggleFromHeader() {
  setGlassMode(!!document.getElementById('headerGlassToggle')?.checked);
}

function openAuth() {
  if (currentUser) {
    showSection('dashboardSection');
    return;
  }
  showSection('authSection');
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
  const normalizedBaseAirport = baseAirport.trim().toUpperCase();
  const starterTypeRating = await pickRandomStarterTypeRating();

  const profile = {
    id: user.id,
    username: user.email,
    base_airport: normalizedBaseAirport,
    employer: resolveEmployerForBase(normalizedBaseAirport),
    hours: totalHours,
    balance: 500,
    license: prog.license,
    position: prog.position,
    pay_multiplier: prog.multiplier,
    job_slots: getJobSlotCount(totalHours),
    type_ratings: [starterTypeRating],
    job_refreshes_used: 0,
    job_refresh_window_started_at: null,
    job_refresh_admin_override: false
  };

  let { error } = await supabaseClient.from('profiles').insert([profile]);
  if (error && isMissingJobRefreshColumnError(error)) {
    const fallbackProfile = { ...profile };
    delete fallbackProfile.job_refreshes_used;
    delete fallbackProfile.job_refresh_window_started_at;
    delete fallbackProfile.job_refresh_admin_override;
    ({ error } = await supabaseClient.from('profiles').insert([fallbackProfile]));
  }
  if (error) throw error;
  return profile;
}

async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('row not found');
  return withIdentityDefaults(data);
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
  const enrichedProfile = withIdentityDefaults(profile);
  const prog = getProgression(enrichedProfile.hours || 0);
  const jobSlots = getJobSlotCount(enrichedProfile.hours || 0);
  const effectiveLicense = highestLicense(enrichedProfile.license, prog.license);
  const effectiveState = licenseStateFor(effectiveLicense);
  const effectiveEmployer = resolveEmployerForBase(enrichedProfile.base_airport, enrichedProfile.employer);
  const updates = {};
  if (enrichedProfile.license !== effectiveLicense) updates.license = effectiveLicense;
  if (enrichedProfile.position !== effectiveState.position) updates.position = effectiveState.position;
  if (Number(enrichedProfile.pay_multiplier) !== effectiveState.multiplier) updates.pay_multiplier = effectiveState.multiplier;
  if (enrichedProfile.job_slots !== jobSlots) updates.job_slots = jobSlots;
  if (enrichedProfile.employer !== effectiveEmployer) updates.employer = effectiveEmployer;

  if (Object.keys(updates).length === 0) return enrichedProfile;

  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) throw error;
  return withIdentityDefaults(data);
}

async function persistIdentityLinkUpdates(updates) {
  if (!currentProfile) return false;
  const { data, error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', currentProfile.id)
    .select('*')
    .single();

  if (error) {
    if (isMissingIdentityColumnError(error)) {
      alert('Identity link columns are missing in profiles. Apply the README SQL updates first.');
      return false;
    }
    alert(error.message);
    return false;
  }

  currentProfile = withIdentityDefaults(data);
  renderDashboard(currentProfile);
  return true;
}

async function startDiscourseVerificationFlow() {
  if (!currentProfile) return;
  const input = document.getElementById('discourseUsernameInput');
  const candidate = input?.value || currentProfile.discourse_username || '';
  const username = normalizeIfcUsername(candidate);
  if (!username) {
    alert('Enter a valid IFC username (letters, numbers, _, -, .).');
    return;
  }

  const verificationCode = generateIfcVerificationCode();
  const nowIso = new Date().toISOString();
  const saved = await persistIdentityLinkUpdates({
    discourse_username: username,
    ifc_link_status: 'pending',
    ifc_link_code: verificationCode,
    ifc_link_verified_at: null,
    ifc_link_last_checked_at: nowIso,
    ifc_link_last_error: null
  });
  if (!saved) return;

  syncDiscourseInputsFromProfile(currentProfile);
  renderDiscourseLinkStatus(currentProfile);
  const profileJsonUrl = buildIfcProfileJsonUrl(username);
  alert(`Verification started for @${username}. Add "${verificationCode}" to your IFC profile About Me, save your IFC profile, then confirm with "Yes I have added the code to my account/profile's about me". Profile JSON URL: ${profileJsonUrl}`);
}

async function confirmIfcCodeAddedThenCheck() {
  const confirmed = window.confirm('Please confirm: you have added the verification code to your IFC profile About Me and saved it.');
  if (!confirmed) return;
  await checkDiscourseVerificationFlow();
}

async function checkDiscourseVerificationFlow() {
  if (!currentProfile) return;
  const profile = withIdentityDefaults(currentProfile);
  const input = document.getElementById('discourseUsernameInput');
  const candidate = input?.value || profile.discourse_username || '';
  const username = normalizeIfcUsername(candidate);
  const verificationCode = String(profile.ifc_link_code || '').trim();

  if (!username || !verificationCode) {
    alert('Enter your IFC username and start link verification first to generate your code.');
    return;
  }

  const nowIso = new Date().toISOString();
  const endpoint = buildIfcProfileJsonUrl(username);

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      await persistIdentityLinkUpdates({
        ifc_link_status: 'failed',
        ifc_link_last_checked_at: nowIso,
        ifc_link_last_error: `IFC profile fetch failed (${res.status})`
      });
      alert('Unable to fetch IFC profile right now. Try again shortly.');
      return;
    }

    const payload = await res.json();
    const bioText = readIfcBioText(payload);
    const isVerified = bioText.includes(verificationCode);
    const updates = isVerified
      ? {
        ifc_link_status: 'verified',
        ifc_link_code: null,
        ifc_link_verified_at: nowIso,
        ifc_link_last_checked_at: nowIso,
        ifc_link_last_error: null
      }
      : {
        ifc_link_status: 'pending',
        ifc_link_last_checked_at: nowIso,
        ifc_link_last_error: 'Verification code not found in IFC profile About Me'
      };

    const saved = await persistIdentityLinkUpdates(updates);
    if (!saved) return;

    syncDiscourseInputsFromProfile(currentProfile);
    renderDiscourseLinkStatus(currentProfile);
    alert(isVerified
      ? 'Account link verified successfully.'
      : 'Verification code not found yet. Ensure the exact code is in your IFC profile About Me and retry.');
  } catch (err) {
    await persistIdentityLinkUpdates({
      ifc_link_status: 'failed',
      ifc_link_last_checked_at: nowIso,
      ifc_link_last_error: err?.message || String(err)
    });
    alert('Verification check failed. Please retry.');
  }
}

function setAuthButtonLoading(buttonId, isLoading, loadingText, idleText) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerText = isLoading ? loadingText : idleText;
}

async function login() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) return alert('Enter email and password');

  try {
    setAuthButtonLoading('loginBtn', true, 'Logging in...', 'Login');

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);

    if (data?.user) {
      currentUser = data.user;
      const profile = await ensureProfile(data.user);
      currentProfile = await refreshDerivedProfile(profile);
      await initializeDashboard();
    }
  } catch (err) {
    console.error('Login error:', err);
    alert(err?.message || String(err));
  } finally {
    setAuthButtonLoading('loginBtn', false, 'Logging in...', 'Login');
  }
}

async function registerAccount() {
  const email = document.getElementById('registerEmail')?.value?.trim();
  const password = document.getElementById('registerPassword')?.value;
  const baseAirport = document.getElementById('registerBaseAirport')?.value;

  if (!email || !password) return alert('Enter email and password');
  if (!baseAirport || baseAirport.trim().length < 4) {
    return alert('Enter a Base Airport ICAO code (e.g., WSSS) to register.');
  }

  try {
    setAuthButtonLoading('registerBtn', true, 'Registering...', 'Register');
    const signUpResult = await supabaseClient.auth.signUp({ email, password });
    if (signUpResult.error) return alert(signUpResult.error.message);

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

    currentUser = loginResult.data.user;
    const profile = await ensureProfile(currentUser, baseAirport);
    currentProfile = await refreshDerivedProfile(profile);
    await initializeDashboard();
  } catch (err) {
    console.error('Register error:', err);
    alert(err?.message || String(err));
  } finally {
    setAuthButtonLoading('registerBtn', false, 'Registering...', 'Register');
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  latestGeneratedDispatch = null;
  acceptedJob = null;
  availableJobs = [];
  airlabsCandidateCache = {};
  document.getElementById('userInfo').innerText = 'Not logged in';
  showSection('landingSection');
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
  const normalizedProfile = withIdentityDefaults(profile);
  document.getElementById('userInfo').innerText = `Pilot: ${normalizedProfile.username}`;
  document.getElementById('userRank').innerText = normalizedProfile.license;
  document.getElementById('userBalance').innerText = normalizedProfile.balance;
  document.getElementById('userHours').innerText = normalizedProfile.hours;
  document.getElementById('jobSlots').innerText = normalizedProfile.job_slots ?? 0;
  document.getElementById('userEmployer').innerText = normalizedProfile.employer || 'Unassigned';
  document.getElementById('userBase').innerText = normalizedProfile.base_airport || '----';
  document.getElementById('sidebarEmployer').innerText = `Employer: ${normalizedProfile.employer || 'Unassigned'}`;
  document.getElementById('sidebarBase').innerText = `Base: ${normalizedProfile.base_airport || '----'}`;
  syncDiscourseInputsFromProfile(normalizedProfile);
  renderDiscourseLinkStatus(normalizedProfile);
  renderOnboardingCard(normalizedProfile);
  renderJobRefreshStatus();
}

function restoreLiveryCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVERY_CACHE_KEY) || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      liveryCache = {};
      return;
    }

    const sanitizedCache = {};
    Object.keys(parsed).forEach((aircraftId) => {
      const rawOperators = Array.isArray(parsed[aircraftId]) ? parsed[aircraftId] : [];
      const normalizedOperators = rawOperators
        .map((name) => normalizeAirlineName(name))
        .filter((name) => name && AIRLINE_ROUTE_PROFILES[name]);
      const canonicalOperators = uniqueStrings(normalizedOperators);
      if (canonicalOperators.length) sanitizedCache[aircraftId] = canonicalOperators;
    });

    liveryCache = sanitizedCache;
    persistLiveryCache();
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
  if (!hasTypeRatings(currentProfile)) return 1.0;
  const ratings = (currentProfile?.type_ratings || []).map((rating) => normalizeTypeRatingName(rating));
  const normalizedAircraft = normalizeTypeRatingName(aircraftName);

  if (ratings.some((r) => r.toLowerCase() === normalizedAircraft.toLowerCase())) return 1.2;

  const family = normalizedAircraft.split(' ')[0]?.toLowerCase();
  if (ratings.some((r) => r.toLowerCase().startsWith(family))) return 1.1;

  if (ratings.length >= 8) return 1.06;
  return 1.0;
}

function isPassengerAircraft(name = '') {
  return !/^a-10$|freighter|cargo|\b777f\b|\ba330-200f\b/i.test(name);
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

async function pickRandomStarterTypeRating() {
  const catalog = await loadAircraftCatalog();
  if (!catalog.length) return 'Cessna 172';
  const randomAircraft = pickRandom(catalog);
  return randomAircraft?.displayName || randomAircraft?.name || 'Cessna 172';
}

async function fetchAircraftOperators(aircraftId) {
  if (liveryCache[aircraftId]?.length) {
    const canonicalOperators = uniqueStrings(
      liveryCache[aircraftId]
        .map((name) => normalizeAirlineName(name))
        .filter((name) => name && AIRLINE_ROUTE_PROFILES[name])
    );

    liveryCache[aircraftId] = canonicalOperators;
    return canonicalOperators;
  }

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
  const maxDistance = Math.max(180, Math.floor(range * 0.82));
  const minDistance = Math.min(maxDistance, Math.max(120, Math.floor(range * 0.12)));
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

function getJobRefreshWindowState(profile) {
  const override = Boolean(profile?.job_refresh_admin_override);
  const rawUsed = Number(profile?.job_refreshes_used || 0);
  const used = Number.isFinite(rawUsed) ? Math.max(0, Math.floor(rawUsed)) : 0;
  const startedAtRaw = profile?.job_refresh_window_started_at;
  const startedAtMs = startedAtRaw ? Date.parse(startedAtRaw) : Number.NaN;
  const hasValidStart = Number.isFinite(startedAtMs);
  const windowExpiresAtMs = hasValidStart ? startedAtMs + JOB_MARKET_REFRESH_WINDOW_MS : 0;
  const windowExpired = hasValidStart ? Date.now() >= windowExpiresAtMs : true;

  const effectiveUsed = windowExpired ? 0 : used;
  const remaining = override ? JOB_MARKET_REFRESH_LIMIT : Math.max(0, JOB_MARKET_REFRESH_LIMIT - effectiveUsed);
  return {
    override,
    used: effectiveUsed,
    remaining,
    windowExpired,
    windowStartedAt: windowExpired ? null : new Date(startedAtMs).toISOString(),
    windowExpiresAtMs: windowExpired ? null : windowExpiresAtMs
  };
}

function formatRemainingWindow(msRemaining) {
  if (!Number.isFinite(msRemaining) || msRemaining <= 0) return 'ready now';
  const hours = Math.floor(msRemaining / MS_PER_HOUR);
  const minutes = Math.ceil((msRemaining % MS_PER_HOUR) / MS_PER_MINUTE);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function renderJobRefreshStatus() {
  const statusEl = document.getElementById('jobRefreshStatus');
  const refreshBtn = document.getElementById('refreshJobsBtn');
  if (!statusEl || !refreshBtn || !currentProfile) return;

  const state = getJobRefreshWindowState(currentProfile);
  if (state.override) {
    statusEl.innerText = 'Refreshes remaining: Unlimited (admin override enabled)';
    refreshBtn.disabled = false;
    return;
  }

  const remainingText = `Refreshes remaining: ${state.remaining}/${JOB_MARKET_REFRESH_LIMIT}`;
  if (!state.windowExpiresAtMs) {
    statusEl.innerText = `${remainingText} (36h window starts on first refresh)`;
    refreshBtn.disabled = false;
    return;
  }

  const timeLeft = Math.max(0, state.windowExpiresAtMs - Date.now());
  statusEl.innerText = `${remainingText} (resets in ${formatRemainingWindow(timeLeft)})`;
  refreshBtn.disabled = state.remaining <= 0;
}

async function persistJobRefreshUsage(used, windowStartedAt) {
  const refreshUpdates = {
    job_refreshes_used: used,
    job_refresh_window_started_at: windowStartedAt
  };

  let result = await supabaseClient
    .from('profiles')
    .update(refreshUpdates)
    .eq('id', currentProfile.id)
    .select('*')
    .single();

  if (result.error && isMissingJobRefreshColumnError(result.error)) {
    delete refreshUpdates.job_refreshes_used;
    delete refreshUpdates.job_refresh_window_started_at;
    result = await supabaseClient
      .from('profiles')
      .update(refreshUpdates)
      .eq('id', currentProfile.id)
      .select('*')
      .single();
  }

  if (result.error) {
    alert(result.error.message);
    return false;
  }

  currentProfile = result.data;
  return true;
}

async function requestJobMarketRefresh() {
  if (!currentProfile) return;

  const state = getJobRefreshWindowState(currentProfile);
  if (!state.override && state.remaining <= 0) {
    renderJobRefreshStatus();
    alert(`Refresh limit reached (${JOB_MARKET_REFRESH_LIMIT} per 36 hours). You can refresh jobs again after the window resets.`);
    return;
  }

  if (!state.override) {
    const nowIso = new Date().toISOString();
    const nextUsed = state.windowStartedAt ? state.used + 1 : 1;
    const nextWindowStart = state.windowStartedAt || nowIso;
    const persisted = await persistJobRefreshUsage(nextUsed, nextWindowStart);
    if (!persisted) return;
  }

  await loadJobMarket();
}

async function getRatedPassengerAircraft() {
  const models = await loadAircraftCatalog();
  return models.filter((aircraft) => pilotOwnsTypeForAircraft(currentProfile, aircraft.displayName || aircraft.name));
}

async function generatePassengerJob(index, failureCounter = null) {
  const models = await getRatedPassengerAircraft();
  if (!models.length) {
    recordFailureCode(failureCounter, 'JOBGEN_NO_ELIGIBLE_AIRCRAFT');
    return null;
  }
  const base = resolveProfileBaseAirport(currentProfile);
  if (!base) {
    recordFailureCode(failureCounter, 'JOBGEN_INVALID_BASE_AIRPORT');
    return null;
  }
  const preferredEmployer = normalizeAirlineName(currentProfile?.employer);
  const validatedEmployer = preferredEmployer && AIRLINE_ROUTE_PROFILES[preferredEmployer]
    ? preferredEmployer
    : null;

  for (let attempt = 0; attempt < MAX_JOB_GENERATION_ATTEMPTS_PER_CYCLE; attempt += 1) {
    const aircraft = weightedAircraftPick(models);
    if (!aircraft) {
      recordFailureCode(failureCounter, 'JOBGEN_AIRCRAFT_PICK_FAILED');
      continue;
    }

    const operators = await fetchAircraftOperators(aircraft.id);
    const eligibleAirlines = operators.filter((airlineName) => AIRLINE_ROUTE_PROFILES[airlineName]
      && (!validatedEmployer || airlineName === validatedEmployer));
    if (!operators.length) {
      recordFailureCode(failureCounter, 'JOBGEN_NO_AIRCRAFT_OPERATORS');
      continue;
    }
    if (!eligibleAirlines.length) {
      if (validatedEmployer) {
        recordFailureCode(failureCounter, 'JOBGEN_EMPLOYER_AIRLINE_MISMATCH');
      } else {
        recordFailureCode(failureCounter, 'JOBGEN_NO_ELIGIBLE_AIRLINE');
      }
      continue;
    }
    const airline = pickRandom(eligibleAirlines);
    if (!airline) {
      recordFailureCode(failureCounter, 'JOBGEN_AIRLINE_PICK_FAILED');
      continue;
    }

    const maxRangeNm = getAircraftRangeNm(aircraft.displayName || aircraft.name);
    const airlabsLegs = await fetchAirlabsCandidateLegs({
      dep_icao: base,
      airline,
      maxRangeNm
    });

    let distanceNm = 0;
    let seedLeg = null;

    if (airlabsLegs.length) {
      seedLeg = pickRandom(airlabsLegs);
      distanceNm = haversineNm(seedLeg.origin, seedLeg.destination);
    } else {
      const previewLegs = buildCuratedRoute(base, airline, aircraft.displayName || aircraft.name);
      if (previewLegs.length < 2 || previewLegs.length > 3) {
        if (lastAirlabsHealth.ok) {
          recordFailureCode(failureCounter, 'JOBGEN_AIRLABS_NO_MATCHING_ROUTES');
        } else {
          recordFailureCode(failureCounter, 'JOBGEN_AIRLABS_UNAVAILABLE');
        }
        recordFailureCode(failureCounter, 'JOBGEN_CURATED_FALLBACK_FAILED');
        continue;
      }
      distanceNm = randomDistanceForAircraft(aircraft.name);
    }

    const pay = calculateJobPay(distanceNm, aircraft.name);

    return {
      id: `${Date.now()}_${index}_${attempt}`,
      airline,
      aircraftId: aircraft.id,
      aircraft: aircraft.displayName || aircraft.name,
      distanceNm,
      pay,
      passengerService: true,
      airlabsSeedLeg: seedLeg
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
    if (!hasTypeRatings(currentProfile)) {
      list.innerHTML = '<div class="list-item muted">No type rating found. Buy a type rating in Pilot Shop to unlock jobs.</div>';
      return;
    }

    list.innerHTML = buildNoJobsMessage();
    return;
  }

  availableJobs.forEach((job) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-row"><strong>${normalizeAirlineName(job.airline) || 'Unknown Airline'}</strong><span>$${job.pay.toLocaleString()}</span></div>
      <div class="list-row muted"><span>${job.aircraft}</span><span>${job.distanceNm} nm</span></div>
      <div class="list-row muted"><span>Passenger Service: Yes</span><span>${getTypeRatingMultiplier(job.aircraft) > 1 ? 'Type Rating Bonus Applied' : 'Standard Type Rating Pay'}</span></div>
      <button onclick="acceptJob('${job.id}')">Accept Job</button>
    `;
    list.appendChild(item);
  });
}

async function loadJobMarket() {
  if (!currentProfile) return;
  lastJobMarketFailure = null;
  const baseAirport = resolveProfileBaseAirport(currentProfile);
  if (!baseAirport) {
    availableJobs = [];
    lastJobMarketFailure = {
      code: 'JOBGEN_INVALID_BASE_AIRPORT',
      attempts: 0,
      detail: 'Profile base airport is missing or not in the supported airport list.'
    };
    const list = document.getElementById('jobsList');
    const countEl = document.getElementById('jobsCount');
    if (countEl) countEl.innerText = '0';
    if (list) {
      list.innerHTML = '';
      const message = document.createElement('div');
      message.className = 'list-item muted';
      message.textContent = 'Set a valid base airport in your profile to generate jobs.';
      list.appendChild(message);
    }
    return;
  }

  const slots = Number(currentProfile.job_slots || 0);
  if (slots <= 0) {
    availableJobs = [];
    lastJobMarketFailure = {
      code: 'JOBGEN_NO_JOB_SLOTS',
      attempts: 0,
      detail: 'Profile has zero job slots.'
    };
    renderJobMarket();
    renderJobRefreshStatus();
    return;
  }
  availableJobs = [];
  const failureCounter = {};
  const seen = new Set();
  let attempts = 0;
  const maxAttempts = Math.max(20, slots * 40);

  while (availableJobs.length < slots && attempts < maxAttempts) {
    const job = await generatePassengerJob(attempts, failureCounter);
    attempts += 1;
    if (!job) continue;

    const canonicalAirline = normalizeAirlineName(job.airline);
    if (!canonicalAirline || !AIRLINE_ROUTE_PROFILES[canonicalAirline]) continue;
    job.airline = canonicalAirline;

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

  if (!availableJobs.length) {
    const topFailureCode = getTopFailureCode(failureCounter) || 'JOBGEN_EXHAUSTED_ATTEMPTS';
    lastJobMarketFailure = {
      code: topFailureCode,
      attempts,
      detail: buildJobFailureDetail(topFailureCode)
    };
  } else {
    lastJobMarketFailure = null;
  }

  renderJobMarket();
  renderJobRefreshStatus();
}

function acceptJob(jobId) {
  const job = availableJobs.find((j) => j.id === jobId);
  if (!job) return;
  if (!pilotOwnsTypeForAircraft(currentProfile, job.aircraft)) {
    alert('You do not hold the required type rating for this aircraft.');
    return;
  }

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
  if (currentProfile) renderOnboardingCard(currentProfile);
  showPage('dispatchPage');
}

function getAirportRegion(icao) {
  return AIRPORTS[icao]?.region || 'SEA';
}

function haversineNmBetweenPoints(originLat, originLon, destinationLat, destinationLon) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(destinationLat - originLat);
  const dLon = toRad(destinationLon - originLon);
  const lat1 = toRad(originLat);
  const lat2 = toRad(destinationLat);

  const inner =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
  const km = 6371 * c;
  return Math.round(km * NM_PER_KM);
}

function haversineNm(originIcao, destinationIcao) {
  const a = AIRPORTS[originIcao];
  const b = AIRPORTS[destinationIcao];
  if (!a || !b) return randomInt(300, 2200);
  return haversineNmBetweenPoints(a.lat, a.lon, b.lat, b.lon);
}

function estimateEtaLabel(flight) {
  if (!flight?.destination || flight.status !== 'enroute') return '—';
  if (
    typeof flight.last_lat !== 'number' ||
    typeof flight.last_lng !== 'number' ||
    typeof flight.last_speed !== 'number' ||
    flight.last_speed <= MIN_VALID_TRACKING_SPEED_KTS
  ) {
    return 'Unavailable';
  }

  const destination = AIRPORTS[flight.destination];
  if (!destination) return 'Unavailable';

  const remainingNm = haversineNmBetweenPoints(flight.last_lat, flight.last_lng, destination.lat, destination.lon);
  const etaMinutes = Math.round((remainingNm / flight.last_speed) * 60);
  if (!Number.isFinite(etaMinutes) || etaMinutes <= 0) return '<1m';
  if (etaMinutes >= 60) {
    const hours = Math.floor(etaMinutes / 60);
    const minutes = etaMinutes % 60;
    return `${hours}h ${minutes}m`;
  }
  return `${etaMinutes}m`;
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
  const cleanBase = normalizeBaseAirport(base);
  const profile = AIRLINE_ROUTE_PROFILES[airline];
  if (!profile || !cleanBase) return [];

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
  const sourceLabel = routePlan.routeSource === 'airlabs'
    ? 'AirLabs schedule data'
    : routePlan.routeSource === 'curated'
      ? 'Curated fallback'
      : 'Unknown route source';

  document.getElementById('dispatchResult').innerText =
    `${routePlan.airline} | ${routePlan.aircraft}\n` +
    `Passenger Service: Yes\n` +
    `Route Source: ${sourceLabel}\n` +
    `${text}\n` +
    `Total Dispatch Pay: $${totalPay.toLocaleString()}\n` +
    `Route returns to base by leg ${routePlan.legs.length}.`;

  document.getElementById('startTrackingBtn').style.display = 'block';
  if (currentProfile) renderOnboardingCard(currentProfile);
}

async function generateDispatch() {
  if (!acceptedJob || !currentProfile) {
    alert('Accept a job first.');
    return;
  }

  const base = resolveProfileBaseAirport(currentProfile);
  if (!base) {
    alert('Set a valid base airport in your profile before generating dispatch.');
    return;
  }
  const maxRangeNm = getAircraftRangeNm(acceptedJob.aircraft);
  let legs = [];
  let routeSource = 'airlabs';

  try {
    legs = await buildAirlabsDispatchLegs(base, acceptedJob.airline, acceptedJob.aircraft, acceptedJob.airlabsSeedLeg || null);
  } catch (err) {
    console.warn('AirLabs dispatch generation failed, using fallback:', err);
  }

  if (legs.length < 2 || legs.length > 3) {
    legs = buildCuratedRoute(base, acceptedJob.airline, acceptedJob.aircraft);
    routeSource = 'curated';
  }

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
    routeSource,
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
  const owned = (currentProfile?.type_ratings || []).map((x) => normalizeTypeRatingName(x).toLowerCase());

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

  const currentRatings = uniqueStrings((currentProfile.type_ratings || []).map((rating) => normalizeTypeRatingName(rating)));
  if (currentRatings.some((r) => r.toLowerCase() === normalizeTypeRatingName(displayName).toLowerCase())) {
    alert('Type rating already owned.');
    return;
  }

  if ((currentProfile.balance || 0) < price) {
    alert('Insufficient balance.');
    return;
  }

  const updates = {
    balance: currentProfile.balance - price,
    type_ratings: [...currentRatings, normalizeTypeRatingName(displayName)]
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

  const simbriefCallsign = latestSimbriefPlan?.general
    ? `${latestSimbriefPlan.general.icao_airline || ''}${latestSimbriefPlan.general.flight_number || ''}`.trim()
    : '';
  const callsignRaw = simbriefCallsign || fallbackCallsign;
  const callsign = callsignRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, MAX_CALLSIGN_LENGTH) || fallbackCallsign;

  const { data: existingTracking, error: existingTrackingError } = await supabaseClient
    .from('flight_tracking')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'enroute')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingTrackingError) {
    console.warn('Failed to check existing tracking session:', existingTrackingError.message);
    return null;
  }
  if (existingTracking) return existingTracking;

  const payload = {
    user_id: currentUser.id,
    callsign,
    origin: source.origin || latestSimbriefPlan?.origin?.icao_code || null,
    destination: source.destination || latestSimbriefPlan?.destination?.icao_code || null,
    status: 'enroute',
    server_type: serverType,
    identity_link_status: currentProfile?.ifc_link_status || 'unlinked',
    identity_link_username: currentProfile?.discourse_username || null,
    identity_link_verified_at: currentProfile?.ifc_link_verified_at || null
  };

  let { data, error } = await supabaseClient
    .from('flight_tracking')
    .insert([payload])
    .select('*')
    .single();

  if (error && isMissingIdentityColumnError(error)) {
    const payloadFallback = { ...payload };
    delete payloadFallback.identity_link_status;
    delete payloadFallback.identity_link_username;
    delete payloadFallback.identity_link_verified_at;
    ({ data, error } = await supabaseClient
      .from('flight_tracking')
      .insert([payloadFallback])
      .select('*')
      .single());
  }

  if (error) {
    console.warn('Failed to start tracking:', error.message);
    return null;
  }

  return data;
}

async function fetchSimBrief() {
  const sbUser = (document.getElementById('sbUsername').value || '').trim();
  if (!sbUser) {
    document.getElementById('sbResult').innerText = 'Enter your SimBrief username first.';
    return;
  }
  document.getElementById('sbResult').innerText = 'Fetching...';

  try {
    const res = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(sbUser)}&json=1`);
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
  if (!latestGeneratedDispatch?.legs?.length) {
    alert('Generate a dispatch first.');
    return;
  }

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
    .select('callsign, origin, destination, status, server_type, created_at, last_lat, last_lng, last_speed')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) {
    console.warn('Failed to load tracking history:', error.message);
    return;
  }

  list.innerHTML = '';
  if (!data || data.length === 0) {
    hasTrackingHistory = false;
    empty.style.display = 'block';
    return;
  }

  hasTrackingHistory = true;
  empty.style.display = 'none';
  data.forEach((flight) => {
    const item = document.createElement('li');
    const route = [flight.origin, flight.destination].filter(Boolean).join(' -> ');
    const server = (flight.server_type || 'casual').toUpperCase();
    const statusRaw = String(flight.status || 'enroute');
    const status = statusRaw.toLowerCase();
    const statusLabel = statusRaw.toUpperCase();
    const created = flight.created_at ? new Date(flight.created_at).toLocaleString() : '';
    const etaLabel = estimateEtaLabel({ ...flight, status });

    item.innerHTML = `
      <div class="history-line">
        <span>Callsign: ${flight.callsign || 'DISPATCH'}</span>
        <span>${route || 'Route pending'}</span>
      </div>
      <div class="history-meta">
        <span>${server}</span>
        <span>${statusLabel}</span>
        <span>ETA: ${etaLabel}</span>
        <span>${created}</span>
      </div>
    `;
    list.appendChild(item);
  });
  if (currentProfile) renderOnboardingCard(currentProfile);
}

function renderOnboardingCard(profile) {
  const onboardingList = document.getElementById('onboardingChecklist');
  if (!onboardingList) return;

  const hasRatings = Array.isArray(profile?.type_ratings) && profile.type_ratings.length > 0;
  const isNewPilot = Number(profile?.hours || 0) < NEW_PILOT_HOURS_THRESHOLD;
  const hasBase = !!profile?.base_airport;
  const hasAcceptedJob = !!acceptedJob;
  const hasDispatch = !!latestGeneratedDispatch?.legs?.length;
  const hasIfcLink = String(profile?.ifc_link_status || '') === 'verified';

  onboardingList.innerHTML = `
    <li>${hasBase ? '✅' : '⬜'} Set your base airport</li>
    <li>${hasIfcLink ? '✅' : '⬜'} Verify your Discourse / IFC account link</li>
    <li>${hasAcceptedJob ? '✅' : '⬜'} Accept a job in Job Market</li>
    <li>${hasDispatch ? '✅' : '⬜'} Generate dispatch route (2–3 legs)</li>
    <li>${hasTrackingHistory ? '✅' : '⬜'} Start tracking from Dispatch Center</li>
    <li>${hasRatings ? '✅' : '⬜'} Buy your first type rating in Pilot Shop</li>
    <li>${isNewPilot ? '⬜' : '✅'} Complete your first validated flight</li>
  `;
}

async function initializeDashboard() {
  if (!currentProfile) return;

  showSection('dashboardSection');
  showPage('overviewPage');
  renderDashboard(currentProfile);
  renderJobRefreshStatus();
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
window.onThemeChangeFromHeader = onThemeChangeFromHeader;
window.onGlassToggle = onGlassToggle;
window.onGlassToggleFromHeader = onGlassToggleFromHeader;
window.openAuth = openAuth;
window.showPage = showPage;
window.login = login;
window.registerAccount = registerAccount;
window.logout = logout;
window.toggleReset = toggleReset;
window.resetPassword = resetPassword;
window.completePasswordRecovery = completePasswordRecovery;
window.fetchSimBrief = fetchSimBrief;
window.dispatchFlight = dispatchFlight;
window.loadJobMarket = loadJobMarket;
window.requestJobMarketRefresh = requestJobMarketRefresh;
window.acceptJob = acceptJob;
window.generateDispatch = generateDispatch;
window.buyLicense = buyLicense;
window.buyTypeRating = buyTypeRating;
window.startDiscourseVerificationFlow = startDiscourseVerificationFlow;
window.checkDiscourseVerificationFlow = checkDiscourseVerificationFlow;
