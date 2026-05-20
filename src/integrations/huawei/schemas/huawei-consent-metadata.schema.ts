import { Prop } from '@nestjs/mongoose';

export class HuaweiConsentMetadataSchema {
  @Prop({ required: true })
  consentUiVersion!: string;

  @Prop({ required: true })
  privacyPolicyVersion!: string;

  @Prop({ required: true })
  nonMedicalDisclaimerVersion!: string;

  @Prop({ required: true, index: true })
  correlationId!: string;
}
