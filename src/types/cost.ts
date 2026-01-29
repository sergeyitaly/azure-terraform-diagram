// src/types/cost.ts

/**
 * Cost estimate for a resource
 */
export interface CostEstimate {
    monthlyCost: number;
    yearlyCost?: number;
    currency: string;
    tier: string;
    sku: string;
    meterId?: string;
    region: string;
    details?: CostBreakdown[];
    confidence: 'high' | 'medium' | 'low';
    lastUpdated?: Date;
    notes?: string[];
}

/**
 * Cost breakdown by component
 */
export interface CostBreakdown {
    component: string;
    unit: string;
    quantity: number;
    rate: number;
    cost: number;
    included?: boolean; // Included in base price
}

/**
 * SKU information
 */
export interface SKUInfo {
    tier: string;
    sku: string;
    size?: string;
    family?: string;
    capacity?: number;
    maxCapacity?: number;
    scalable?: boolean;
}

/**
 * Tag compliance information
 */
export interface TagCompliance {
    hasRequiredTags: boolean;
    missingTags: string[];
    tags: Record<string, string>;
    score: number; // 0-100
    recommendations?: string[];
}

/**
 * Azure pricing tier information
 */
export interface PricingTier {
    name: string;
    tier: string;
    size?: string;
    hourlyRate?: number;
    monthlyRate?: number;
    perUnitRate?: number;
    unit?: string;
    includedQuantity?: number;
    features?: string[];
}

/**
 * Azure pricing data structure for a resource type
 */
export interface ResourcePricing {
    resourceType: string;
    pricingModel: 'hourly' | 'monthly' | 'per-unit' | 'consumption' | 'reserved';
    tiers: Record<string, PricingTier>;
    defaultTier?: string;
}

/**
 * Cost center grouping
 */
export interface CostCenter {
    name: string;
    tag: string;
    resources: string[];
    totalMonthlyCost: number;
    currency: string;
}

/**
 * Cost optimization recommendation
 */
export interface CostOptimization {
    resourceId: string;
    resourceType: string;
    currentSku: string;
    recommendedSku?: string;
    currentMonthlyCost: number;
    estimatedMonthlyCost?: number;
    monthlySavings?: number;
    recommendation: string;
    impact: 'high' | 'medium' | 'low';
    category: 'rightsize' | 'reserved' | 'spot' | 'shutdown' | 'delete' | 'consolidate';
}

/**
 * Budget alert configuration
 */
export interface BudgetAlert {
    name: string;
    amount: number;
    currency: string;
    timeGrain: 'Monthly' | 'Quarterly' | 'Annually';
    thresholds: number[];
    contactEmails?: string[];
    contactGroups?: string[];
}

// In types/cost.ts
export interface CostBadgeInfo {
    monthlyCost: number;
    currency: string;
    formattedCost: string;
    tier: string;
    isHighCost: boolean;
}