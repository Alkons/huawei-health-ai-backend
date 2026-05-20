import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class HuaweiDisconnectDto {
  @IsString()
  @IsIn(['retain', 'deleteImportedData'])
  @IsOptional()
  deletionMode?: 'retain' | 'deleteImportedData';

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  consentUiVersion?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  privacyPolicyVersion?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  nonMedicalDisclaimerVersion?: string;
}
