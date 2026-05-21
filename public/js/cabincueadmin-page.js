(function () {
  const supabaseUrl = window.SUPABASE_URL;
  const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
  const CABINCUE_ADMIN_PASSWORD = 'ifdispatchadmin';
  const CABINCUE_ADMIN_BYPASS_KEY = 'infinite_dispatch_cabincue_admin_bypass';
  const CABINCUE_ADMIN_BYPASS_TOKEN_KEY = 'infinite_dispatch_cabincue_admin_bypass_token';
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

  function byId(id) {
    return document.getElementById(id);
  }

  function hasAdminRedirectBypass() {
    const params = new URLSearchParams(window.location.search);
    const source = (params.get('source') || '').trim().toLowerCase();
    const token = (params.get('token') || '').trim();
    try {
      return source === 'admin'
        && token
        && window.sessionStorage.getItem(CABINCUE_ADMIN_BYPASS_KEY) === '1'
        && window.sessionStorage.getItem(CABINCUE_ADMIN_BYPASS_TOKEN_KEY) === token;
    } catch {
      return false;
    }
  }

  function clearAdminRedirectBypass() {
    try {
      window.sessionStorage.removeItem(CABINCUE_ADMIN_BYPASS_KEY);
      window.sessionStorage.removeItem(CABINCUE_ADMIN_BYPASS_TOKEN_KEY);
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  }

  async function unlockCabinCueAdmin() {
    const bypassedFromAdmin = hasAdminRedirectBypass();
    if (!bypassedFromAdmin) {
      const password = byId('cabincueAdminPassword')?.value || '';
      if (password !== CABINCUE_ADMIN_PASSWORD) {
        byId('cabincueAdminGateStatus').textContent = 'Invalid CabinCue admin password.';
        return;
      }
    }

    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) {
      byId('cabincueAdminGateStatus').textContent = `Session check failed: ${error.message}`;
      return;
    }
    if (!data?.session) {
      byId('cabincueAdminGateStatus').textContent = 'No active session found. Log in on the main app first.';
      return;
    }

    clearAdminRedirectBypass();
    byId('cabincueAdminGate').style.display = 'none';
    byId('cabincueAdminPanel').style.display = 'block';
    byId('cabincueAdminStatus').textContent = 'CabinCue admin unlocked.';
    if (typeof window.initCabinCueAdmin === 'function') {
      await window.initCabinCueAdmin();
    }
  }

  window.unlockCabinCueAdmin = unlockCabinCueAdmin;

  if (hasAdminRedirectBypass()) {
    unlockCabinCueAdmin();
  }
})();
