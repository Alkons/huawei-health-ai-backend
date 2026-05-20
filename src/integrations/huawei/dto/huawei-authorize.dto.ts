import {
  ArrayNotEmpty,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import type { HuaweiConsentCategory } from '../schemas/huawei-consent-category';

export class HuaweiAuthorizeDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requestedCategories!: HuaweiConsentCategory[];

  @IsString()
  @IsNotEmpty()
  clientRedirectUrl!: string;

  @IsISO8601()
  consentShownAt!: string;

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
