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
const PROFILE_SELECT_BASE_FIELDS = 'id, username, hours, job_slots, license, position, pay_multiplier, type_ratings, balance, employer, base_airport';
const PROFILE_SELECT_REFRESH_FIELDS = 'job_refreshes_used, job_refresh_window_started_at, job_refresh_admin_override';
const PROFILE_SELECT_ALL_FIELDS = `${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}`;

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
  const combined = [...DEFAULT_EMPLOYER_OPTIONS];
  if (profile.employer != null && profile.employer !== '') combined.push(profile.employer);
  const dedupedNonEmpty = [...new Set(combined)].sort((a, b) => a.localeCompare(b));
  return ['', ...dedupedNonEmpty];
}

function getLicenseOptions(profile) {
  const baseOptions = [...LICENSE_OPTIONS];
  if (profile.license && !baseOptions.includes(profile.license)) {
    return [profile.license, ...baseOptions];
  }
  return baseOptions;
}

function isMissingJobRefreshColumnError(error) {
  const code = String(error?.code || '').trim();
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error?.message || '');
  return /job_refresh/i.test(message);
}

function withRefreshDefaults(profile) {
  const rawRefreshCount = Number(profile?.job_refreshes_used);
  return {
    ...profile,
    job_refreshes_used: Number.isFinite(rawRefreshCount) ? rawRefreshCount : 0,
    job_refresh_window_started_at: profile?.job_refresh_window_started_at ?? null,
    job_refresh_admin_override: Boolean(profile?.job_refresh_admin_override)
  };
}

async function runProfileSelectWithFallback(buildQuery) {
  let result = await buildQuery(PROFILE_SELECT_ALL_FIELDS);
  if (result.error && isMissingJobRefreshColumnError(result.error)) {
    result = await buildQuery(PROFILE_SELECT_BASE_FIELDS);
  }
  if (!result.error) {
    result.data = (result.data || []).map((profile) => withRefreshDefaults(profile));
  }
  return result;
}

function profileCard(profile) {
  const wrap = document.createElement('div');
  wrap.className = 'list-item';
  const profileName = escapeHtml(profile.username || profile.id);
  const profileId = escapeHtml(profile.id);
  const licenseOptions = getLicenseOptions(profile);
  const selectedLicense = licenseOptions.includes(profile.license) ? profile.license : licenseOptions[0];
  const employerOptions = getEmployerOptions(profile);
  const refreshesUsed = Number.isFinite(Number(profile.job_refreshes_used)) ? Number(profile.job_refreshes_used) : 0;
  const refreshWindowStart = profile.job_refresh_window_started_at || '';

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
    <label>Job Refreshes Used (36h window)</label>
    <input id="refreshes_${profile.id}" type="number" min="0" value="${refreshesUsed}">
    <label>Job Refresh Window Start (ISO or blank)</label>
    <input id="refreshWindow_${profile.id}" type="text" value="${refreshWindowStart}">
    <label class="checkbox-row" for="refreshOverride_${profile.id}">
      <input id="refreshOverride_${profile.id}" type="checkbox" ${profile.job_refresh_admin_override ? 'checked' : ''}>
      Admin override refresh limit
    </label>
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
  let data = [];

  if (filterId) {
    const { data: filteredData, error } = await runProfileSelectWithFallback((selectFields) => supabaseClient
      .from('profiles')
      .select(selectFields)
      .eq('id', filterId)
      .order('created_at', { ascending: false })
      .limit(1));
    if (error) {
      container.innerHTML = `<div class="list-item muted">${error.message}</div>`;
      return;
    }
    data = filteredData || [];
  } else {
    const pageSize = 200;
    let from = 0;

    while (true) {
      const { data: chunk, error } = await runProfileSelectWithFallback((selectFields) => supabaseClient
        .from('profiles')
        .select(selectFields)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1));

      if (error) {
        container.innerHTML = `<div class="list-item muted">${error.message}</div>`;
        return;
      }

      if (!chunk?.length) break;
      data.push(...chunk);
      if (chunk.length < pageSize) break;
      from += pageSize;
    }
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
    base_airport: (document.getElementById(`base_${profileId}`).value || '').trim().toUpperCase(),
    job_refreshes_used: Math.max(0, Number(document.getElementById(`refreshes_${profileId}`).value || 0)),
    job_refresh_window_started_at: (document.getElementById(`refreshWindow_${profileId}`).value || '').trim() || null,
    job_refresh_admin_override: Boolean(document.getElementById(`refreshOverride_${profileId}`).checked)
  };

  let { error } = await supabaseClient
    .from('profiles')
    .update(updates)
    .eq('id', profileId);

  if (error && isMissingJobRefreshColumnError(error)) {
    delete updates.job_refreshes_used;
    delete updates.job_refresh_window_started_at;
    delete updates.job_refresh_admin_override;
    ({ error } = await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', profileId));
  }

  if (error) {
    alert(error.message);
    return;
  }

  alert('Profile updated.');
}

window.unlockAdmin = unlockAdmin;
window.loadProfiles = loadProfiles;
window.saveProfile = saveProfile;
