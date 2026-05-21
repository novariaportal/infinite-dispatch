(() => {
  const CATEGORY_ORDER = [
    { id: 'boarding', label: 'Boarding' },
    { id: 'departure-prep', label: 'Departure Prep' },
    { id: 'safety-video', label: 'Safety Video' },
    { id: 'descent-landing', label: 'Descent / Landing' },
    { id: 'other-announcements', label: 'Other Announcements' }
  ];

  const state = {
    profiles: [],
    selectedProfile: null,
    selectedVersionId: null,
    items: [],
    selectedCategory: null,
    selectedAnnouncement: null
  };

  const supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

  function byId(id) {
    return document.getElementById(id);
  }

  function setProfileStatus(text, isError = false) {
    const el = byId('cabincueProfileStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#c62828' : '';
  }

  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      profile: (params.get('profile') || '').trim(),
      category: (params.get('category') || '').trim(),
      announcement: (params.get('announcement') || '').trim()
    };
  }

  function updateQueryParams(next) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  }

  function categoryLabel(category) {
    return CATEGORY_ORDER.find((entry) => entry.id === category)?.label || category;
  }

  function getFilteredItems() {
    return state.items.filter((item) => item.category === state.selectedCategory);
  }

  function renderProfileOptions() {
    const select = byId('cabincueProfileSelect');
    select.innerHTML = '';
    state.profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.slug;
      option.textContent = profile.display_name;
      select.appendChild(option);
    });
    if (state.selectedProfile) {
      select.value = state.selectedProfile.slug;
    }
  }

  function renderCategoryButtons() {
    const nav = byId('cabincueCategoryNav');
    const available = new Set(state.items.map((item) => item.category));
    nav.innerHTML = CATEGORY_ORDER
      .filter((entry) => available.has(entry.id))
      .map((entry) => {
        const active = state.selectedCategory === entry.id ? 'active' : '';
        return `<button class="${active}" data-category="${entry.id}">${entry.label}</button>`;
      })
      .join('');

    [...nav.querySelectorAll('button[data-category]')].forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedCategory = button.getAttribute('data-category');
        state.selectedAnnouncement = null;
        updateQueryParams({ profile: state.selectedProfile?.slug || '', category: state.selectedCategory, announcement: '' });
        renderCategoryButtons();
        renderAnnouncementList();
        renderNowPlaying();
      });
    });
  }

  function stopPlayers() {
    const audio = byId('cabincueAudioPlayer');
    const video = byId('cabincueVideoPlayer');
    audio.pause();
    video.pause();
    audio.currentTime = 0;
    video.currentTime = 0;
  }

  function setPlayerSource(announcement) {
    const audio = byId('cabincueAudioPlayer');
    const video = byId('cabincueVideoPlayer');
    if (!announcement?.asset_path) {
      audio.style.display = 'none';
      video.style.display = 'none';
      audio.removeAttribute('src');
      video.removeAttribute('src');
      audio.load();
      video.load();
      return;
    }

    if (announcement.media_kind === 'video') {
      audio.pause();
      audio.style.display = 'none';
      audio.removeAttribute('src');
      audio.load();
      video.style.display = 'block';
      video.src = announcement.asset_path;
      video.load();
      return;
    }

    video.pause();
    video.style.display = 'none';
    video.removeAttribute('src');
    video.load();
    audio.style.display = 'block';
    audio.src = announcement.asset_path;
    audio.load();
  }

  function getActiveMediaElement() {
    return state.selectedAnnouncement?.media_kind === 'video'
      ? byId('cabincueVideoPlayer')
      : byId('cabincueAudioPlayer');
  }

  function renderNowPlaying() {
    const label = byId('cabincueNowPlaying');
    const toggleBtn = byId('cabincueTogglePlay');

    if (!state.selectedAnnouncement) {
      label.textContent = 'Select an announcement to begin playback.';
      toggleBtn.textContent = 'Play';
      setPlayerSource(null);
      return;
    }

    label.textContent = `${state.selectedAnnouncement.title} • ${categoryLabel(state.selectedAnnouncement.category)}`;
    setPlayerSource(state.selectedAnnouncement);
    toggleBtn.textContent = 'Play';
  }

  function renderAnnouncementList() {
    const container = byId('cabincueAnnouncementList');
    const filtered = getFilteredItems();

    if (!filtered.length) {
      container.innerHTML = '<div class="list-item muted">No announcements in this category.</div>';
      return;
    }

    container.innerHTML = filtered
      .map((item) => {
        const active = state.selectedAnnouncement?.id === item.id ? 'active' : '';
        return `
          <div class="list-item ${active}">
            <div class="list-row"><strong>${item.title}</strong><span>${item.media_kind.toUpperCase()}</span></div>
            <p class="muted">${item.description || 'No description provided.'}</p>
            <div class="input-group">
              <button data-action="play" data-id="${item.id}">Play / Pause</button>
              <button data-action="select" data-id="${item.id}">Load</button>
              <button data-action="copy" data-id="${item.id}">Copy Link</button>
            </div>
          </div>
        `;
      })
      .join('');

    [...container.querySelectorAll('button[data-action]')].forEach((button) => {
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      button.addEventListener('click', () => {
        const item = state.items.find((row) => row.id === id);
        if (!item) return;

        if (action === 'select') {
          state.selectedAnnouncement = item;
          updateQueryParams({ profile: state.selectedProfile?.slug || '', category: state.selectedCategory, announcement: item.announcement_key });
          renderAnnouncementList();
          renderNowPlaying();
          return;
        }

        if (action === 'copy') {
          const url = new URL(window.location.href);
          url.searchParams.set('profile', state.selectedProfile?.slug || '');
          url.searchParams.set('category', state.selectedCategory || item.category);
          url.searchParams.set('announcement', item.announcement_key);
          navigator.clipboard.writeText(url.toString());
          setProfileStatus('Announcement link copied.');
          return;
        }

        if (action === 'play') {
          if (!state.selectedAnnouncement || state.selectedAnnouncement.id !== item.id) {
            state.selectedAnnouncement = item;
            renderAnnouncementList();
            renderNowPlaying();
          }
          togglePlayPause();
        }
      });
    });
  }

  function togglePlayPause() {
    if (!state.selectedAnnouncement) return;
    const media = getActiveMediaElement();
    if (!media?.src) return;

    if (media.paused) {
      media.play();
      byId('cabincueTogglePlay').textContent = 'Pause';
    } else {
      media.pause();
      byId('cabincueTogglePlay').textContent = 'Play';
    }
  }

  async function loadItemsForProfile(profile) {
    state.selectedVersionId = profile.active_public_version_id;
    if (!state.selectedVersionId) {
      state.items = [];
      state.selectedCategory = null;
      state.selectedAnnouncement = null;
      renderCategoryButtons();
      renderAnnouncementList();
      renderNowPlaying();
      setProfileStatus('No released content for selected profile.', true);
      return;
    }

    const { data, error } = await supabaseClient
      .from('cabincue_announcement_items')
      .select('id, version_id, announcement_key, category, title, description, media_kind, asset_path, sort_order, is_active')
      .eq('version_id', state.selectedVersionId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      setProfileStatus(`Failed to load announcements: ${error.message}`, true);
      return;
    }

    state.items = data || [];

    const query = getQueryParams();
    const firstCategory = state.items[0]?.category || null;
    const availableCategories = new Set(state.items.map((item) => item.category));
    state.selectedCategory = availableCategories.has(query.category) ? query.category : firstCategory;

    const byQueryAnnouncement = state.items.find((item) => item.announcement_key === query.announcement);
    state.selectedAnnouncement = byQueryAnnouncement && byQueryAnnouncement.category === state.selectedCategory
      ? byQueryAnnouncement
      : getFilteredItems()[0] || null;

    updateQueryParams({
      profile: profile.slug,
      category: state.selectedCategory || '',
      announcement: state.selectedAnnouncement?.announcement_key || ''
    });

    renderCategoryButtons();
    renderAnnouncementList();
    renderNowPlaying();
    setProfileStatus(`Loaded ${state.items.length} announcement(s) from ${profile.display_name}.`);
  }

  async function selectProfileBySlug(slug) {
    const nextProfile = state.profiles.find((profile) => profile.slug === slug) || state.profiles[0] || null;
    state.selectedProfile = nextProfile;
    if (!nextProfile) {
      setProfileStatus('No CabinCue profiles are available.', true);
      return;
    }

    renderProfileOptions();
    await loadItemsForProfile(nextProfile);
  }

  async function loadProfiles() {
    setProfileStatus('Loading profiles...');
    const { data, error } = await supabaseClient
      .from('cabincue_profiles')
      .select('id, slug, display_name, active_public_version_id')
      .not('active_public_version_id', 'is', null)
      .order('display_name', { ascending: true });

    if (error) {
      setProfileStatus(`Failed to load CabinCue profiles: ${error.message}`, true);
      return;
    }

    state.profiles = data || [];
    if (!state.profiles.length) {
      setProfileStatus('No released CabinCue profiles available yet.', true);
      return;
    }

    const query = getQueryParams();
    await selectProfileBySlug(query.profile);
  }

  function wireEvents() {
    byId('cabincueProfileSelect').addEventListener('change', async (event) => {
      const slug = event.target.value;
      await selectProfileBySlug(slug);
    });

    byId('cabincueTogglePlay').addEventListener('click', () => {
      togglePlayPause();
    });

    byId('cabincueStop').addEventListener('click', () => {
      stopPlayers();
      byId('cabincueTogglePlay').textContent = 'Play';
    });

    byId('cabincueCopyProfileLink').addEventListener('click', () => {
      if (!state.selectedProfile) return;
      const url = new URL(window.location.href);
      url.searchParams.set('profile', state.selectedProfile.slug);
      if (state.selectedCategory) url.searchParams.set('category', state.selectedCategory);
      if (state.selectedAnnouncement?.announcement_key) {
        url.searchParams.set('announcement', state.selectedAnnouncement.announcement_key);
      }
      navigator.clipboard.writeText(url.toString());
      setProfileStatus('Profile link copied.');
    });

    byId('cabincueCopyAnnouncementLink').addEventListener('click', () => {
      if (!state.selectedProfile || !state.selectedAnnouncement) return;
      const url = new URL(window.location.href);
      url.searchParams.set('profile', state.selectedProfile.slug);
      url.searchParams.set('category', state.selectedCategory || state.selectedAnnouncement.category);
      url.searchParams.set('announcement', state.selectedAnnouncement.announcement_key);
      navigator.clipboard.writeText(url.toString());
      setProfileStatus('Announcement link copied.');
    });

    ['cabincueAudioPlayer', 'cabincueVideoPlayer'].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener('play', () => {
        byId('cabincueTogglePlay').textContent = 'Pause';
      });
      el.addEventListener('pause', () => {
        byId('cabincueTogglePlay').textContent = 'Play';
      });
      el.addEventListener('ended', () => {
        byId('cabincueTogglePlay').textContent = 'Play';
      });
    });
  }

  wireEvents();
  loadProfiles();
})();
