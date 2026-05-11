const supabaseUrl = window.SUPABASE_URL;
const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

const ADMIN_PASSWORD = 'ifdispatchadmin';

function formatRatings(raw) {
  return (raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function profileCard(profile) {
  const wrap = document.createElement('div');
  wrap.className = 'list-item';
  wrap.innerHTML = `
    <div class="list-row"><strong>${profile.username || profile.id}</strong><span>${profile.id}</span></div>
    <label>Hours</label>
    <input id="hours_${profile.id}" type="number" value="${profile.hours ?? 0}">
    <label>Jobs / Job Slots</label>
    <input id="slots_${profile.id}" type="number" value="${profile.job_slots ?? 0}">
    <label>License(s)</label>
    <input id="license_${profile.id}" type="text" value="${profile.license || ''}">
    <label>Type Ratings (comma separated)</label>
    <input id="ratings_${profile.id}" type="text" value="${(profile.type_ratings || []).join(', ')}">
    <label>Money / Balance</label>
    <input id="balance_${profile.id}" type="number" value="${profile.balance ?? 0}">
    <label>Employer</label>
    <input id="employer_${profile.id}" type="text" value="${profile.employer || ''}">
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

  const { data } = await supabaseClient.auth.getSession();
  if (!data?.session?.user) {
    alert('Log into Infinite Dispatch first. Admin is profiles-only and requires a signed-in profile context.');
    return;
  }

  document.getElementById('adminGate').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  document.getElementById('adminStatus').innerText = `Signed in as ${data.session.user.email}`;
  await loadProfiles();
}

async function loadProfiles() {
  const container = document.getElementById('profilesContainer');
  const filterId = document.getElementById('profileIdSearch').value.trim();
  container.innerHTML = '';

  let query = supabaseClient
    .from('profiles')
    .select('id, username, hours, job_slots, license, type_ratings, balance, employer, base_airport')
    .order('created_at', { ascending: false })
    .limit(50);

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
