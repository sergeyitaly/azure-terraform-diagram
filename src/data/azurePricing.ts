// src/data/azurePricing.ts
import { ResourcePricing, PricingTier } from '../types/cost';

/**
 * Azure pricing data (estimated, US East region)
 * Note: Actual Azure pricing varies by region, contract type, and can change.
 * These are approximate values for estimation purposes only.
 */

export const AZURE_PRICING: Record<string, ResourcePricing> = {
    // ==========================================
    // Virtual Machines
    // ==========================================
    'azurerm_virtual_machine': {
        resourceType: 'azurerm_virtual_machine',
        pricingModel: 'hourly',
        tiers: {
            // B-series (Burstable)
            'Standard_B1s': { name: 'Standard_B1s', tier: 'B', size: '1s', hourlyRate: 0.0104, monthlyRate: 7.59, features: ['1 vCPU', '1 GB RAM'] },
            'Standard_B1ms': { name: 'Standard_B1ms', tier: 'B', size: '1ms', hourlyRate: 0.0207, monthlyRate: 15.11, features: ['1 vCPU', '2 GB RAM'] },
            'Standard_B2s': { name: 'Standard_B2s', tier: 'B', size: '2s', hourlyRate: 0.0416, monthlyRate: 30.37, features: ['2 vCPU', '4 GB RAM'] },
            'Standard_B2ms': { name: 'Standard_B2ms', tier: 'B', size: '2ms', hourlyRate: 0.0832, monthlyRate: 60.74, features: ['2 vCPU', '8 GB RAM'] },
            'Standard_B4ms': { name: 'Standard_B4ms', tier: 'B', size: '4ms', hourlyRate: 0.166, monthlyRate: 121.18, features: ['4 vCPU', '16 GB RAM'] },

            // D-series v3 (General purpose)
            'Standard_D2s_v3': { name: 'Standard_D2s_v3', tier: 'D', size: '2s_v3', hourlyRate: 0.096, monthlyRate: 70.08, features: ['2 vCPU', '8 GB RAM', 'Premium Storage'] },
            'Standard_D4s_v3': { name: 'Standard_D4s_v3', tier: 'D', size: '4s_v3', hourlyRate: 0.192, monthlyRate: 140.16, features: ['4 vCPU', '16 GB RAM', 'Premium Storage'] },
            'Standard_D8s_v3': { name: 'Standard_D8s_v3', tier: 'D', size: '8s_v3', hourlyRate: 0.384, monthlyRate: 280.32, features: ['8 vCPU', '32 GB RAM', 'Premium Storage'] },
            'Standard_D16s_v3': { name: 'Standard_D16s_v3', tier: 'D', size: '16s_v3', hourlyRate: 0.768, monthlyRate: 560.64, features: ['16 vCPU', '64 GB RAM', 'Premium Storage'] },
            'Standard_D32s_v3': { name: 'Standard_D32s_v3', tier: 'D', size: '32s_v3', hourlyRate: 1.536, monthlyRate: 1121.28, features: ['32 vCPU', '128 GB RAM', 'Premium Storage'] },

            // E-series v3 (Memory optimized)
            'Standard_E2s_v3': { name: 'Standard_E2s_v3', tier: 'E', size: '2s_v3', hourlyRate: 0.126, monthlyRate: 91.98, features: ['2 vCPU', '16 GB RAM', 'Premium Storage'] },
            'Standard_E4s_v3': { name: 'Standard_E4s_v3', tier: 'E', size: '4s_v3', hourlyRate: 0.252, monthlyRate: 183.96, features: ['4 vCPU', '32 GB RAM', 'Premium Storage'] },
            'Standard_E8s_v3': { name: 'Standard_E8s_v3', tier: 'E', size: '8s_v3', hourlyRate: 0.504, monthlyRate: 367.92, features: ['8 vCPU', '64 GB RAM', 'Premium Storage'] },

            // F-series v2 (Compute optimized)
            'Standard_F2s_v2': { name: 'Standard_F2s_v2', tier: 'F', size: '2s_v2', hourlyRate: 0.085, monthlyRate: 62.05, features: ['2 vCPU', '4 GB RAM', 'Premium Storage'] },
            'Standard_F4s_v2': { name: 'Standard_F4s_v2', tier: 'F', size: '4s_v2', hourlyRate: 0.169, monthlyRate: 123.37, features: ['4 vCPU', '8 GB RAM', 'Premium Storage'] },
            'Standard_F8s_v2': { name: 'Standard_F8s_v2', tier: 'F', size: '8s_v2', hourlyRate: 0.338, monthlyRate: 246.74, features: ['8 vCPU', '16 GB RAM', 'Premium Storage'] },
        },
        defaultTier: 'Standard_D2s_v3'
    },
    'azurerm_linux_virtual_machine': {
        resourceType: 'azurerm_linux_virtual_machine',
        pricingModel: 'hourly',
        tiers: {
            'Standard_B1s': { name: 'Standard_B1s', tier: 'B', size: '1s', hourlyRate: 0.0104, monthlyRate: 7.59, features: ['1 vCPU', '1 GB RAM'] },
            'Standard_B2s': { name: 'Standard_B2s', tier: 'B', size: '2s', hourlyRate: 0.0416, monthlyRate: 30.37, features: ['2 vCPU', '4 GB RAM'] },
            'Standard_D2s_v3': { name: 'Standard_D2s_v3', tier: 'D', size: '2s_v3', hourlyRate: 0.096, monthlyRate: 70.08, features: ['2 vCPU', '8 GB RAM'] },
            'Standard_D4s_v3': { name: 'Standard_D4s_v3', tier: 'D', size: '4s_v3', hourlyRate: 0.192, monthlyRate: 140.16, features: ['4 vCPU', '16 GB RAM'] },
            'Standard_D8s_v3': { name: 'Standard_D8s_v3', tier: 'D', size: '8s_v3', hourlyRate: 0.384, monthlyRate: 280.32, features: ['8 vCPU', '32 GB RAM'] },
        },
        defaultTier: 'Standard_D2s_v3'
    },
    'azurerm_windows_virtual_machine': {
        resourceType: 'azurerm_windows_virtual_machine',
        pricingModel: 'hourly',
        tiers: {
            'Standard_B1s': { name: 'Standard_B1s', tier: 'B', size: '1s', hourlyRate: 0.02, monthlyRate: 14.60, features: ['1 vCPU', '1 GB RAM'] },
            'Standard_B2s': { name: 'Standard_B2s', tier: 'B', size: '2s', hourlyRate: 0.0624, monthlyRate: 45.55, features: ['2 vCPU', '4 GB RAM'] },
            'Standard_D2s_v3': { name: 'Standard_D2s_v3', tier: 'D', size: '2s_v3', hourlyRate: 0.188, monthlyRate: 137.24, features: ['2 vCPU', '8 GB RAM'] },
            'Standard_D4s_v3': { name: 'Standard_D4s_v3', tier: 'D', size: '4s_v3', hourlyRate: 0.376, monthlyRate: 274.48, features: ['4 vCPU', '16 GB RAM'] },
            'Standard_D8s_v3': { name: 'Standard_D8s_v3', tier: 'D', size: '8s_v3', hourlyRate: 0.752, monthlyRate: 548.96, features: ['8 vCPU', '32 GB RAM'] },
        },
        defaultTier: 'Standard_D2s_v3'
    },

    // ==========================================
    // Storage
    // ==========================================
    'azurerm_storage_account': {
        resourceType: 'azurerm_storage_account',
        pricingModel: 'per-unit',
        tiers: {
            'Standard_LRS': { name: 'Standard_LRS', tier: 'Standard', perUnitRate: 0.018, unit: 'GB/month', features: ['Locally redundant'] },
            'Standard_GRS': { name: 'Standard_GRS', tier: 'Standard', perUnitRate: 0.036, unit: 'GB/month', features: ['Geo-redundant'] },
            'Standard_RAGRS': { name: 'Standard_RAGRS', tier: 'Standard', perUnitRate: 0.046, unit: 'GB/month', features: ['Read-access geo-redundant'] },
            'Standard_ZRS': { name: 'Standard_ZRS', tier: 'Standard', perUnitRate: 0.0225, unit: 'GB/month', features: ['Zone-redundant'] },
            'Premium_LRS': { name: 'Premium_LRS', tier: 'Premium', perUnitRate: 0.15, unit: 'GB/month', features: ['Premium SSD', 'Locally redundant'] },
            'Premium_ZRS': { name: 'Premium_ZRS', tier: 'Premium', perUnitRate: 0.1875, unit: 'GB/month', features: ['Premium SSD', 'Zone-redundant'] },
        },
        defaultTier: 'Standard_LRS'
    },

    // ==========================================
    // SQL Database
    // ==========================================
    'azurerm_mssql_database': {
        resourceType: 'azurerm_mssql_database',
        pricingModel: 'monthly',
        tiers: {
            // DTU-based
            'Basic': { name: 'Basic', tier: 'Basic', monthlyRate: 4.90, features: ['5 DTUs', '2 GB storage'] },
            'S0': { name: 'S0', tier: 'Standard', monthlyRate: 14.72, features: ['10 DTUs', '250 GB storage'] },
            'S1': { name: 'S1', tier: 'Standard', monthlyRate: 29.43, features: ['20 DTUs', '250 GB storage'] },
            'S2': { name: 'S2', tier: 'Standard', monthlyRate: 73.58, features: ['50 DTUs', '250 GB storage'] },
            'S3': { name: 'S3', tier: 'Standard', monthlyRate: 147.17, features: ['100 DTUs', '250 GB storage'] },
            'P1': { name: 'P1', tier: 'Premium', monthlyRate: 464.77, features: ['125 DTUs', '500 GB storage'] },
            'P2': { name: 'P2', tier: 'Premium', monthlyRate: 929.53, features: ['250 DTUs', '500 GB storage'] },
            'P4': { name: 'P4', tier: 'Premium', monthlyRate: 1859.06, features: ['500 DTUs', '500 GB storage'] },

            // vCore-based
            'GP_S_Gen5_1': { name: 'GP_S_Gen5_1', tier: 'GeneralPurpose', monthlyRate: 65.54, features: ['1 vCore', 'Serverless'] },
            'GP_S_Gen5_2': { name: 'GP_S_Gen5_2', tier: 'GeneralPurpose', monthlyRate: 131.07, features: ['2 vCores', 'Serverless'] },
            'GP_Gen5_2': { name: 'GP_Gen5_2', tier: 'GeneralPurpose', monthlyRate: 294.30, features: ['2 vCores', 'Provisioned'] },
            'GP_Gen5_4': { name: 'GP_Gen5_4', tier: 'GeneralPurpose', monthlyRate: 588.60, features: ['4 vCores', 'Provisioned'] },
            'BC_Gen5_2': { name: 'BC_Gen5_2', tier: 'BusinessCritical', monthlyRate: 720.37, features: ['2 vCores', 'Provisioned', 'Local SSD'] },
            'BC_Gen5_4': { name: 'BC_Gen5_4', tier: 'BusinessCritical', monthlyRate: 1440.74, features: ['4 vCores', 'Provisioned', 'Local SSD'] },
        },
        defaultTier: 'S0'
    },
    'azurerm_sql_database': {
        resourceType: 'azurerm_sql_database',
        pricingModel: 'monthly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', monthlyRate: 4.90, features: ['5 DTUs'] },
            'S0': { name: 'S0', tier: 'Standard', monthlyRate: 14.72, features: ['10 DTUs'] },
            'S1': { name: 'S1', tier: 'Standard', monthlyRate: 29.43, features: ['20 DTUs'] },
            'S2': { name: 'S2', tier: 'Standard', monthlyRate: 73.58, features: ['50 DTUs'] },
            'P1': { name: 'P1', tier: 'Premium', monthlyRate: 464.77, features: ['125 DTUs'] },
        },
        defaultTier: 'S0'
    },

    // ==========================================
    // Kubernetes Service (AKS)
    // ==========================================
    'azurerm_kubernetes_cluster': {
        resourceType: 'azurerm_kubernetes_cluster',
        pricingModel: 'monthly',
        tiers: {
            'Free': { name: 'Free', tier: 'Free', monthlyRate: 0, features: ['Free control plane', 'No SLA'] },
            'Standard': { name: 'Standard', tier: 'Standard', monthlyRate: 73.00, features: ['SLA', 'Uptime guarantee'] },
        },
        defaultTier: 'Free'
    },

    // ==========================================
    // App Service
    // ==========================================
    'azurerm_app_service': {
        resourceType: 'azurerm_app_service',
        pricingModel: 'monthly',
        tiers: {
            'F1': { name: 'F1', tier: 'Free', monthlyRate: 0, features: ['Free', '1 GB memory', '60 min/day compute'] },
            'D1': { name: 'D1', tier: 'Shared', monthlyRate: 9.49, features: ['Shared', '1 GB memory'] },
            'B1': { name: 'B1', tier: 'Basic', monthlyRate: 13.14, features: ['1 core', '1.75 GB RAM', '10 GB storage'] },
            'B2': { name: 'B2', tier: 'Basic', monthlyRate: 26.28, features: ['2 cores', '3.5 GB RAM', '10 GB storage'] },
            'B3': { name: 'B3', tier: 'Basic', monthlyRate: 52.56, features: ['4 cores', '7 GB RAM', '10 GB storage'] },
            'S1': { name: 'S1', tier: 'Standard', monthlyRate: 73.00, features: ['1 core', '1.75 GB RAM', '50 GB storage', 'Auto-scale'] },
            'S2': { name: 'S2', tier: 'Standard', monthlyRate: 146.00, features: ['2 cores', '3.5 GB RAM', '50 GB storage', 'Auto-scale'] },
            'S3': { name: 'S3', tier: 'Standard', monthlyRate: 292.00, features: ['4 cores', '7 GB RAM', '50 GB storage', 'Auto-scale'] },
            'P1v2': { name: 'P1v2', tier: 'Premium', monthlyRate: 81.03, features: ['1 core', '3.5 GB RAM', '250 GB storage'] },
            'P2v2': { name: 'P2v2', tier: 'Premium', monthlyRate: 162.06, features: ['2 cores', '7 GB RAM', '250 GB storage'] },
            'P3v2': { name: 'P3v2', tier: 'Premium', monthlyRate: 324.12, features: ['4 cores', '14 GB RAM', '250 GB storage'] },
            'P1v3': { name: 'P1v3', tier: 'PremiumV3', monthlyRate: 110.96, features: ['2 vCPUs', '8 GB RAM', '250 GB storage'] },
            'P2v3': { name: 'P2v3', tier: 'PremiumV3', monthlyRate: 221.92, features: ['4 vCPUs', '16 GB RAM', '250 GB storage'] },
            'P3v3': { name: 'P3v3', tier: 'PremiumV3', monthlyRate: 443.84, features: ['8 vCPUs', '32 GB RAM', '250 GB storage'] },
        },
        defaultTier: 'B1'
    },
    'azurerm_linux_web_app': {
        resourceType: 'azurerm_linux_web_app',
        pricingModel: 'monthly',
        tiers: {
            'F1': { name: 'F1', tier: 'Free', monthlyRate: 0, features: ['Free'] },
            'B1': { name: 'B1', tier: 'Basic', monthlyRate: 13.14, features: ['1 core', '1.75 GB RAM'] },
            'B2': { name: 'B2', tier: 'Basic', monthlyRate: 26.28, features: ['2 cores', '3.5 GB RAM'] },
            'S1': { name: 'S1', tier: 'Standard', monthlyRate: 73.00, features: ['1 core', '1.75 GB RAM', 'Auto-scale'] },
            'P1v2': { name: 'P1v2', tier: 'Premium', monthlyRate: 81.03, features: ['1 core', '3.5 GB RAM'] },
            'P1v3': { name: 'P1v3', tier: 'PremiumV3', monthlyRate: 110.96, features: ['2 vCPUs', '8 GB RAM'] },
        },
        defaultTier: 'B1'
    },
    'azurerm_service_plan': {
        resourceType: 'azurerm_service_plan',
        pricingModel: 'monthly',
        tiers: {
            'F1': { name: 'F1', tier: 'Free', monthlyRate: 0, features: ['Free'] },
            'B1': { name: 'B1', tier: 'Basic', monthlyRate: 13.14, features: ['1 core', '1.75 GB RAM'] },
            'B2': { name: 'B2', tier: 'Basic', monthlyRate: 26.28, features: ['2 cores', '3.5 GB RAM'] },
            'B3': { name: 'B3', tier: 'Basic', monthlyRate: 52.56, features: ['4 cores', '7 GB RAM'] },
            'S1': { name: 'S1', tier: 'Standard', monthlyRate: 73.00, features: ['1 core', '1.75 GB RAM', 'Auto-scale'] },
            'S2': { name: 'S2', tier: 'Standard', monthlyRate: 146.00, features: ['2 cores', '3.5 GB RAM', 'Auto-scale'] },
            'S3': { name: 'S3', tier: 'Standard', monthlyRate: 292.00, features: ['4 cores', '7 GB RAM', 'Auto-scale'] },
            'P1v3': { name: 'P1v3', tier: 'PremiumV3', monthlyRate: 110.96, features: ['2 vCPUs', '8 GB RAM'] },
            'P2v3': { name: 'P2v3', tier: 'PremiumV3', monthlyRate: 221.92, features: ['4 vCPUs', '16 GB RAM'] },
            'P3v3': { name: 'P3v3', tier: 'PremiumV3', monthlyRate: 443.84, features: ['8 vCPUs', '32 GB RAM'] },
        },
        defaultTier: 'B1'
    },

    // ==========================================
    // Function App
    // ==========================================
    'azurerm_function_app': {
        resourceType: 'azurerm_function_app',
        pricingModel: 'consumption',
        tiers: {
            'Consumption': { name: 'Consumption', tier: 'Consumption', monthlyRate: 0, perUnitRate: 0.000016, unit: 'GB-s', features: ['Pay per execution'] },
            'EP1': { name: 'EP1', tier: 'Premium', monthlyRate: 173.14, features: ['1 vCPU', '3.5 GB RAM', 'Always ready'] },
            'EP2': { name: 'EP2', tier: 'Premium', monthlyRate: 346.28, features: ['2 vCPU', '7 GB RAM', 'Always ready'] },
            'EP3': { name: 'EP3', tier: 'Premium', monthlyRate: 692.56, features: ['4 vCPU', '14 GB RAM', 'Always ready'] },
        },
        defaultTier: 'Consumption'
    },
    'azurerm_linux_function_app': {
        resourceType: 'azurerm_linux_function_app',
        pricingModel: 'consumption',
        tiers: {
            'Y1': { name: 'Y1', tier: 'Consumption', monthlyRate: 0, perUnitRate: 0.000016, unit: 'GB-s', features: ['Pay per execution'] },
            'EP1': { name: 'EP1', tier: 'Premium', monthlyRate: 173.14, features: ['1 vCPU', '3.5 GB RAM'] },
            'EP2': { name: 'EP2', tier: 'Premium', monthlyRate: 346.28, features: ['2 vCPU', '7 GB RAM'] },
        },
        defaultTier: 'Y1'
    },

    // ==========================================
    // Container Registry
    // ==========================================
    'azurerm_container_registry': {
        resourceType: 'azurerm_container_registry',
        pricingModel: 'monthly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', monthlyRate: 5.00, features: ['10 GB storage', '2 webhooks'] },
            'Standard': { name: 'Standard', tier: 'Standard', monthlyRate: 20.00, features: ['100 GB storage', '10 webhooks'] },
            'Premium': { name: 'Premium', tier: 'Premium', monthlyRate: 50.00, features: ['500 GB storage', '100 webhooks', 'Geo-replication'] },
        },
        defaultTier: 'Basic'
    },

    // ==========================================
    // Redis Cache
    // ==========================================
    'azurerm_redis_cache': {
        resourceType: 'azurerm_redis_cache',
        pricingModel: 'monthly',
        tiers: {
            'Basic_C0': { name: 'Basic C0', tier: 'Basic', monthlyRate: 16.06, features: ['250 MB', 'No SLA'] },
            'Basic_C1': { name: 'Basic C1', tier: 'Basic', monthlyRate: 36.59, features: ['1 GB', 'No SLA'] },
            'Basic_C2': { name: 'Basic C2', tier: 'Basic', monthlyRate: 68.62, features: ['2.5 GB', 'No SLA'] },
            'Standard_C0': { name: 'Standard C0', tier: 'Standard', monthlyRate: 42.34, features: ['250 MB', 'SLA', 'Replication'] },
            'Standard_C1': { name: 'Standard C1', tier: 'Standard', monthlyRate: 84.68, features: ['1 GB', 'SLA', 'Replication'] },
            'Standard_C2': { name: 'Standard C2', tier: 'Standard', monthlyRate: 158.77, features: ['2.5 GB', 'SLA', 'Replication'] },
            'Premium_P1': { name: 'Premium P1', tier: 'Premium', monthlyRate: 408.62, features: ['6 GB', 'Clustering', 'Persistence'] },
            'Premium_P2': { name: 'Premium P2', tier: 'Premium', monthlyRate: 862.00, features: ['13 GB', 'Clustering', 'Persistence'] },
            'Premium_P3': { name: 'Premium P3', tier: 'Premium', monthlyRate: 1724.00, features: ['26 GB', 'Clustering', 'Persistence'] },
        },
        defaultTier: 'Basic_C0'
    },

    // ==========================================
    // Cosmos DB
    // ==========================================
    'azurerm_cosmosdb_account': {
        resourceType: 'azurerm_cosmosdb_account',
        pricingModel: 'consumption',
        tiers: {
            'Serverless': { name: 'Serverless', tier: 'Serverless', perUnitRate: 0.25, unit: 'million RU', features: ['Pay per request'] },
            'Provisioned_400': { name: '400 RU/s', tier: 'Standard', monthlyRate: 23.36, features: ['400 RU/s provisioned'] },
            'Provisioned_1000': { name: '1000 RU/s', tier: 'Standard', monthlyRate: 58.40, features: ['1000 RU/s provisioned'] },
            'Provisioned_10000': { name: '10000 RU/s', tier: 'Standard', monthlyRate: 584.00, features: ['10000 RU/s provisioned'] },
            'Autoscale_1000': { name: 'Autoscale 1000', tier: 'Autoscale', monthlyRate: 87.60, features: ['Up to 1000 RU/s'] },
            'Autoscale_10000': { name: 'Autoscale 10000', tier: 'Autoscale', monthlyRate: 876.00, features: ['Up to 10000 RU/s'] },
        },
        defaultTier: 'Serverless'
    },

    // ==========================================
    // Key Vault
    // ==========================================
    'azurerm_key_vault': {
        resourceType: 'azurerm_key_vault',
        pricingModel: 'per-unit',
        tiers: {
            'standard': { name: 'Standard', tier: 'Standard', perUnitRate: 0.03, unit: '10K operations', features: ['Software-protected keys'] },
            'premium': { name: 'Premium', tier: 'Premium', perUnitRate: 0.03, unit: '10K operations', features: ['HSM-protected keys available'] },
        },
        defaultTier: 'standard'
    },

    // ==========================================
    // Application Gateway
    // ==========================================
    'azurerm_application_gateway': {
        resourceType: 'azurerm_application_gateway',
        pricingModel: 'hourly',
        tiers: {
            'Standard_Small': { name: 'Standard Small', tier: 'Standard', hourlyRate: 0.025, monthlyRate: 18.25, features: ['1 capacity unit'] },
            'Standard_Medium': { name: 'Standard Medium', tier: 'Standard', hourlyRate: 0.07, monthlyRate: 51.10, features: ['2 capacity units'] },
            'Standard_Large': { name: 'Standard Large', tier: 'Standard', hourlyRate: 0.175, monthlyRate: 127.75, features: ['4 capacity units'] },
            'WAF_Medium': { name: 'WAF Medium', tier: 'WAF', hourlyRate: 0.126, monthlyRate: 91.98, features: ['WAF', '2 capacity units'] },
            'WAF_Large': { name: 'WAF Large', tier: 'WAF', hourlyRate: 0.448, monthlyRate: 327.04, features: ['WAF', '4 capacity units'] },
            'Standard_v2': { name: 'Standard v2', tier: 'Standard_v2', hourlyRate: 0.246, monthlyRate: 179.58, features: ['Autoscaling', 'Zone redundant'] },
            'WAF_v2': { name: 'WAF v2', tier: 'WAF_v2', hourlyRate: 0.443, monthlyRate: 323.39, features: ['WAF', 'Autoscaling', 'Zone redundant'] },
        },
        defaultTier: 'Standard_v2'
    },

    // ==========================================
    // Load Balancer
    // ==========================================
    'azurerm_lb': {
        resourceType: 'azurerm_lb',
        pricingModel: 'hourly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', hourlyRate: 0, monthlyRate: 0, features: ['Free', 'No SLA'] },
            'Standard': { name: 'Standard', tier: 'Standard', hourlyRate: 0.025, monthlyRate: 18.25, features: ['SLA', 'Zone redundant'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // Firewall
    // ==========================================
    'azurerm_firewall': {
        resourceType: 'azurerm_firewall',
        pricingModel: 'hourly',
        tiers: {
            'Standard': { name: 'Standard', tier: 'Standard', hourlyRate: 1.25, monthlyRate: 912.50, features: ['Threat intelligence', 'NAT'] },
            'Premium': { name: 'Premium', tier: 'Premium', hourlyRate: 1.75, monthlyRate: 1277.50, features: ['TLS inspection', 'IDPS', 'URL filtering'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // Log Analytics
    // ==========================================
    'azurerm_log_analytics_workspace': {
        resourceType: 'azurerm_log_analytics_workspace',
        pricingModel: 'per-unit',
        tiers: {
            'Free': { name: 'Free', tier: 'Free', monthlyRate: 0, includedQuantity: 0.5, unit: 'GB/day', features: ['500 MB/day free'] },
            'PerGB2018': { name: 'Pay-As-You-Go', tier: 'PerGB2018', perUnitRate: 2.76, unit: 'GB', features: ['First 5 GB free'] },
            'CapacityReservation_100': { name: '100 GB/day', tier: 'CapacityReservation', monthlyRate: 228.00, features: ['100 GB/day commitment'] },
            'CapacityReservation_200': { name: '200 GB/day', tier: 'CapacityReservation', monthlyRate: 432.00, features: ['200 GB/day commitment'] },
            'CapacityReservation_500': { name: '500 GB/day', tier: 'CapacityReservation', monthlyRate: 1020.00, features: ['500 GB/day commitment'] },
        },
        defaultTier: 'PerGB2018'
    },

    // ==========================================
    // Application Insights
    // ==========================================
    'azurerm_application_insights': {
        resourceType: 'azurerm_application_insights',
        pricingModel: 'per-unit',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', perUnitRate: 2.30, unit: 'GB', features: ['First 5 GB free'] },
        },
        defaultTier: 'Basic'
    },

    // ==========================================
    // Virtual Network
    // ==========================================
    'azurerm_virtual_network': {
        resourceType: 'azurerm_virtual_network',
        pricingModel: 'monthly',
        tiers: {
            'Standard': { name: 'Standard', tier: 'Standard', monthlyRate: 0, features: ['Free'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // NAT Gateway
    // ==========================================
    'azurerm_nat_gateway': {
        resourceType: 'azurerm_nat_gateway',
        pricingModel: 'hourly',
        tiers: {
            'Standard': { name: 'Standard', tier: 'Standard', hourlyRate: 0.045, monthlyRate: 32.85, features: ['4 Gbps'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // Bastion
    // ==========================================
    'azurerm_bastion_host': {
        resourceType: 'azurerm_bastion_host',
        pricingModel: 'hourly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', hourlyRate: 0.19, monthlyRate: 138.70, features: ['2 instances'] },
            'Standard': { name: 'Standard', tier: 'Standard', hourlyRate: 0.19, monthlyRate: 138.70, features: ['Scalable instances'] },
        },
        defaultTier: 'Basic'
    },

    // ==========================================
    // Service Bus
    // ==========================================
    'azurerm_servicebus_namespace': {
        resourceType: 'azurerm_servicebus_namespace',
        pricingModel: 'monthly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', monthlyRate: 0.05, unit: 'million operations', features: ['Queues only'] },
            'Standard': { name: 'Standard', tier: 'Standard', monthlyRate: 9.81, features: ['Topics/Queues', '12.5M operations'] },
            'Premium_1': { name: 'Premium 1 MU', tier: 'Premium', monthlyRate: 668.74, features: ['1 Messaging Unit'] },
            'Premium_2': { name: 'Premium 2 MU', tier: 'Premium', monthlyRate: 1337.48, features: ['2 Messaging Units'] },
            'Premium_4': { name: 'Premium 4 MU', tier: 'Premium', monthlyRate: 2674.96, features: ['4 Messaging Units'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // Event Hub
    // ==========================================
    'azurerm_eventhub_namespace': {
        resourceType: 'azurerm_eventhub_namespace',
        pricingModel: 'monthly',
        tiers: {
            'Basic': { name: 'Basic', tier: 'Basic', monthlyRate: 11.16, features: ['1 consumer group', '100 connections'] },
            'Standard': { name: 'Standard', tier: 'Standard', monthlyRate: 21.92, features: ['20 consumer groups', '1000 connections'] },
            'Premium_1PU': { name: 'Premium 1 PU', tier: 'Premium', monthlyRate: 1092.86, features: ['1 Processing Unit'] },
            'Dedicated_1CU': { name: 'Dedicated 1 CU', tier: 'Dedicated', monthlyRate: 6667.32, features: ['1 Capacity Unit'] },
        },
        defaultTier: 'Standard'
    },

    // ==========================================
    // PostgreSQL
    // ==========================================
    'azurerm_postgresql_flexible_server': {
        resourceType: 'azurerm_postgresql_flexible_server',
        pricingModel: 'hourly',
        tiers: {
            'B_Standard_B1ms': { name: 'B1ms', tier: 'Burstable', hourlyRate: 0.0207, monthlyRate: 15.11, features: ['1 vCore', '2 GB RAM'] },
            'B_Standard_B2s': { name: 'B2s', tier: 'Burstable', hourlyRate: 0.0416, monthlyRate: 30.37, features: ['2 vCores', '4 GB RAM'] },
            'GP_Standard_D2s_v3': { name: 'D2s_v3', tier: 'GeneralPurpose', hourlyRate: 0.1250, monthlyRate: 91.25, features: ['2 vCores', '8 GB RAM'] },
            'GP_Standard_D4s_v3': { name: 'D4s_v3', tier: 'GeneralPurpose', hourlyRate: 0.2500, monthlyRate: 182.50, features: ['4 vCores', '16 GB RAM'] },
            'MO_Standard_E2s_v3': { name: 'E2s_v3', tier: 'MemoryOptimized', hourlyRate: 0.1740, monthlyRate: 127.02, features: ['2 vCores', '16 GB RAM'] },
        },
        defaultTier: 'B_Standard_B1ms'
    },
    'azurerm_postgresql_server': {
        resourceType: 'azurerm_postgresql_server',
        pricingModel: 'hourly',
        tiers: {
            'B_Gen5_1': { name: 'B_Gen5_1', tier: 'Basic', hourlyRate: 0.034, monthlyRate: 24.82, features: ['1 vCore', '2 GB RAM'] },
            'B_Gen5_2': { name: 'B_Gen5_2', tier: 'Basic', hourlyRate: 0.068, monthlyRate: 49.64, features: ['2 vCores', '4 GB RAM'] },
            'GP_Gen5_2': { name: 'GP_Gen5_2', tier: 'GeneralPurpose', hourlyRate: 0.193, monthlyRate: 140.89, features: ['2 vCores', '10 GB RAM'] },
            'GP_Gen5_4': { name: 'GP_Gen5_4', tier: 'GeneralPurpose', hourlyRate: 0.386, monthlyRate: 281.78, features: ['4 vCores', '20 GB RAM'] },
            'MO_Gen5_2': { name: 'MO_Gen5_2', tier: 'MemoryOptimized', hourlyRate: 0.241, monthlyRate: 175.93, features: ['2 vCores', '20 GB RAM'] },
        },
        defaultTier: 'B_Gen5_1'
    },

    // ==========================================
    // MySQL
    // ==========================================
    'azurerm_mysql_flexible_server': {
        resourceType: 'azurerm_mysql_flexible_server',
        pricingModel: 'hourly',
        tiers: {
            'B_Standard_B1s': { name: 'B1s', tier: 'Burstable', hourlyRate: 0.0124, monthlyRate: 9.05, features: ['1 vCore', '1 GB RAM'] },
            'B_Standard_B1ms': { name: 'B1ms', tier: 'Burstable', hourlyRate: 0.0207, monthlyRate: 15.11, features: ['1 vCore', '2 GB RAM'] },
            'GP_Standard_D2ds_v4': { name: 'D2ds_v4', tier: 'GeneralPurpose', hourlyRate: 0.1240, monthlyRate: 90.52, features: ['2 vCores', '8 GB RAM'] },
            'GP_Standard_D4ds_v4': { name: 'D4ds_v4', tier: 'GeneralPurpose', hourlyRate: 0.2480, monthlyRate: 181.04, features: ['4 vCores', '16 GB RAM'] },
        },
        defaultTier: 'B_Standard_B1ms'
    },
    'azurerm_mysql_server': {
        resourceType: 'azurerm_mysql_server',
        pricingModel: 'hourly',
        tiers: {
            'B_Gen5_1': { name: 'B_Gen5_1', tier: 'Basic', hourlyRate: 0.034, monthlyRate: 24.82, features: ['1 vCore', '2 GB RAM'] },
            'B_Gen5_2': { name: 'B_Gen5_2', tier: 'Basic', hourlyRate: 0.068, monthlyRate: 49.64, features: ['2 vCores', '4 GB RAM'] },
            'GP_Gen5_2': { name: 'GP_Gen5_2', tier: 'GeneralPurpose', hourlyRate: 0.193, monthlyRate: 140.89, features: ['2 vCores', '10 GB RAM'] },
            'GP_Gen5_4': { name: 'GP_Gen5_4', tier: 'GeneralPurpose', hourlyRate: 0.386, monthlyRate: 281.78, features: ['4 vCores', '20 GB RAM'] },
        },
        defaultTier: 'B_Gen5_1'
    },

    // ==========================================
    // Recovery Services Vault
    // ==========================================
    'azurerm_recovery_services_vault': {
        resourceType: 'azurerm_recovery_services_vault',
        pricingModel: 'per-unit',
        tiers: {
            'Standard': { name: 'Standard', tier: 'Standard', perUnitRate: 0, unit: 'instance', features: ['Free vault', 'Pay for protected instances'] },
        },
        defaultTier: 'Standard'
    },
};

/**
 * Get pricing for a resource type
 */
export function getPricingForType(resourceType: string): ResourcePricing | undefined {
    return AZURE_PRICING[resourceType];
}

/**
 * Get all resource types that have pricing data
 */
export function getResourceTypesWithPricing(): string[] {
    return Object.keys(AZURE_PRICING);
}

/**
 * Estimate monthly cost based on SKU
 */
export function estimateMonthlyCost(resourceType: string, sku: string): number | undefined {
    const pricing = AZURE_PRICING[resourceType];
    if (!pricing) return undefined;

    const tier = pricing.tiers[sku];
    if (!tier) {
        // Try to find default tier
        const defaultTier = pricing.tiers[pricing.defaultTier || ''];
        if (defaultTier) {
            return defaultTier.monthlyRate || (defaultTier.hourlyRate ? defaultTier.hourlyRate * 730 : undefined);
        }
        return undefined;
    }

    return tier.monthlyRate || (tier.hourlyRate ? tier.hourlyRate * 730 : undefined);
}

/**
 * Get SKU info from pricing tier
 */
export function getSKUInfo(resourceType: string, sku: string): PricingTier | undefined {
    const pricing = AZURE_PRICING[resourceType];
    if (!pricing) return undefined;

    return pricing.tiers[sku] || pricing.tiers[pricing.defaultTier || ''];
}
