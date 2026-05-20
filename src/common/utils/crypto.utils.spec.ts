import { getHash, compareHash } from './crypto.utils';

describe('CryptoUtils', () => {
  describe('getHash', () => {
    it('should return a hash string', async () => {
      const hash = await getHash('password');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).toContain(':');
    });
  });

  describe('compareHash', () => {
    it('should return true for matching hash', async () => {
      const password = 'password';
      const hash = await getHash(password);
      const result = await compareHash(password, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching hash', async () => {
      const password = 'password';
      const hash = await getHash(password);
      const result = await compareHash('wrongpassword', hash);
      expect(result).toBe(false);
    });
  });
});
