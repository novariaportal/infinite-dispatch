const ICAO_PATTERN = /^[A-Z]{4}$/;

function normalizeIcao(value = '') {
  return String(value || '').trim().toUpperCase();
}

function isValidIcao(value = '') {
  return ICAO_PATTERN.test(normalizeIcao(value));
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validateAuthInput({ email, password }) {
  const errors = [];
  if (!isValidEmail(email)) errors.push('Enter a valid email address.');
  if (String(password || '').length < 8) errors.push('Password must be at least 8 characters.');
  return { ok: errors.length === 0, errors };
}

function validateRegistrationInput({ email, password, baseAirport }) {
  const auth = validateAuthInput({ email, password });
  const errors = [...auth.errors];
  if (!isValidIcao(baseAirport)) errors.push('Base airport must be a valid ICAO code (e.g., WSSS).');
  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      email: String(email || '').trim(),
      baseAirport: normalizeIcao(baseAirport)
    }
  };
}

function validateProfileIntegrity(profile = {}) {
  const errors = [];
  if (!isValidIcao(profile.base_airport)) errors.push('Profile base airport is invalid.');
  if (!Number.isInteger(Number(profile.hours)) || Number(profile.hours) < 0) errors.push('Profile hours must be a non-negative integer.');
  if (!Number.isInteger(Number(profile.balance)) || Number(profile.balance) < 0) errors.push('Profile balance must be a non-negative integer.');
  if (!Number.isInteger(Number(profile.job_slots)) || Number(profile.job_slots) < 0) errors.push('Profile job slots must be a non-negative integer.');
  return { ok: errors.length === 0, errors };
}

function getJobAcceptanceChance(profile = {}) {
  if (profile?.job_acceptance_admin_override) return 1;
  const position = String(profile?.position || '').trim().toUpperCase();
  const license = String(profile?.license || '').trim().toUpperCase();
  if (position === 'SR CPT' || license === 'ATPL') return 0.9;
  if (position === 'CPT' || license === 'MPL') return 0.75;
  if (license === 'CPL') return 0.5;
  return 0.3;
}

function validateJobAcceptance(profile = {}, job = {}) {
  const errors = [];
  if (!job?.id) errors.push('Selected job is invalid.');
  if (!Number.isFinite(Number(job?.pay)) || Number(job.pay) <= 0) errors.push('Job pay must be positive.');
  if (!Number.isFinite(Number(job?.distanceNm)) || Number(job.distanceNm) <= 0) errors.push('Job distance must be positive.');
  const chance = getJobAcceptanceChance(profile);
  return { ok: errors.length === 0, errors, acceptanceChance: chance };
}

function validateDispatchLegs(legs = []) {
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 3) {
    return { ok: false, errors: ['Dispatch route must contain 2–3 legs.'] };
  }
  const errors = [];
  for (const leg of legs) {
    if (!isValidIcao(leg?.origin) || !isValidIcao(leg?.destination)) {
      errors.push('Dispatch route contains invalid airport ICAO values.');
      break;
    }
    if (normalizeIcao(leg.origin) === normalizeIcao(leg.destination)) {
      errors.push('Dispatch route cannot have identical origin and destination.');
      break;
    }
  }
  return { ok: errors.length === 0, errors };
}

function calculatePayout(distanceNm, payMultiplier = 1, basePayPerNm = 14) {
  const distance = Math.max(0, Number(distanceNm) || 0);
  const multiplier = Math.max(0, Number(payMultiplier) || 0);
  return Math.round(distance * basePayPerNm * multiplier);
}

function calculateHourAward(distanceNm, baselineNmPerHour = 420) {
  const distance = Math.max(0, Number(distanceNm) || 0);
  const baseline = Math.max(1, Number(baselineNmPerHour) || 420);
  return Math.max(1, Math.round(distance / baseline));
}

function shouldCompleteTracking({
  distanceRemainingNm,
  altitudeFt,
  groundspeedKts,
  startedAtMs,
  nowMs,
  minDistanceNm = 25,
  maxAltitudeFt = 5000,
  maxGroundspeedKts = 260,
  graceMs = 48 * 60 * 60 * 1000
}) {
  const completionWindowReached = Number.isFinite(startedAtMs) && Number.isFinite(nowMs)
    ? (nowMs - startedAtMs) >= graceMs
    : false;
  return completionWindowReached
    && Number(distanceRemainingNm) <= minDistanceNm
    && Number(altitudeFt) <= maxAltitudeFt
    && Number(groundspeedKts) <= maxGroundspeedKts;
}

function getFirstFlightWizardState({
  profile,
  hasAcceptedJob,
  hasDispatch,
  hasTrackingHistory,
  hasCompletedTrackedFlight
}) {
  const steps = [
    {
      key: 'setup',
      done: Boolean(profile?.base_airport),
      label: 'Complete account setup',
      actionLabel: 'Open Account Setup',
      targetPage: 'overviewPage'
    },
    {
      key: 'job',
      done: Boolean(hasAcceptedJob),
      label: 'Accept your first job',
      actionLabel: 'Go to Job Market',
      targetPage: 'jobsPage'
    },
    {
      key: 'dispatch',
      done: Boolean(hasDispatch),
      label: 'Generate a dispatch route',
      actionLabel: 'Open Dispatch Center',
      targetPage: 'dispatchPage'
    },
    {
      key: 'tracking',
      done: Boolean(hasTrackingHistory),
      label: 'Start flight tracking',
      actionLabel: 'Start Tracking',
      targetPage: 'dispatchPage'
    },
    {
      key: 'completion',
      done: Boolean(hasCompletedTrackedFlight),
      label: 'Complete your first validated flight',
      actionLabel: 'View Tracking History',
      targetPage: 'historyPage'
    }
  ];

  const nextStep = steps.find((step) => !step.done) || null;
  const completeCount = steps.filter((step) => step.done).length;
  return {
    steps,
    completeCount,
    total: steps.length,
    complete: !nextStep,
    nextStep
  };
}

export {
  calculateHourAward,
  calculatePayout,
  getFirstFlightWizardState,
  getJobAcceptanceChance,
  isValidIcao,
  normalizeIcao,
  shouldCompleteTracking,
  validateAuthInput,
  validateDispatchLegs,
  validateJobAcceptance,
  validateProfileIntegrity,
  validateRegistrationInput
};
