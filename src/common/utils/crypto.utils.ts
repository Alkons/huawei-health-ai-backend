import crypto from 'node:crypto';

const saltLength = 16;

export function getHash(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(saltLength).toString('hex');
    crypto.scrypt(input, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

export function compareHash(input: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.scrypt(input, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}
