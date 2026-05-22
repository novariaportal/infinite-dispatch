(() => {
  const CATEGORY_OPTIONS = [
    { value: 'boarding', label: 'boarding', mediaKinds: ['audio'] },
    { value: 'departure-prep', label: 'departure-prep', mediaKinds: ['audio'] },
    { value: 'safety-video', label: 'safety-video', mediaKinds: ['video'] },
    { value: 'descent-landing', label: 'descent/landing', mediaKinds: ['audio'] },
    { value: 'other-announcements', label: 'other announcements', mediaKinds: ['audio', 'video'] }
  ];

  const CATEGORY_LOOKUP = new Map(CATEGORY_OPTIONS.map((entry) => [entry.value, entry]));
  const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
  const VIDEO_MAX_BYTES = 150 * 1024 * 1024;
  const DEFAULT_TEMPLATE_ITEMS = [
    {
      announcement_key: 'boarding_welcome',
      category: 'boarding',
      title: 'Boarding Welcome',
      description: 'Initial boarding welcome message.',
      media_kind: 'audio',
      sort_order: 10,
      is_active: true
    },
    {
      announcement_key: 'departure_prep',
      category: 'departure-prep',
      title: 'Departure Preparation',
      description: 'Cabin secured and departure prep message.',
      media_kind: 'audio',
      sort_order: 20,
      is_active: true
    },
    {
      announcement_key: 'safety_video',
      category: 'safety-video',
      title: 'Safety Video',
      description: 'Primary safety video announcement slot.',
      media_kind: 'video',
      sort_order: 30,
      is_active: true
    },
    {
      announcement_key: 'descent_landing',
      category: 'descent-landing',
      title: 'Descent and Landing',
      description: 'Arrival and cabin prep for landing.',
      media_kind: 'audio',
      sort_order: 40,
      is_active: true
    },
    {
      announcement_key: 'other_announcements',
      category: 'other-announcements',
      title: 'Other Announcements',
      description: 'Additional discretionary announcement slot.',
      media_kind: 'video',
      sort_order: 50,
      is_active: true
    }
  ];

  const state = {
    profiles: [],
    versions: [],
    releaseHistory: [],
    profileWorkflowMode: 'edit',
    selectedProfileId: '',
    selectedVersionId: '',
    selectedVersion: null,
    items: []
  };

  function getClient() {
    return window.supabaseClient;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, isError = false) {
    const statusEl = byId('cabincueStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? '#c62828' : '';
  }

  function slugify(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildCategoryOptions(selected) {
    return CATEGORY_OPTIONS
      .map((option) => `<option value="${option.value}" ${option.value === selected ? 'selected' : ''}>${option.label}</option>`)
      .join('');
  }

  function renderProfileOptions() {
    const select = byId('cabincueProfileSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Select CabinCue profile</option>';
    state.profiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.display_name} (${profile.slug})`;
      select.appendChild(option);
    });
    if (state.selectedProfileId) select.value = state.selectedProfileId;
  }

  function switchCabinCueWorkflowMode(modeValue) {
    const mode = modeValue || (byId('cabincueWorkflowMode')?.value === 'create' ? 'create' : 'edit');
    state.profileWorkflowMode = mode;
    const existingGroup = byId('cabincueExistingProfileGroup');
    const createGroup = byId('cabincueCreateProfileGroup');
    if (existingGroup) existingGroup.style.display = mode === 'edit' ? '' : 'none';
    if (createGroup) createGroup.style.display = mode === 'create' ? '' : 'none';
    if (mode === 'edit') {
      if (state.selectedProfileId) {
        loadCabinCueVersions(state.selectedProfileId);
      } else if (state.profiles[0]?.id) {
        state.selectedProfileId = state.profiles[0].id;
        renderProfileOptions();
        loadCabinCueVersions(state.selectedProfileId);
      } else {
        state.selectedVersion = null;
        state.selectedVersionId = '';
        state.items = [];
        renderEditor();
      }
      setStatus('Editing existing profile.');
      return;
    }
    state.selectedVersion = null;
    state.selectedVersionId = '';
    state.items = [];
    renderEditor();
    setStatus('Create a new profile from Generic.');
  }

  function renderVersionOptions() {
    const select = byId('cabincueVersionSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Select profile version</option>';
    state.versions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version.id;
      const isActive = state.profiles.find((p) => p.id === state.selectedProfileId)?.active_public_version_id === version.id;
      const activeTag = isActive ? ' • ACTIVE' : '';
      const releasedTag = version.status === 'released' ? ` • released ${new Date(version.released_at || version.created_at).toLocaleString()}` : ' • draft';
      option.textContent = `v${version.version_number}${releasedTag}${activeTag}`;
      select.appendChild(option);
    });
    if (state.selectedVersionId) select.value = state.selectedVersionId;
  }

  function renderReleaseHistory() {
    const container = byId('cabincueReleaseHistory');
    if (!container) return;
    if (!state.releaseHistory.length) {
      container.innerHTML = '<div class="list-item muted">No release history yet.</div>';
      return;
    }
    container.innerHTML = state.releaseHistory
      .map((row) => {
        const releasedAt = row.released_at ? new Date(row.released_at).toLocaleString() : 'Unknown time';
        return `
          <div class="list-item">
            <div class="list-row"><strong>v${escapeHtml(row.cabincue_profile_versions?.version_number ?? '?')}</strong><span>${escapeHtml(releasedAt)}</span></div>
            <div class="muted">Notes: ${escapeHtml(row.notes || '—')}</div>
          </div>
        `;
      })
      .join('');
  }

  function getAllowedMediaKinds(category) {
    const entry = CATEGORY_LOOKUP.get(category);
    return Array.isArray(entry?.mediaKinds) && entry.mediaKinds.length ? entry.mediaKinds : ['audio'];
  }

  function announcementTypeForCategory(category, selectedMediaKind) {
    const allowedKinds = getAllowedMediaKinds(category);
    return allowedKinds.includes(selectedMediaKind) ? selectedMediaKind : allowedKinds[0];
  }

  function getProfileById(profileId) {
    return state.profiles.find((profile) => profile.id === profileId) || null;
  }

  function hasSelectedVersion() {
    return Boolean(state.selectedVersion);
  }

  function uploadAcceptForMediaKind(kind) {
    return kind === 'video' ? '.mp4,video/mp4' : '.mp3,audio/mpeg';
  }

  function buildMediaKindOptions(category, selectedMediaKind) {
    const allowedKinds = getAllowedMediaKinds(category);
    const nextKind = announcementTypeForCategory(category, selectedMediaKind);
    return allowedKinds
      .map((kind) => `<option value="${kind}" ${kind === nextKind ? 'selected' : ''}>${kind}</option>`)
      .join('');
  }

  function buildTemplateClonePayload(versionId, sourceItems = []) {
    return (sourceItems || []).map((item, index) => ({
      version_id: versionId,
      announcement_key: String(item.announcement_key || `announcement_${index + 1}`),
      category: CATEGORY_LOOKUP.has(item.category) ? item.category : 'other-announcements',
      title: String(item.title || `Announcement ${index + 1}`),
      description: item.description ?? null,
      media_kind: item.media_kind === 'video' ? 'video' : 'audio',
      asset_path: item.asset_path || null,
      asset_mime: item.asset_mime || null,
      asset_size_bytes: Number.isFinite(Number(item.asset_size_bytes)) ? Number(item.asset_size_bytes) : null,
      sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
      is_active: item.is_active !== false
    }));
  }

  function renderEditor() {
    const container = byId('cabincueEditor');
    if (!container) return;

    if (!state.selectedVersion) {
      container.innerHTML = '<div class="list-item muted">Select a CabinCue version to edit.</div>';
      return;
    }

    const readOnly = !hasSelectedVersion();
    const profile = getProfileById(state.selectedProfileId);
    const profileLabel = profile ? `${profile.display_name} (${profile.slug})` : 'Unknown profile';

    const editorHeader = `
      <div class="list-item">
        <div class="list-row"><strong>${escapeHtml(profileLabel)}</strong><span>v${escapeHtml(state.selectedVersion.version_number)}</span></div>
        <div class="muted">Upload media, add announcements, and rename titles directly for this profile.</div>
        <div class="input-group">
          <button onclick="addCabinCueAnnouncementItem()" ${readOnly ? 'disabled' : ''}>Add Announcement</button>
        </div>
      </div>
    `;

    const itemCards = state.items
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((item, index) => {
        const category = item.category || CATEGORY_OPTIONS[0].value;
        const mediaKind = announcementTypeForCategory(category, item.media_kind);
        const previewHtml = item.asset_path
          ? mediaKind === 'video'
            ? `<video controls preload="none" style="width:100%;max-width:420px;" src="${escapeHtml(item.asset_path)}"></video>`
            : `<audio controls preload="none" style="width:100%;max-width:420px;" src="${escapeHtml(item.asset_path)}"></audio>`
          : '<span class="muted">No asset uploaded.</span>';
        return `
          <div class="list-item" data-cabincue-item-id="${escapeHtml(item.id)}">
            <div class="list-row"><strong>${escapeHtml(item.title || `Item ${index + 1}`)}</strong><span>${escapeHtml(category)}</span></div>
            <label>Announcement Key</label>
            <input data-field="announcement_key" type="text" value="${escapeHtml(item.announcement_key || '')}" ${readOnly ? 'disabled' : ''}>
            <label>Title</label>
            <input data-field="title" type="text" value="${escapeHtml(item.title || '')}" ${readOnly ? 'disabled' : ''}>
            <label>Description</label>
            <input data-field="description" type="text" value="${escapeHtml(item.description || '')}" ${readOnly ? 'disabled' : ''}>
            <label>Category</label>
            <select data-field="category" onchange="refreshCabinCueItemMediaHint('${escapeHtml(item.id)}')" ${readOnly ? 'disabled' : ''}>
              ${buildCategoryOptions(category)}
            </select>
            <label>Sort order</label>
            <input data-field="sort_order" type="number" step="1" value="${Number(item.sort_order ?? index * 10)}" ${readOnly ? 'disabled' : ''}>
            <label>Media type</label>
            <select data-field="media_kind" onchange="refreshCabinCueItemMediaHint('${escapeHtml(item.id)}')" ${readOnly ? 'disabled' : ''}>
              ${buildMediaKindOptions(category, mediaKind)}
            </select>
            <label>Current asset URL</label>
            <input data-field="asset_path" type="text" value="${escapeHtml(item.asset_path || '')}" disabled>
            <p class="muted" data-role="media-hint">Upload ${mediaKind === 'video' ? 'MP4 video (max 150MB)' : 'MP3 audio (max 15MB)'}.</p>
            <div class="input-group">
              <input id="cabincueUpload_${escapeHtml(item.id)}" type="file" accept="${escapeHtml(uploadAcceptForMediaKind(mediaKind))}" ${readOnly ? 'disabled' : ''}>
              <button onclick="uploadCabinCueAsset('${escapeHtml(item.id)}')" ${readOnly ? 'disabled' : ''}>Upload / Replace Asset</button>
              <button onclick="removeCabinCueItem('${escapeHtml(item.id)}')" class="danger" ${readOnly ? 'disabled' : ''}>Remove Item</button>
            </div>
            <div>${previewHtml}</div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `${editorHeader}${itemCards}<div class="list-item"><button onclick="saveCabinCueDraftItems()" ${readOnly ? 'disabled' : ''}>Save Announcements</button></div>`;
  }

  async function loadCabinCueProfiles() {
    const client = getClient();
    if (!client) {
      setStatus('CabinCue unavailable: Supabase client not loaded.', true);
      return;
    }

    setStatus('Loading CabinCue profiles...');
    const { data, error } = await client
      .from('cabincue_profiles')
      .select('id, slug, display_name, active_public_version_id, created_at')
      .order('display_name', { ascending: true });

    if (error) {
      setStatus(`Failed to load CabinCue profiles: ${error.message}`, true);
      return;
    }

    state.profiles = data || [];
    if (!state.selectedProfileId && state.profiles.length) {
      state.selectedProfileId = state.profiles[0].id;
    }
    renderProfileOptions();

    if (state.profileWorkflowMode === 'edit' && state.selectedProfileId) {
      await loadCabinCueVersions(state.selectedProfileId);
    } else {
      state.versions = [];
      state.items = [];
      state.selectedVersionId = '';
      state.selectedVersion = null;
      renderVersionOptions();
      renderEditor();
      renderReleaseHistory();
      setStatus(state.profiles.length ? 'Create a new profile from Generic.' : 'No CabinCue profiles found.');
    }
  }

  async function loadCabinCueVersions(profileId) {
    const client = getClient();
    setStatus('Loading profile announcements...');

    const [{ data: versions, error: versionError }, { data: releaseRows, error: releaseError }] = await Promise.all([
      client
        .from('cabincue_profile_versions')
        .select('id, profile_id, version_number, status, version_label, notes, released_at, created_at')
        .eq('profile_id', profileId)
        .order('version_number', { ascending: false }),
      client
        .from('cabincue_release_records')
        .select('id, profile_id, version_id, rollback_from_version_id, notes, released_at, cabincue_profile_versions!cabincue_release_records_version_id_fkey(version_number)')
        .eq('profile_id', profileId)
        .order('released_at', { ascending: false })
    ]);

    if (versionError) {
      setStatus(`Failed to load versions: ${versionError.message}`, true);
      return;
    }
    if (releaseError) {
      setStatus(`Failed to load release history: ${releaseError.message}`, true);
      return;
    }

    state.versions = versions || [];
    state.releaseHistory = releaseRows || [];
    const activeVersionId = getProfileById(profileId)?.active_public_version_id || '';
    if (!state.versions.length) {
      const { data: createdVersion, error: createError } = await client
        .from('cabincue_profile_versions')
        .insert({
          profile_id: profileId,
          version_number: 1,
          // Keep first version immediately usable in CabinCue playback.
          status: 'released',
          version_label: 'v1',
          notes: 'Initial CabinCue profile version.'
        })
        .select('id, profile_id, version_number, status, version_label, notes, released_at, created_at')
        .single();
      if (createError) {
        setStatus(`Failed to create profile version: ${createError.message}`, true);
        return;
      }

      const { error: activateError } = await client
        .from('cabincue_profiles')
        .update({ active_public_version_id: createdVersion.id, updated_at: new Date().toISOString() })
        .eq('id', profileId);
      if (activateError) {
        setStatus(`Version created but failed to activate it: ${activateError.message}`, true);
        return;
      }

      state.versions = [createdVersion];
      const profile = getProfileById(profileId);
      if (profile) profile.active_public_version_id = createdVersion.id;
    }

    if (!state.selectedVersionId || !state.versions.some((version) => version.id === state.selectedVersionId)) {
      state.selectedVersionId = activeVersionId && state.versions.some((version) => version.id === activeVersionId)
        ? activeVersionId
        : state.versions[0]?.id || '';
    }

    renderVersionOptions();
    renderReleaseHistory();

    if (state.selectedVersionId) {
      await loadCabinCueItems(state.selectedVersionId);
      return;
    }
    state.selectedVersion = null;
    state.items = [];
    renderEditor();
    setStatus('No versions found for selected profile.');
  }

  async function loadCabinCueItems(versionId) {
    const client = getClient();
    const { data, error } = await client
      .from('cabincue_announcement_items')
      .select('id, version_id, announcement_key, category, title, description, media_kind, asset_path, asset_mime, asset_size_bytes, sort_order, is_active')
      .eq('version_id', versionId)
      .order('sort_order', { ascending: true });

    if (error) {
      setStatus(`Failed to load announcement items: ${error.message}`, true);
      return;
    }

    state.selectedVersion = state.versions.find((version) => version.id === versionId) || null;
    state.items = data || [];
    renderEditor();
    setStatus(`Loaded ${state.items.length} announcement item(s).`);
  }

  function selectCabinCueProfile() {
    if (state.profileWorkflowMode !== 'edit') return;
    const profileId = byId('cabincueProfileSelect')?.value || '';
    state.selectedProfileId = profileId;
    state.selectedVersionId = '';
    state.selectedVersion = null;
    state.items = [];
    renderVersionOptions();
    renderEditor();
    if (!profileId) {
      renderReleaseHistory();
      setStatus('Select a CabinCue profile.');
      return;
    }
    loadCabinCueVersions(profileId);
  }

  function selectCabinCueVersion() {
    const versionId = byId('cabincueVersionSelect')?.value || '';
    state.selectedVersionId = versionId;
    state.selectedVersion = null;
    state.items = [];
    renderEditor();
    if (!versionId) {
      setStatus('Select a CabinCue version.');
      return;
    }
    loadCabinCueItems(versionId);
  }

  function collectDraftItemsFromDom() {
    const cards = [...document.querySelectorAll('[data-cabincue-item-id]')];
    const seenKeys = new Set();
    const rows = cards.map((card, index) => {
      const id = card.getAttribute('data-cabincue-item-id');
      const getField = (field) => card.querySelector(`[data-field="${field}"]`);
      const category = (getField('category')?.value || '').trim();
      const selectedMediaKind = (getField('media_kind')?.value || '').trim();
      const mediaKind = announcementTypeForCategory(category, selectedMediaKind);
      const announcementKey = (getField('announcement_key')?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const title = (getField('title')?.value || '').trim();
      const description = (getField('description')?.value || '').trim() || null;
      const sortOrder = Number(getField('sort_order')?.value ?? index * 10);
      const assetPath = (getField('asset_path')?.value || '').trim() || null;

      if (!CATEGORY_LOOKUP.has(category)) throw new Error(`Invalid category on item ${index + 1}.`);
      if (!announcementKey) throw new Error(`Announcement key is required on item ${index + 1}.`);
      if (!title) throw new Error(`Title is required on item ${index + 1}.`);
      if (seenKeys.has(announcementKey)) throw new Error(`Duplicate announcement key: ${announcementKey}.`);
      seenKeys.add(announcementKey);
      if (assetPath) {
        if (mediaKind === 'audio' && !/\.mp3(\?.*)?$/i.test(assetPath)) {
          throw new Error(`Item ${announcementKey} requires MP3 audio.`);
        }
        if (mediaKind === 'video' && !/\.mp4(\?.*)?$/i.test(assetPath)) {
          throw new Error(`Item ${announcementKey} requires MP4 video.`);
        }
      }

      return {
        id,
        version_id: state.selectedVersionId,
        announcement_key: announcementKey,
        category,
        title,
        description,
        media_kind: mediaKind,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : index * 10,
        asset_path: assetPath,
        is_active: true
      };
    });

    return rows;
  }

  async function saveCabinCueDraftMetadata() {
    if (!hasSelectedVersion()) {
      setStatus('Select a draft version to edit metadata.', true);
      return;
    }
    const client = getClient();
    const versionLabel = (byId('cabincueVersionLabel')?.value || '').trim() || null;
    const notes = (byId('cabincueVersionNotes')?.value || '').trim() || null;

    const { error } = await client
      .from('cabincue_profile_versions')
      .update({ version_label: versionLabel, notes, updated_at: new Date().toISOString() })
      .eq('id', state.selectedVersionId)
      .eq('status', 'draft');

    if (error) {
      setStatus(`Failed to save draft metadata: ${error.message}`, true);
      return;
    }

    setStatus('Draft metadata saved.');
    await loadCabinCueVersions(state.selectedProfileId);
  }

  async function saveCabinCueDraftItems() {
    if (!hasSelectedVersion()) {
      setStatus('Select a profile version to save items.', true);
      return;
    }

    let rows;
    try {
      rows = collectDraftItemsFromDom();
    } catch (error) {
      setStatus(error.message || 'Invalid announcement values.', true);
      return;
    }

    const client = getClient();
    const currentIds = new Set(state.items.map((item) => item.id));
    const incomingIds = new Set(rows.map((row) => row.id));
    const deletedIds = [...currentIds].filter((id) => !incomingIds.has(id));

    if (deletedIds.length) {
      const { error: deleteError } = await client
        .from('cabincue_announcement_items')
        .delete()
        .in('id', deletedIds)
        .eq('version_id', state.selectedVersionId);
      if (deleteError) {
        setStatus(`Failed removing deleted items: ${deleteError.message}`, true);
        return;
      }
    }

    const { error } = await client
      .from('cabincue_announcement_items')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      setStatus(`Failed saving announcements: ${error.message}`, true);
      return;
    }

    setStatus('Announcements saved.');
    await loadCabinCueItems(state.selectedVersionId);
  }

  function addCabinCueAnnouncementItem() {
    if (!hasSelectedVersion()) {
      setStatus('Select a profile version before adding announcements.', true);
      return;
    }
    const firstCategory = CATEGORY_OPTIONS[0].value;
    const nowKey = `announcement_${Date.now()}`;
    state.items.push({
      id: crypto.randomUUID(),
      version_id: state.selectedVersionId,
      announcement_key: nowKey,
      category: firstCategory,
      title: 'New Announcement',
      description: '',
      media_kind: 'audio',
      asset_path: null,
      sort_order: (state.items.length + 1) * 10,
      is_active: true
    });
    renderEditor();
    setStatus('Added new announcement row. Save announcements to persist.');
  }

  function removeCabinCueItem(itemId) {
    if (!hasSelectedVersion()) {
      setStatus('Select a profile version before removing announcements.', true);
      return;
    }
    state.items = state.items.filter((item) => item.id !== itemId);
    renderEditor();
    setStatus('Item removed locally. Save announcements to persist.');
  }

  function refreshCabinCueItemMediaHint(itemId) {
    const card = document.querySelector(`[data-cabincue-item-id="${itemId}"]`);
    if (!card) return;
    const category = card.querySelector('[data-field="category"]')?.value || CATEGORY_OPTIONS[0].value;
    const currentMediaKind = card.querySelector('[data-field="media_kind"]')?.value || 'audio';
    const mediaKind = announcementTypeForCategory(category, currentMediaKind);
    const mediaField = card.querySelector('[data-field="media_kind"]');
    if (mediaField) {
      mediaField.innerHTML = buildMediaKindOptions(category, mediaKind);
      mediaField.value = mediaKind;
    }

    const fileInput = byId(`cabincueUpload_${itemId}`);
    if (fileInput) fileInput.setAttribute('accept', uploadAcceptForMediaKind(mediaKind));

    const hint = card.querySelector('[data-role="media-hint"]');
    if (hint) {
      hint.textContent = mediaKind === 'video'
        ? 'Upload MP4 video (max 150MB).'
        : 'Upload MP3 audio (max 15MB).';
    }
  }

  async function uploadCabinCueAsset(itemId) {
    if (!hasSelectedVersion()) {
      setStatus('Select a profile version before uploading assets.', true);
      return;
    }

    const client = getClient();
    const profile = getProfileById(state.selectedProfileId);
    const version = state.selectedVersion;
    const item = state.items.find((row) => row.id === itemId);
    const card = document.querySelector(`[data-cabincue-item-id="${itemId}"]`);
    if (!profile || !version || !item || !card) {
      setStatus('Select a valid announcement item before upload.', true);
      return;
    }

    const category = card.querySelector('[data-field="category"]')?.value || item.category;
    const selectedKind = card.querySelector('[data-field="media_kind"]')?.value || item.media_kind;
    const expectedKind = announcementTypeForCategory(category, selectedKind);
    const fileInput = byId(`cabincueUpload_${itemId}`);
    const file = fileInput?.files?.[0];
    if (!file) {
      setStatus('Choose a file before uploading.', true);
      return;
    }

    const isVideo = expectedKind === 'video';
    const expectedExt = isVideo ? 'mp4' : 'mp3';
    const expectedMime = isVideo ? 'video/mp4' : 'audio/mpeg';
    const maxBytes = isVideo ? VIDEO_MAX_BYTES : AUDIO_MAX_BYTES;
    const fileExt = (file.name.split('.').pop() || '').toLowerCase();

    if (fileExt !== expectedExt) {
      setStatus(`Invalid file type for ${category}. Expected ${expectedExt.toUpperCase()}.`, true);
      return;
    }
    if (file.size < 1 || file.size > maxBytes) {
      setStatus(`File size exceeds ${isVideo ? '150MB video' : '15MB audio'} limit.`, true);
      return;
    }

    const announcementKey = (card.querySelector('[data-field="announcement_key"]')?.value || item.announcement_key || `announcement_${Date.now()}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    const objectPath = `${profile.slug}/v${version.version_number}/${announcementKey}-${Date.now()}.${expectedExt}`;
    setStatus(`Uploading ${file.name}...`);

    const { error: uploadError } = await client.storage
      .from('cabincue-assets')
      .upload(objectPath, file, {
        contentType: expectedMime,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      setStatus(`Upload failed: ${uploadError.message}`, true);
      return;
    }

    const { data: publicData } = client.storage.from('cabincue-assets').getPublicUrl(objectPath);
    const publicUrl = publicData?.publicUrl || null;

    const { error: updateError } = await client
      .from('cabincue_announcement_items')
      .update({
        announcement_key: announcementKey,
        category,
        media_kind: expectedKind,
        asset_path: publicUrl,
        asset_mime: expectedMime,
        asset_size_bytes: file.size,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('version_id', state.selectedVersionId);

    if (updateError) {
      setStatus(`Asset metadata update failed: ${updateError.message}`, true);
      return;
    }

    setStatus(`Uploaded ${file.name} successfully.`);
    await loadCabinCueItems(state.selectedVersionId);
  }

  async function createCabinCueDraftVersion() {
    if (!state.selectedProfileId) {
      setStatus('Select a profile before creating a draft.', true);
      return;
    }

    const client = getClient();
    const maxVersion = state.versions.reduce((max, version) => Math.max(max, Number(version.version_number || 0)), 0);
    const nextVersion = maxVersion + 1;

    const { data: createdVersion, error: createError } = await client
      .from('cabincue_profile_versions')
      .insert({
        profile_id: state.selectedProfileId,
        version_number: nextVersion,
        status: 'draft',
        version_label: `v${nextVersion}`,
        notes: 'Draft created from selected baseline version.'
      })
      .select('id, profile_id, version_number, status, version_label, notes, released_at, created_at')
      .single();

    if (createError) {
      setStatus(`Failed to create draft version: ${createError.message}`, true);
      return;
    }

    const baselineVersionId = state.selectedVersionId || getProfileById(state.selectedProfileId)?.active_public_version_id;
    if (baselineVersionId) {
      const { data: baselineItems, error: itemFetchError } = await client
        .from('cabincue_announcement_items')
        .select('announcement_key, category, title, description, media_kind, asset_path, asset_mime, asset_size_bytes, sort_order, is_active')
        .eq('version_id', baselineVersionId)
        .order('sort_order', { ascending: true });

      if (itemFetchError) {
        setStatus(`Draft created but failed to copy baseline items: ${itemFetchError.message}`, true);
      } else if ((baselineItems || []).length) {
        const payload = baselineItems.map((item) => ({
          ...item,
          version_id: createdVersion.id
        }));
        const { error: copyError } = await client.from('cabincue_announcement_items').insert(payload);
        if (copyError) {
          setStatus(`Draft created but item copy failed: ${copyError.message}`, true);
        }
      }
    }

    state.selectedVersionId = createdVersion.id;
    setStatus(`Created draft v${nextVersion}.`);
    await loadCabinCueVersions(state.selectedProfileId);
  }

  async function releaseCabinCueVersion() {
    if (!state.selectedProfileId || !state.selectedVersionId || !state.selectedVersion) {
      setStatus('Select a draft version to release.', true);
      return;
    }
    if (state.selectedVersion.status !== 'draft') {
      setStatus('Only draft versions can be released.', true);
      return;
    }

    const releaseNotes = (byId('cabincueReleaseNotes')?.value || '').trim() || 'CabinCue release.';
    const client = getClient();
    const profile = getProfileById(state.selectedProfileId);
    const rollbackFrom = profile?.active_public_version_id || null;

    const { error: versionError } = await client
      .from('cabincue_profile_versions')
      .update({
        // Keep first version immediately usable in CabinCue playback.
        status: 'released',
        released_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', state.selectedVersionId)
      .eq('profile_id', state.selectedProfileId)
      .eq('status', 'draft');

    if (versionError) {
      setStatus(`Failed to release version: ${versionError.message}`, true);
      return;
    }

    const { error: profileError } = await client
      .from('cabincue_profiles')
      .update({ active_public_version_id: state.selectedVersionId, updated_at: new Date().toISOString() })
      .eq('id', state.selectedProfileId);

    if (profileError) {
      setStatus(`Version released but failed to activate profile version: ${profileError.message}`, true);
      return;
    }

    const { error: recordError } = await client
      .from('cabincue_release_records')
      .insert({
        profile_id: state.selectedProfileId,
        version_id: state.selectedVersionId,
        rollback_from_version_id: rollbackFrom,
        notes: releaseNotes
      });

    if (recordError) {
      setStatus(`Version released but failed to write release record: ${recordError.message}`, true);
      return;
    }

    setStatus(`Released v${state.selectedVersion.version_number} and made it public.`);
    await loadCabinCueProfiles();
  }

  async function rollbackCabinCueVersion() {
    if (!state.selectedProfileId || !state.selectedVersionId) {
      setStatus('Select a released version to roll back to.', true);
      return;
    }

    const target = state.versions.find((version) => version.id === state.selectedVersionId);
    if (!target || target.status !== 'released') {
      setStatus('Rollback target must be a released version.', true);
      return;
    }

    const client = getClient();
    const profile = getProfileById(state.selectedProfileId);
    const currentActive = profile?.active_public_version_id || null;

    const { error: activateError } = await client
      .from('cabincue_profiles')
      .update({ active_public_version_id: target.id, updated_at: new Date().toISOString() })
      .eq('id', state.selectedProfileId);

    if (activateError) {
      setStatus(`Rollback failed: ${activateError.message}`, true);
      return;
    }

    const rollbackNotes = (byId('cabincueReleaseNotes')?.value || '').trim() || `Rollback to v${target.version_number}`;
    const { error: historyError } = await client
      .from('cabincue_release_records')
      .insert({
        profile_id: state.selectedProfileId,
        version_id: target.id,
        rollback_from_version_id: currentActive,
        notes: rollbackNotes
      });

    if (historyError) {
      setStatus(`Rollback activated but release record failed: ${historyError.message}`, true);
      return;
    }

    setStatus(`Rolled back public version to v${target.version_number}.`);
    await loadCabinCueProfiles();
  }

  async function createCabinCueProfileFromGeneric() {
    const displayName = (byId('cabincueNewProfileName')?.value || '').trim();
    if (!displayName) {
      setStatus('Enter a profile display name first.', true);
      return;
    }

    const client = getClient();
    const generic = state.profiles.find((profile) => profile.slug === 'generic');
    if (!generic) {
      setStatus('Generic profile is required before cloning.', true);
      return;
    }

    let baseSlug = slugify(displayName);
    if (!baseSlug) {
      setStatus('Profile name must contain letters or numbers.', true);
      return;
    }

    const slugSet = new Set(state.profiles.map((profile) => profile.slug));
    let finalSlug = baseSlug;
    let suffix = 2;
    while (slugSet.has(finalSlug)) {
      finalSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const { data: createdProfile, error: profileError } = await client
      .from('cabincue_profiles')
      .insert({
        slug: finalSlug,
        display_name: displayName,
        source_profile_id: generic.id
      })
      .select('id, slug, display_name, active_public_version_id')
      .single();

    if (profileError) {
      setStatus(`Failed to create profile: ${profileError.message}`, true);
      return;
    }

    const { data: liveVersion, error: versionError } = await client
      .from('cabincue_profile_versions')
      .insert({
        profile_id: createdProfile.id,
        version_number: 1,
        status: 'released',
        version_label: 'v1',
        notes: 'Created from Generic template.'
      })
      .select('id, profile_id, version_number, status')
      .single();

    if (versionError) {
      setStatus(`Profile created but version setup failed: ${versionError.message}`, true);
      return;
    }

    const { error: activateError } = await client
      .from('cabincue_profiles')
      .update({ active_public_version_id: liveVersion.id, updated_at: new Date().toISOString() })
      .eq('id', createdProfile.id);
    if (activateError) {
      setStatus(`Profile created but activation failed: ${activateError.message}`, true);
      return;
    }

    const genericVersionId = generic.active_public_version_id
      || state.versions.find((version) => version.profile_id === generic.id && version.status === 'released')?.id
      || null;

    let sourceItems = [];
    if (genericVersionId) {
      const { data: genericItems, error: itemsError } = await client
        .from('cabincue_announcement_items')
        .select('announcement_key, category, title, description, media_kind, asset_path, asset_mime, asset_size_bytes, sort_order, is_active')
        .eq('version_id', genericVersionId)
        .order('sort_order', { ascending: true });

      if (itemsError) {
        setStatus(`Profile created, but template copy failed: ${itemsError.message}`, true);
      } else {
        sourceItems = genericItems || [];
      }
    }

    if (!sourceItems.length) {
      sourceItems = DEFAULT_TEMPLATE_ITEMS;
    }

    const clonePayload = buildTemplateClonePayload(liveVersion.id, sourceItems);
    if (clonePayload.length) {
      const { error: cloneError } = await client
        .from('cabincue_announcement_items')
        .insert(clonePayload);
      if (cloneError) {
        setStatus(`Profile created, but item clone failed: ${cloneError.message}`, true);
      }
    }

    byId('cabincueNewProfileName').value = '';
    state.profileWorkflowMode = 'edit';
    state.selectedProfileId = createdProfile.id;
    state.selectedVersionId = liveVersion.id;
    const modeSelect = byId('cabincueWorkflowMode');
    if (modeSelect) modeSelect.value = 'edit';
    switchCabinCueWorkflowMode('edit');
    setStatus(`Created profile ${displayName} from Generic template.`);
    await loadCabinCueProfiles();
  }

  async function initCabinCueAdmin() {
    if (!getClient()) {
      setStatus('CabinCue unavailable: missing Supabase client.', true);
      return;
    }
    switchCabinCueWorkflowMode();
    await loadCabinCueProfiles();
  }

  window.initCabinCueAdmin = initCabinCueAdmin;
  window.loadCabinCueProfiles = loadCabinCueProfiles;
  window.switchCabinCueWorkflowMode = switchCabinCueWorkflowMode;
  window.selectCabinCueProfile = selectCabinCueProfile;
  window.selectCabinCueVersion = selectCabinCueVersion;
  window.saveCabinCueDraftMetadata = saveCabinCueDraftMetadata;
  window.saveCabinCueDraftItems = saveCabinCueDraftItems;
  window.addCabinCueAnnouncementItem = addCabinCueAnnouncementItem;
  window.removeCabinCueItem = removeCabinCueItem;
  window.uploadCabinCueAsset = uploadCabinCueAsset;
  window.refreshCabinCueItemMediaHint = refreshCabinCueItemMediaHint;
  window.createCabinCueDraftVersion = createCabinCueDraftVersion;
  window.releaseCabinCueVersion = releaseCabinCueVersion;
  window.rollbackCabinCueVersion = rollbackCabinCueVersion;
  window.createCabinCueProfileFromGeneric = createCabinCueProfileFromGeneric;
})();
