import { describe, expect, it } from 'vitest';
import { fromCents, percentToBasisPoints, sellingPrice, toCents } from './pricing.js';

describe('pricing', () => {
  it('adds 8.5% to the store price', () => {
    expect(sellingPrice('100.00', 850)).toBe('108.50');
    expect(sellingPrice('15.99', 850)).toBe('17.35'); // 17.34915 rounds up
    expect(sellingPrice('0.00', 850)).toBe('0.00');
    expect(sellingPrice(24, 850)).toBe('26.04');
  });

  it('rounds half a cent up', () => {
    // 10.00 × 1.0005 = 10.005
    expect(sellingPrice('10.00', 5)).toBe('10.01');
  });

  it('leaves the price alone with no markup', () => {
    expect(sellingPrice('19.99', 0)).toBe('19.99');
  });

  it('converts percent to basis points', () => {
    expect(percentToBasisPoints(8.5)).toBe(850);
    expect(percentToBasisPoints(0)).toBe(0);
    expect(() => percentToBasisPoints(-1)).toThrow();
    expect(() => percentToBasisPoints(101)).toThrow();
  });

  it('parses and prints cents exactly', () => {
    expect(toCents('1')).toBe(100);
    expect(toCents('1.5')).toBe(150);
    expect(toCents('0.07')).toBe(7);
    expect(fromCents(7)).toBe('0.07');
    expect(fromCents(123456)).toBe('1234.56');
    expect(() => toCents('-1.00')).toThrow();
    expect(() => toCents('1.999')).toThrow();
    expect(() => toCents('abc')).toThrow();
  });
});
