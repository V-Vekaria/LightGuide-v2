import { describe, it, expect } from 'vitest';
import { verdict } from './verdict';
import type { Reading, Target } from '../contract/types';

const target: Target = {
  distance_cm: 50,
  distance_tol_cm: 5,
  brightness_above_ambient: 0.50,
  brightness_tol: 0.08,
};

function reading(over: Partial<Reading> = {}): Reading {
  return { distance_cm: 50, brightness: 0.60, ambient: 0.10, seq: 1, ts: 0, ...over };
}

describe('verdict', () => {
  it('reports on target when both channels are in band', () => {
    const v = verdict(reading(), target);
    expect(v.distance_state).toBe('in_band');
    expect(v.brightness_state).toBe('in_band');
    expect(v.instruction).toBe('On target');
    expect(v.trustworthy).toBe(true);
  });

  it('tells you to move closer when too far', () => {
    const v = verdict(reading({ distance_cm: 65 }), target);
    expect(v.distance_delta_cm).toBe(15);
    expect(v.distance_state).toBe('over');
    expect(v.instruction).toBe('Move 15 cm closer');
  });

  it('tells you to move further when too close', () => {
    const v = verdict(reading({ distance_cm: 38 }), target);
    expect(v.distance_delta_cm).toBe(-12);
    expect(v.distance_state).toBe('under');
    expect(v.instruction).toBe('Move 12 cm further');
  });

  it('subtracts ambient before comparing brightness', () => {
    // brightness 0.60 - ambient 0.10 = 0.50 above ambient, exactly on target
    const v = verdict(reading(), target);
    expect(v.brightness_delta).toBe(0);
  });

  it('is not fooled by a change in ambient light', () => {
    // Brighter room, light dialled up the same amount: still on target.
    const v = verdict(reading({ brightness: 0.85, ambient: 0.35 }), target);
    expect(v.brightness_state).toBe('in_band');
  });

  it('asks to raise the light when underlit', () => {
    const v = verdict(reading({ brightness: 0.30 }), target);
    expect(v.brightness_state).toBe('under');
    expect(v.instruction).toBe('Raise the light');
  });

  it('asks to lower the light when overlit', () => {
    const v = verdict(reading({ brightness: 0.90 }), target);
    expect(v.brightness_state).toBe('over');
    expect(v.instruction).toBe('Lower the light');
  });

  it('corrects distance before brightness', () => {
    const v = verdict(reading({ distance_cm: 70, brightness: 0.30 }), target);
    expect(v.distance_state).toBe('over');
    expect(v.brightness_state).toBe('under');
    expect(v.instruction).toBe('Move 20 cm closer');
  });

  it('marks a missed distance reading as untrustworthy and withholds instruction', () => {
    const v = verdict(reading({ distance_cm: null }), target);
    expect(v.distance_delta_cm).toBeNull();
    expect(v.distance_state).toBe('unknown');
    expect(v.trustworthy).toBe(false);
    expect(v.instruction).toBe('Waiting for a clear reading');
  });

  it('ignores light entirely for a distance-only setup', () => {
    const distanceOnly: Target = { ...target, brightness_above_ambient: null };
    const v = verdict(reading({ brightness: 0.05 }), distanceOnly);
    expect(v.brightness_state).toBe('unknown');
    expect(v.brightness_delta).toBeNull();
    expect(v.instruction).toBe('On target');
  });

  it('still guides distance when the light sensor drops out', () => {
    const v = verdict(reading({ brightness: null, distance_cm: 62 }), target);
    expect(v.instruction).toBe('Move 12 cm closer');
    expect(v.brightness_state).toBe('unknown');
  });

  it('holds at the tolerance boundary', () => {
    expect(verdict(reading({ distance_cm: 55 }), target).distance_state).toBe('in_band');
    expect(verdict(reading({ distance_cm: 55.1 }), target).distance_state).toBe('over');
  });

  it('warns when light guidance is active but sensor drops out', () => {
    const v = verdict(reading({ ambient: null }), target);
    expect(v.distance_state).toBe('in_band');
    expect(v.brightness_state).toBe('unknown');
    expect(v.instruction).toBe('On target for distance — no light reading');
  });

  it('still says on target for distance-only setups even when light is unreadable', () => {
    const distanceOnly: Target = { ...target, brightness_above_ambient: null };
    const v = verdict(reading({ brightness: null, ambient: null }), distanceOnly);
    expect(v.distance_state).toBe('in_band');
    expect(v.brightness_state).toBe('unknown');
    expect(v.instruction).toBe('On target');
  });
});
