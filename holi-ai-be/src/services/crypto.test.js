const { encryptSecret, decryptSecret } = require('./crypto');

describe('crypto', () => {
  it('should encrypt and decrypt a secret string', () => {
    const original = 'my-super-secret-text';
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toBe(original);
    
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should return original text if decryption format is invalid', () => {
    const invalid = 'invalid-format-string';
    const decrypted = decryptSecret(invalid);
    expect(decrypted).toBe(invalid);
  });

  it('should handle environment variables for seed', () => {
    const originalEnv = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'test-seed';
    const original = 'another-secret';
    const encrypted = encryptSecret(original);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
    process.env.DATABASE_URL = originalEnv;
  });
});
