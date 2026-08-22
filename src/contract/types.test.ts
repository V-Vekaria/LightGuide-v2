import { describe, it, expect } from 'vitest';
import { newSetup, targetFromSetup, DEFAULT_DISTANCE_TOL_CM } from './types';

describe('newSetup', () => {
  it('stamps created_at, updated_at and deleted for sync', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    expect(s.created_at).toBe(s.updated_at);
    expect(s.deleted).toBe(false);
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('defaults distance tolerance and leaves light unset', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'typed' });
    expect(s.distance_tol_cm).toBe(DEFAULT_DISTANCE_TOL_CM);
    expect(s.brightness_above_ambient).toBeNull();
    expect(s.brightness_captured_at).toBeNull();
  });

  it('timestamps the light capture only when light is present', () => {
    const s = newSetup({
      name: 'Key', distance_cm: 50, distance_source: 'typed',
      brightness_above_ambient: 0.51,
    });
    expect(s.brightness_captured_at).not.toBeNull();
  });

  it('projects to a Target', () => {
    const s = newSetup({ name: 'Key', distance_cm: 50, distance_source: 'captured' });
    expect(targetFromSetup(s)).toEqual({
      distance_cm: 50,
      distance_tol_cm: 5,
      brightness_above_ambient: null,
      brightness_tol: 0.08,
    });
  });
});
