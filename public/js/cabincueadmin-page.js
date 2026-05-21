(function () {
  const ADMIN_PASSWORD = 'ifdispatchadmin';
  const ADMIN_MODE_KEY = 'infinite_dispatch_admin_password_mode';

  const supabaseUrl = window.SUPABASE_URL;
  const supabasePublishableKey = window.SUPABASE_PUBLISHABLE_KEY;
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

  function byId(id) {
    return document.getElementById(id);
  }

  async function unlockCabinCueAdmin() {
    const pw = byId('cabincueAdminPassword')?.value || '';
    if (pw !== ADMIN_PASSWORD) {
      alert('Invalid admin password.');
      return;
    }

    byId('cabincueAdminGate').style.display = 'none';
    byId('cabincueAdminPanel').style.display = 'block';
    byId('cabincueAdminStatus').textContent = 'CabinCue admin unlocked.';
    try {
      localStorage.setItem(ADMIN_MODE_KEY, '1');
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
    if (typeof window.initCabinCueAdmin === 'function') {
      await window.initCabinCueAdmin();
    }
  }

  window.unlockCabinCueAdmin = unlockCabinCueAdmin;
})();
