import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class HuaweiTokenCryptoService {
  constructor(private readonly configService: ConfigService) {}

  encryptRefreshToken(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decryptRefreshToken(encrypted: string): string {
    const key = this.getKey();
    const [ivB64, tagB64, ciphertextB64] = encrypted.split('.');
    if (!ivB64 || !tagB64 || !ciphertextB64) {
      throw new BadRequestException('Invalid encrypted token format');
    }
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }

  private getKey(): Buffer {
    const appConfig = this.configService.get<AppConfig>('app');
    if (!appConfig) {
      throw new BadRequestException('Missing app configuration');
    }
    const keyB64 = appConfig.huawei.tokenEncryptionKey;
    if (!keyB64) {
      throw new BadRequestException('Missing Huawei token encryption key');
    }
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== 32) {
      throw new BadRequestException(
        'Huawei token encryption key must be 32 bytes (base64-encoded)',
      );
    }
    return key;
  }
}
