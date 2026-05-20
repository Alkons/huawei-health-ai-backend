import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HuaweiTokenCryptoService } from './huawei-token-crypto.service';

describe('HuaweiTokenCryptoService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  const createModule = async (tokenEncryptionKey: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuaweiTokenCryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({
              huawei: { tokenEncryptionKey },
            })),
          },
        },
      ],
    }).compile();
    return module.get(HuaweiTokenCryptoService);
  };

  it('should roundtrip encrypt/decrypt', async () => {
    const service = await createModule(key);
    const encrypted = service.encryptRefreshToken('refresh-token');
    const decrypted = service.decryptRefreshToken(encrypted);
    expect(decrypted).toBe('refresh-token');
  });

  it('should reject invalid base64 key length', async () => {
    const service = await createModule(Buffer.alloc(16, 1).toString('base64'));
    expect(() => service.encryptRefreshToken('x')).toThrow(
      'Huawei token encryption key must be 32 bytes (base64-encoded)',
    );
  });
});

