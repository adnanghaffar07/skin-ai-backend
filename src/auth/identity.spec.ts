import { identityFromPayload } from './identity.js';

describe('identityFromPayload', () => {
  it('reads the subject, email, and signup name', () => {
    expect(
      identityFromPayload({
        sub: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
        email: 'ameliajane43@gmail.com',
        user_metadata: { full_name: ' Amelia Jane ' },
      }),
    ).toEqual({
      id: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
      email: 'ameliajane43@gmail.com',
      displayName: 'Amelia Jane',
    });
  });

  it('reads the name the mobile app sends at sign-up', () => {
    expect(
      identityFromPayload({
        sub: '8c1f0a52-3e4b-4d7a-9f10-6b2c8d0e1a77',
        user_metadata: { display_name: 'Ayesha', full_name: 'Other' },
      }).displayName,
    ).toBe('Ayesha');
  });

  it('rejects a token without a subject', () => {
    expect(() => identityFromPayload({})).toThrow(/access token/);
  });
});
