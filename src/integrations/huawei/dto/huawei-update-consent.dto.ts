import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import type { HuaweiConsentCategory } from '../schemas/huawei-consent-category';

export class HuaweiUpdateConsentDto {
  @IsArray()
  @IsString({ each: true })
  enabledCategories!: HuaweiConsentCategory[];

  @IsString()
  @IsNotEmpty()
  consentUiVersion!: string;

  @IsString()
  @IsNotEmpty()
  privacyPolicyVersion!: string;

  @IsString()
  @IsNotEmpty()
  nonMedicalDisclaimerVersion!: string;
}
