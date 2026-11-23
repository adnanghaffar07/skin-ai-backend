import { describe, expect, it } from 'vitest';
import { contactAddress } from './legal-pages.controller.js';
import { legalPage, PRIVACY, TERMS } from './legal-pages.js';

describe('legal pages', () => {
  it('renders every section, escaped, with the contact address', () => {
    const html = legalPage('Privacy Policy', [{ heading: 'A & B', paragraphs: ['<b>x</b>'] }], 'team@example.com');
    expect(html).toContain('<h2>A &amp; B</h2>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('mailto:team@example.com');
    expect(html).not.toContain('<script');
  });
  it('covers what the stores ask about', () => {
    const privacy = JSON.stringify(PRIVACY);
    for (const needed of ['delete your account', 'Stripe', 'never sold', 'under 13', 'India']) {
      expect(privacy).toContain(needed);
    }
    expect(JSON.stringify(TERMS)).toContain('not medical advice');
  });
  it('reads the plain address out of the reply-to setting', () => {
    expect(contactAddress('Clara Team <team@example.com>')).toBe('team@example.com');
    expect(contactAddress('team@example.com')).toBe('team@example.com');
    expect(contactAddress(undefined)).toBeUndefined();
    expect(contactAddress('not an address')).toBeUndefined();
  });
});
