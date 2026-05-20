import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateHourAward,
  calculatePayout,
  getFirstFlightWizardState,
  getJobAcceptanceChance,
  shouldCompleteTracking,
  validateAuthInput,
  validateDispatchLegs,
  validateJobAcceptance,
  validateRegistrationInput
} from '../public/js/domain.mjs';

test('auth validation enforces email and minimum password length', () => {
  assert.equal(validateAuthInput({ email: 'bad-email', password: '1234' }).ok, false);
  assert.equal(validateAuthInput({ email: 'pilot@example.com', password: 'password123' }).ok, true);
});

test('registration validation normalizes ICAO base', () => {
  const result = validateRegistrationInput({
    email: 'pilot@example.com',
    password: 'password123',
    baseAirport: ' wsss '
  });
  assert.equal(result.ok, true);
  assert.equal(result.normalized.baseAirport, 'WSSS');
});

test('job acceptance chance and validation follow license progression', () => {
  assert.equal(getJobAcceptanceChance({ license: 'PPL' }), 0.3);
  assert.equal(getJobAcceptanceChance({ license: 'ATPL' }), 0.9);
  const validation = validateJobAcceptance(
    { license: 'CPL' },
    { id: 'job-1', pay: 10000, distanceNm: 500 }
  );
  assert.equal(validation.ok, true);
  assert.equal(validation.acceptanceChance, 0.5);
});

test('dispatch validation requires 2-3 valid legs', () => {
  assert.equal(validateDispatchLegs([{ origin: 'WSSS', destination: 'OMDB' }]).ok, false);
  assert.equal(validateDispatchLegs([
    { origin: 'WSSS', destination: 'OMDB' },
    { origin: 'OMDB', destination: 'EGLL' }
  ]).ok, true);
});

test('tracking completion and payout formulas are deterministic', () => {
  const now = Date.now();
  assert.equal(shouldCompleteTracking({
    distanceRemainingNm: 10,
    altitudeFt: 1200,
    groundspeedKts: 180,
    startedAtMs: now - (49 * 60 * 60 * 1000),
    nowMs: now
  }), true);
  assert.equal(calculatePayout(1200, 1.5), 25200);
  assert.equal(calculateHourAward(1200), 3);
});

test('first-flight wizard selects next unmet step', () => {
  const wizard = getFirstFlightWizardState({
    profile: { base_airport: 'WSSS' },
    hasAcceptedJob: true,
    hasDispatch: false,
    hasTrackingHistory: false,
    hasCompletedTrackedFlight: false
  });
  assert.equal(wizard.nextStep?.key, 'dispatch');
  assert.equal(wizard.complete, false);
});
