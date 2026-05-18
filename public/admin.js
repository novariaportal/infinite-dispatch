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
const PROFILE_SELECT_IDENTITY_FIELDS = 'discourse_username, ifc_link_status, ifc_link_code, ifc_link_verified_at, ifc_link_last_checked_at, ifc_link_last_error';
const PROFILE_SELECT_SIMBRIEF_TRACKING_FIELDS = 'simbrief_tracking_admin_enabled';
const PROFILE_SELECT_ALL_FIELDS = `${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}, ${PROFILE_SELECT_IDENTITY_FIELDS}, ${PROFILE_SELECT_SIMBRIEF_TRACKING_FIELDS}`;
const SUPPORTED_BASE_AIRPORTS = [
  'WSSS', 'WIII', 'VTBS', 'WMKK', 'RJTT', 'RJAA', 'VHHH', 'ZBAA', 'YSSY', 'YMML', 'YBBN', 'YPPH', 'YPAD',
  'NZAA', 'EGLL', 'EGKK', 'LFPG', 'EHAM', 'OMDB', 'OTHH', 'OJED', 'OERK', 'OMAA', 'LTBA', 'EDDF', 'LFPO',
  'RKSI', 'RJBB', 'KJFK', 'KLAX', 'KSFO', 'KSEA', 'KMIA', 'KORD'
];
const SUPPORTED_BASE_AIRPORT_SET = new Set(SUPPORTED_BASE_AIRPORTS);
const BASE_AIRPORT_DATALIST_ID = 'supportedBaseAirportsList';

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

function ensureBaseAirportDatalist() {
  if (document.getElementById(BASE_AIRPORT_DATALIST_ID)) return;
  const datalist = document.createElement('datalist');
  datalist.id = BASE_AIRPORT_DATALIST_ID;
  SUPPORTED_BASE_AIRPORTS.forEach((icao) => {
    const option = document.createElement('option');
    option.value = icao;
    datalist.appendChild(option);
  });
  document.body.appendChild(datalist);
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

function isMissingSimBriefTrackingColumnError(error) {
  const code = String(error?.code || '').trim();
  if (code === '42703' || code === 'PGRST204') return true;
  const message = String(error?.message || '');
  return /simbrief_tracking_admin_enabled/i.test(message);
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

function withIdentityDefaults(profile) {
  const rawStatus = String(profile?.ifc_link_status || 'unlinked').trim().toLowerCase();
  const allowed = ['unlinked', 'pending', 'verified', 'failed'];
  return {
    ...profile,
    discourse_username: String(profile?.discourse_username || '').trim(),
    ifc_link_status: allowed.includes(rawStatus) ? rawStatus : 'unlinked',
    ifc_link_code: String(profile?.ifc_link_code || '').trim(),
    ifc_link_verified_at: profile?.ifc_link_verified_at ?? null,
    ifc_link_last_checked_at: profile?.ifc_link_last_checked_at ?? null,
    ifc_link_last_error: String(profile?.ifc_link_last_error || '').trim()
  };
}

function withSimBriefTrackingDefaults(profile) {
  return {
    ...profile,
    simbrief_tracking_admin_enabled: Boolean(profile?.simbrief_tracking_admin_enabled)
  };
}

async function runProfileSelectWithFallback(buildQuery) {
  let result = await buildQuery(PROFILE_SELECT_ALL_FIELDS);
  if (result.error && isMissingSimBriefTrackingColumnError(result.error)) {
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}, ${PROFILE_SELECT_IDENTITY_FIELDS}`);
  }
  if (result.error && isMissingJobRefreshColumnError(result.error)) {
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_IDENTITY_FIELDS}, ${PROFILE_SELECT_SIMBRIEF_TRACKING_FIELDS}`);
  }
  if (result.error && isMissingIdentityColumnError(result.error)) {
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}, ${PROFILE_SELECT_SIMBRIEF_TRACKING_FIELDS}`);
  }
  if (result.error && isMissingSimBriefTrackingColumnError(result.error)) {
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}, ${PROFILE_SELECT_IDENTITY_FIELDS}`);
  }
  if (result.error && isMissingJobRefreshColumnError(result.error)) {
    result = await buildQuery(PROFILE_SELECT_BASE_FIELDS);
  }
  if (!result.error) {
    result.data = (result.data || []).map((profile) => withSimBriefTrackingDefaults(withIdentityDefaults(withRefreshDefaults(profile))));
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
  const identityStatus = profile.ifc_link_status || 'unlinked';

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
    <label>Base Airport (supported ICAO only)</label>
    <input id="base_${profile.id}" type="text" list="${BASE_AIRPORT_DATALIST_ID}" maxlength="4" value="${profile.base_airport || ''}">
    <label>Job Refreshes Used (36h window)</label>
    <input id="refreshes_${profile.id}" type="number" min="0" value="${refreshesUsed}">
    <label>Job Refresh Window Start (ISO or blank)</label>
    <input id="refreshWindow_${profile.id}" type="text" value="${refreshWindowStart}">
    <label class="checkbox-row" for="refreshOverride_${profile.id}">
      <input id="refreshOverride_${profile.id}" type="checkbox" ${profile.job_refresh_admin_override ? 'checked' : ''}>
      Admin override refresh limit
    </label>
    <label class="checkbox-row" for="simbriefTrackingOverride_${profile.id}">
      <input id="simbriefTrackingOverride_${profile.id}" type="checkbox" ${profile.simbrief_tracking_admin_enabled ? 'checked' : ''}>
      Enable SimBrief-only tracking start (without dispatch generation)
    </label>
    <label>Discourse Username</label>
    <input id="discourseUsername_${profile.id}" type="text" value="${escapeHtml(profile.discourse_username || '')}">
    <label>IFC Link Status</label>
    <select id="ifcStatus_${profile.id}">
      ${buildSelectOptions(['unlinked', 'pending', 'verified', 'failed'], identityStatus)}
    </select>
    <label>IFC Link Code</label>
    <input id="ifcCode_${profile.id}" type="text" value="${escapeHtml(profile.ifc_link_code || '')}">
    <label>IFC Verified At (ISO or blank)</label>
    <input id="ifcVerifiedAt_${profile.id}" type="text" value="${escapeHtml(profile.ifc_link_verified_at || '')}">
    <label>IFC Last Checked At (ISO or blank)</label>
    <input id="ifcCheckedAt_${profile.id}" type="text" value="${escapeHtml(profile.ifc_link_last_checked_at || '')}">
    <label>IFC Last Error</label>
    <input id="ifcLastError_${profile.id}" type="text" value="${escapeHtml(profile.ifc_link_last_error || '')}">
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
  const baseAirport = (document.getElementById(`base_${profileId}`).value || '').trim().toUpperCase();
  if (baseAirport && !SUPPORTED_BASE_AIRPORT_SET.has(baseAirport)) {
    alert(`Unsupported base airport ICAO "${baseAirport}". Use one of the supported airports in the suggestion list.`);
    return;
  }

  const updates = {
    hours: Number(document.getElementById(`hours_${profileId}`).value || 0),
    job_slots: Number(document.getElementById(`slots_${profileId}`).value || 0),
    license: (document.getElementById(`license_${profileId}`).value || '').trim(),
    position: (document.getElementById(`position_${profileId}`).value || '').trim(),
    pay_multiplier: Number(document.getElementById(`multiplier_${profileId}`).value || 1),
    type_ratings: formatRatings(document.getElementById(`ratings_${profileId}`).value),
    balance: Number(document.getElementById(`balance_${profileId}`).value || 0),
    employer: (document.getElementById(`employer_${profileId}`).value || '').trim(),
    base_airport: baseAirport,
    job_refreshes_used: Math.max(0, Number(document.getElementById(`refreshes_${profileId}`).value || 0)),
    job_refresh_window_started_at: (document.getElementById(`refreshWindow_${profileId}`).value || '').trim() || null,
    job_refresh_admin_override: Boolean(document.getElementById(`refreshOverride_${profileId}`).checked),
    simbrief_tracking_admin_enabled: Boolean(document.getElementById(`simbriefTrackingOverride_${profileId}`).checked),
    discourse_username: (document.getElementById(`discourseUsername_${profileId}`).value || '').trim(),
    ifc_link_status: (document.getElementById(`ifcStatus_${profileId}`).value || 'unlinked').trim(),
    ifc_link_code: (document.getElementById(`ifcCode_${profileId}`).value || '').trim() || null,
    ifc_link_verified_at: (document.getElementById(`ifcVerifiedAt_${profileId}`).value || '').trim() || null,
    ifc_link_last_checked_at: (document.getElementById(`ifcCheckedAt_${profileId}`).value || '').trim() || null,
    ifc_link_last_error: (document.getElementById(`ifcLastError_${profileId}`).value || '').trim() || null
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

  if (error && isMissingIdentityColumnError(error)) {
    delete updates.discourse_username;
    delete updates.ifc_link_status;
    delete updates.ifc_link_code;
    delete updates.ifc_link_verified_at;
    delete updates.ifc_link_last_checked_at;
    delete updates.ifc_link_last_error;
    ({ error } = await supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', profileId));
  }

  if (error && isMissingSimBriefTrackingColumnError(error)) {
    delete updates.simbrief_tracking_admin_enabled;
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

ensureBaseAirportDatalist();
