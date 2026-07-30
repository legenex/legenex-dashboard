import { describe, it, expect } from 'vitest';
import { maskText, viewportFor } from './capture';

// Masking is the only thing standing between a screenshot store and a pile of
// real lead personal data, so it gets tested rather than trusted.
describe('personal data masking', () => {
  const blocked = (s) => /^\u2022+$/.test(s);

  it('redacts email addresses', () => {
    const { text, hits } = maskText('Contact nick@legenex.com about this');
    expect(hits).toBe(1);
    expect(text).not.toContain('nick@legenex.com');
    expect(text).toContain('Contact ');
  });

  it('redacts phone numbers in the shapes the app renders', () => {
    ['(555) 123-4567', '555-123-4567', '+1 555 123 4567', '5551234567']
      .forEach((phone) => {
        const { text, hits } = maskText(`Lead phone ${phone}`);
        expect(hits).toBeGreaterThan(0);
        expect(text).not.toContain(phone);
      });
  });

  it('redacts TrustedForm certificate urls', () => {
    const url = 'https://cert.trustedform.com/abc123def456ghi789jkl';
    const { text, hits } = maskText(`cert ${url}`);
    expect(hits).toBeGreaterThan(0);
    expect(text).not.toContain('trustedform.com/abc123');
  });

  it('redacts long opaque tokens such as api keys and jornaya ids', () => {
    const token = 'sk_live_A1b2C3d4E5f6G7h8I9j0K1l2';
    const { text, hits } = maskText(`key ${token}`);
    expect(hits).toBeGreaterThan(0);
    expect(text).not.toContain(token);
  });

  it('preserves the length of what it redacts so layout is unchanged', () => {
    const { text } = maskText('nick@legenex.com');
    expect(text).toHaveLength('nick@legenex.com'.length);
    expect(blocked(text)).toBe(true);
  });

  it('leaves ordinary copy alone', () => {
    const { text, hits } = maskText('Sold leads for Motor Vehicle Accidents');
    expect(hits).toBe(0);
    expect(text).toBe('Sold leads for Motor Vehicle Accidents');
  });

  it('handles empty input without throwing', () => {
    expect(maskText('').hits).toBe(0);
    expect(maskText(null).hits ?? 0).toBe(0);
  });
});

describe('viewport bucketing', () => {
  it('buckets by real width', () => {
    expect(viewportFor(1440)).toBe('desktop');
    expect(viewportFor(768)).toBe('tablet');
    expect(viewportFor(390)).toBe('mobile');
  });
});
