const supabaseUrl = window.SUPABASE_URL;
const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

const ADMIN_PASSWORD = 'ifdispatchadmin';
const LICENSE_OPTIONS = ['CPL', 'MPL', 'ATPL'];
const VALID_LICENSE_SET = new Set(LICENSE_OPTIONS);
const ICAO_REGEX = /^[A-Z]{4}$/;
const TYPE_RATING_TOKEN_REGEX = /^[A-Z0-9/-]{2,12}$/;
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
const BASE_AIRPORT_DATALIST_ID = 'supportedBaseAirportsList';

function formatRatings(raw) {
  return (raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function sanitizeTypeRatings(raw) {
  const invalidTokens = [];
  const normalized = [];
  formatRatings(raw).forEach((token) => {
    const sanitized = token
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9/-]/g, '');
    if (!sanitized || !TYPE_RATING_TOKEN_REGEX.test(sanitized)) {
      invalidTokens.push(token);
      return;
    }
    normalized.push(sanitized);
  });
  return {
    ratings: [...new Set(normalized)],
    invalidTokens
  };
}

function getFieldErrorElement(profileId, fieldName) {
  return document.getElementById(`error_${fieldName}_${profileId}`);
}

function getFieldInputElement(profileId, fieldName) {
  const map = {
    hours: 'hours',
    slots: 'slots',
    license: 'license',
    ratings: 'ratings',
    balance: 'balance',
    base: 'base'
  };
  const prefix = map[fieldName];
  if (!prefix) return null;
  return document.getElementById(`${prefix}_${profileId}`);
}

function clearFieldError(profileId, fieldName) {
  const errorEl = getFieldErrorElement(profileId, fieldName);
  const inputEl = getFieldInputElement(profileId, fieldName);
  if (!errorEl) return;
  errorEl.textContent = '';
  errorEl.classList.remove('field-error-visible');
  if (inputEl) inputEl.setAttribute('aria-invalid', 'false');
}

function setFieldError(profileId, fieldName, message) {
  const errorEl = getFieldErrorElement(profileId, fieldName);
  const inputEl = getFieldInputElement(profileId, fieldName);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.add('field-error-visible');
  if (inputEl) inputEl.setAttribute('aria-invalid', 'true');
}

function clearValidationErrors(profileId) {
  ['hours', 'slots', 'license', 'ratings', 'balance', 'base'].forEach((field) => clearFieldError(profileId, field));
}

function bindValidationClearHandlers(profileId) {
  const fieldMap = {
    hours: `hours_${profileId}`,
    slots: `slots_${profileId}`,
    license: `license_${profileId}`,
    ratings: `ratings_${profileId}`,
    balance: `balance_${profileId}`,
    base: `base_${profileId}`
  };
  Object.entries(fieldMap).forEach(([fieldName, inputId]) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => clearFieldError(profileId, fieldName));
  });
}

function parsePositiveInteger(rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return null;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildValidatedProfileUpdates(profileId) {
  clearValidationErrors(profileId);

  const hoursInput = document.getElementById(`hours_${profileId}`);
  const slotsInput = document.getElementById(`slots_${profileId}`);
  const licenseInput = document.getElementById(`license_${profileId}`);
  const ratingsInput = document.getElementById(`ratings_${profileId}`);
  const balanceInput = document.getElementById(`balance_${profileId}`);
  const baseInput = document.getElementById(`base_${profileId}`);

  const hours = parsePositiveInteger(hoursInput?.value);
  const jobSlots = parsePositiveInteger(slotsInput?.value);
  const balance = parsePositiveInteger(balanceInput?.value);
  const license = (licenseInput?.value || '').trim();
  const baseAirport = (baseInput?.value || '').trim().toUpperCase();
  const { ratings, invalidTokens } = sanitizeTypeRatings(ratingsInput?.value || '');

  let hasErrors = false;

  if (hours === null) {
    setFieldError(profileId, 'hours', 'Hours must be a positive integer.');
    hasErrors = true;
  }
  if (jobSlots === null) {
    setFieldError(profileId, 'slots', 'Job slots must be a positive integer.');
    hasErrors = true;
  }
  if (balance === null) {
    setFieldError(profileId, 'balance', 'Balance must be a positive integer.');
    hasErrors = true;
  }
  if (!VALID_LICENSE_SET.has(license)) {
    setFieldError(profileId, 'license', `License must be one of: ${LICENSE_OPTIONS.join(', ')}.`);
    hasErrors = true;
  }
  // Empty base airport values are intentionally allowed for legacy/optional profile data.
  if (baseAirport && !ICAO_REGEX.test(baseAirport)) {
    setFieldError(profileId, 'base', 'Base airport must be a valid ICAO code (4 letters, e.g. KJFK).');
    hasErrors = true;
  }
  if (invalidTokens.length > 0) {
    setFieldError(
      profileId,
      'ratings',
      `Invalid ratings: ${invalidTokens.join(', ')}. Use only letters, numbers, "/" or "-".`
    );
    hasErrors = true;
  }

  if (hasErrors) return null;

  if (ratingsInput) ratingsInput.value = ratings.join(', ');
  if (baseInput) baseInput.value = baseAirport;

  return {
    hours,
    job_slots: jobSlots,
    license,
    type_ratings: ratings,
    balance,
    base_airport: baseAirport
  };
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
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_IDENTITY_FIELDS}`);
  }
  if (result.error && isMissingIdentityColumnError(result.error)) {
    result = await buildQuery(`${PROFILE_SELECT_BASE_FIELDS}, ${PROFILE_SELECT_REFRESH_FIELDS}`);
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
    <input id="hours_${profile.id}" type="number" min="1" step="1" value="${profile.hours ?? 0}">
    <div id="error_hours_${profile.id}" class="field-error" aria-live="polite"></div>
    <label>Jobs / Job Slots</label>
    <input id="slots_${profile.id}" type="number" min="1" step="1" value="${profile.job_slots ?? 0}">
    <div id="error_slots_${profile.id}" class="field-error" aria-live="polite"></div>
    <label>License(s)</label>
    <select id="license_${profile.id}">
      ${buildSelectOptions(licenseOptions, selectedLicense)}
    </select>
    <div id="error_license_${profile.id}" class="field-error" aria-live="polite"></div>
    <label>Position</label>
    <input id="position_${profile.id}" type="text" value="${profile.position || ''}">
    <label>Pay Multiplier</label>
    <input id="multiplier_${profile.id}" type="number" step="0.1" value="${profile.pay_multiplier ?? 1}">
    <label>Type Ratings (comma separated)</label>
    <input id="ratings_${profile.id}" type="text" value="${(profile.type_ratings || []).join(', ')}">
    <div id="error_ratings_${profile.id}" class="field-error" aria-live="polite"></div>
    <label>Money / Balance</label>
    <input id="balance_${profile.id}" type="number" min="1" step="1" value="${profile.balance ?? 0}">
    <div id="error_balance_${profile.id}" class="field-error" aria-live="polite"></div>
    <label>Employer</label>
    <select id="employer_${profile.id}">
      ${buildSelectOptions(employerOptions, profile.employer || '')}
    </select>
    <label>Base Airport (ICAO format)</label>
    <input id="base_${profile.id}" type="text" list="${BASE_AIRPORT_DATALIST_ID}" maxlength="4" value="${profile.base_airport || ''}">
    <div id="error_base_${profile.id}" class="field-error" aria-live="polite"></div>
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
  bindValidationClearHandlers(profile.id);
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
  const validatedProfileFields = buildValidatedProfileUpdates(profileId);
  if (!validatedProfileFields) return;

  const updates = {
    ...validatedProfileFields,
    position: (document.getElementById(`position_${profileId}`).value || '').trim(),
    pay_multiplier: Number(document.getElementById(`multiplier_${profileId}`).value || 1),
    employer: (document.getElementById(`employer_${profileId}`).value || '').trim(),
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
