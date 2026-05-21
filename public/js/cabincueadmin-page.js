(function () {
  const supabaseUrl = window.SUPABASE_URL;
  const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

  function byId(id) {
    return document.getElementById(id);
  }

  async function unlockCabinCueAdmin() {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) {
      byId('cabincueAdminGateStatus').textContent = `Session check failed: ${error.message}`;
      return;
    }
    if (!data?.session) {
      byId('cabincueAdminGateStatus').textContent = 'No active session found. Log in on the main app first.';
      return;
    }

    byId('cabincueAdminGate').style.display = 'none';
    byId('cabincueAdminPanel').style.display = 'block';
    byId('cabincueAdminStatus').textContent = 'CabinCue admin unlocked.';
    if (typeof window.initCabinCueAdmin === 'function') {
      await window.initCabinCueAdmin();
    }
  }

  window.unlockCabinCueAdmin = unlockCabinCueAdmin;
})();
