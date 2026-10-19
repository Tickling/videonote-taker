import { describe, expect, it } from 'vitest';
import { Timestamp } from './Timestamp';

describe('Timestamp', () => {
  it.each([
    [0, '00:00'],
    [5, '00:05'],
    [65, '01:05'],
    [599.9, '09:59'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [36000, '10:00:00'],
  ])('formats %d as %s', (seconds, expected) => {
    expect(new Timestamp(seconds).format()).toBe(expected);
  });

  it('rejects negative and non-finite values', () => {
    expect(() => new Timestamp(-1)).toThrow();
    expect(() => new Timestamp(Number.NaN)).toThrow();
    expect(() => new Timestamp(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('of() clamps invalid values to zero', () => {
    expect(Timestamp.of(-5).seconds).toBe(0);
    expect(Timestamp.of(Number.NaN).seconds).toBe(0);
    expect(Timestamp.of(12).seconds).toBe(12);
  });

  it.each([
    ['01:05', 65],
    ['1:02:05', 3725],
    ['75', 75],
  ])('parses %s', (value, seconds) => {
    expect(Timestamp.parse(value).seconds).toBe(seconds);
  });

  it('rejects malformed timecodes', () => {
    expect(() => Timestamp.parse('1:xx')).toThrow();
    expect(() => Timestamp.parse('1:2:3:4')).toThrow();
  });

  it('adds seconds and compares by whole seconds', () => {
    expect(new Timestamp(10).plus(5).seconds).toBe(15);
    expect(new Timestamp(10.2).equals(new Timestamp(10.9))).toBe(true);
  });
});
