import { HuaweiConsentCategory } from '../schemas/huawei-consent-category.js';
import { HuaweiSyncReasonClass } from '../schemas/huawei-sync-progress.schema.js';

export type HuaweiFreshnessState = 'fresh' | 'delayed' | 'stale' | 'unknown';
export type HuaweiCompletenessState = 'complete' | 'partial' | 'none';
export type HuaweiConfidenceLevel = 'high' | 'medium' | 'low';

export interface UserGuidance {
  message: string;
  actionSteps: string[];
}

export interface CategoryReliability {
  category: HuaweiConsentCategory;
  displayName: string;
  status: 'synced' | 'syncing' | 'failed' | 'pending';
  lastSuccessAt?: Date;
  lastAttemptedAt?: Date;
  reasonClass: HuaweiSyncReasonClass;
  explanation?: string;
  freshness: HuaweiFreshnessState;
  guidanceHint: string;
  isStaleBannerRequired: boolean;
}

export interface ReliabilityReport {
  overall: {
    lastSyncAt?: Date;
    freshness: HuaweiFreshnessState;
    completeness: HuaweiCompletenessState;
    confidence: HuaweiConfidenceLevel;
    guidance: UserGuidance;
    isStaleBannerRequired: boolean;
  };
  categories: CategoryReliability[];
}
