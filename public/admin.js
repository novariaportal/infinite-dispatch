const supabaseUrl = window.SUPABASE_URL;
const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

const ADMIN_PASSWORD = 'ifdispatchadmin';
const LICENSE_OPTIONS = ['CPL', 'MPL', 'ATPL'];
const DEFAULT_EMPLOYER_OPTIONS = [
  'American Airlines',
  'ANA',
  'Air France',
  'British Airways',
  'Cathay Pacific',
  'Delta Air Lines',
  'Emirates',
  'Etihad Airways',
  'Japan Airlines',
  'KLM',
  'Lufthansa',
  'Qantas',
  'Qatar Airways',
  'Saudia',
  'Singapore Airlines',
  'Turkish Airlines',
  'United Airlines'
];

function formatRatings(raw) {
  return (raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSelectOptions(options, selectedValue) {
  return options
    .map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(value)}</option>`)
    .join('');
}

function getEmployerOptions(profile) {
  const combined = ['', ...DEFAULT_EMPLOYER_OPTIONS, profile.employer].filter((value) => value != null);
  const deduped = [...new Set(combined)];
  return deduped.sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });
}

function getLicenseOptions(profile) {
  const baseOptions = [...LICENSE_OPTIONS];
  if (profile.license && !baseOptions.includes(profile.license)) {
    return [profile.license, ...baseOptions];
  }
  return baseOptions;
}

function profileCard(profile) {
  const wrap = document.createElement('div');
  wrap.className = 'list-item';
  const profileName = escapeHtml(profile.username || profile.id);
  const profileId = escapeHtml(profile.id);
  const licenseOptions = getLicenseOptions(profile);
  const selectedLicense = licenseOptions.includes(profile.license) ? profile.license : licenseOptions[0];
  const employerOptions = getEmployerOptions(profile);

  wrap.innerHTML = `
    <div class="list-row"><strong>${profileName}</strong><span>${profileId}</span></div>
    <label>Hours</label>
    <input id="hours_${profile.id}" type="number" value="${profile.hours ?? 0}">
    <label>Jobs / Job Slots</label>
    <input id="slots_${profile.id}" type="number" value="${profile.job_slots ?? 0}">
    <label>License(s)</label>
    <select id="license_${profile.id}">
      ${buildSelectOptions(licenseOptions, selectedLicense)}
    </select>
    <label>Position</label>
    <input id="position_${profile.id}" type="text" value="${profile.position || ''}">
    <label>Pay Multiplier</label>
    <input id="multiplier_${profile.id}" type="number" step="0.1" value="${profile.pay_multiplier ?? 1}">
    <label>Type Ratings (comma separated)</label>
    <input id="ratings_${profile.id}" type="text" value="${(profile.type_ratings || []).join(', ')}">
    <label>Money / Balance</label>
    <input id="balance_${profile.id}" type="number" value="${profile.balance ?? 0}">
    <label>Employer</label>
    <select id="employer_${profile.id}">
      ${buildSelectOptions(employerOptions, profile.employer || '')}
    </select>
    <label>Base Airport</label>
    <input id="base_${profile.id}" type="text" value="${profile.base_airport || ''}">
    <button onclick="saveProfile('${profile.id}')">Save Profile</button>
  `;
  return wrap;
}

async function unlockAdmin() {
  const pw = document.getElementById('adminPassword').value;
  if (pw !== ADMIN_PASSWORD) {
    alert('Invalid admin password.');
    return;
  }

  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  document.getElementById('adminStatus').innerText = 'Admin unlocked, showing users.';
  await loadProfiles();
}

async function loadProfiles() {
  const container = document.getElementById('profilesContainer');
  const filterId = document.getElementById('profileIdSearch').value.trim();
  container.innerHTML = '';

  let query = supabaseClient
    .from('profiles')
    .select('id, username, hours, job_slots, license, position, pay_multiplier, type_ratings, balance, employer, base_airport')
    .order('created_at', { ascending: false });

  if (filterId) {
    query = query.eq('id', filterId);
  }

  const { data, error } = await query;
  if (error) {
    container.innerHTML = `<div class="list-item muted">${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<div class="list-item muted">No profiles found.</div>';
    return;
  }

  data.forEach((profile) => container.appendChild(profileCard(profile)));
}

async function saveProfile(profileId) {
  const updates = {
    hours: Number(document.getElementById(`hours_${profileId}`).value || 0),
    job_slots: Number(document.getElementById(`slots_${profileId}`).value || 0),
    license: (document.getElementById(`license_${profileId}`).value || '').trim(),
    position: (document.getElementById(`position_${profileId}`).value || '').trim(),
    pay_multiplier: Number(document.getElementById(`multiplier_${profileId}`).value || 1),
    type_ratings: formatRatings(document.getElementById(`ratings_${profileId}`).value),
    balance: Number(document.getElementById(`balance_${profileId}`).value || 0),
    employer: (document.getElementById(`employer_${profileId}`).value || '').trim(),
    base_airport: (document.getElementById(`base_${profileId}`).value || '').trim().toUpperCase()
  };

  const { error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', profileId);

  if (error) {
    alert(error.message);
    return;
  }

  alert('Profile updated.');
}

window.unlockAdmin = unlockAdmin;
window.loadProfiles = loadProfiles;
window.saveProfile = saveProfile;
