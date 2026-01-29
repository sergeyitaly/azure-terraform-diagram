// src/types/devops.ts

/**
 * Terraform infrastructure information extracted from HCL files
 */
export interface TerraformInfraInfo {
    terraformVersion?: string;
    requiredVersion?: string;
    providers: ProviderInfo[];
    backend?: BackendInfo;
    modules: ModuleInfo[];
    variables: VariableInfo[];
    outputs: OutputInfo[];
    workspaces?: string[];
}

export interface ProviderInfo {
    name: string;
    source?: string;
    version?: string;
    versionConstraint?: string;
    alias?: string;
    configuration?: Record<string, any>;
}

export interface BackendInfo {
    type: string; // 'azurerm', 's3', 'gcs', 'remote', 'local', etc.
    configuration: Record<string, any>;
    // Azure-specific
    resourceGroupName?: string;
    storageAccountName?: string;
    containerName?: string;
    key?: string;
    // AWS-specific
    bucket?: string;
    region?: string;
    // Remote (Terraform Cloud)
    organization?: string;
    workspaceName?: string;
}

export interface ModuleInfo {
    name: string;
    source: string;
    version?: string;
    sourceType: 'registry' | 'git' | 'local' | 'github' | 'bitbucket' | 's3' | 'gcs' | 'unknown';
    inputs: Record<string, any>;
    file: string;
    line?: number;
}

export interface VariableInfo {
    name: string;
    type?: string;
    default?: any;
    description?: string;
    sensitive?: boolean;
    validation?: string;
    nullable?: boolean;
    file: string;
    line?: number;
}

export interface OutputInfo {
    name: string;
    value?: string;
    description?: string;
    sensitive?: boolean;
    dependsOn?: string[];
    file: string;
    line?: number;
}

/**
 * Pipeline information for DevOps integration
 */
export interface PipelineInfo {
    pipelineType: 'azure-devops' | 'github-actions' | 'gitlab-ci' | 'jenkins' | 'unknown';
    pipelineName?: string;
    pipelineUrl?: string;
    stages?: PipelineStage[];
    lastRunStatus?: 'success' | 'failed' | 'running' | 'pending' | 'cancelled';
    lastRunDate?: Date;
}

export interface PipelineStage {
    name: string;
    status: 'success' | 'failed' | 'running' | 'pending' | 'skipped';
    duration?: number; // in seconds
}

/**
 * Environment comparison for multi-environment deployments
 */
export interface EnvironmentComparison {
    environments: EnvironmentInfo[];
    differences: ResourceDifference[];
    commonResources: string[];
}

export interface EnvironmentInfo {
    name: string; // e.g., 'dev', 'staging', 'prod'
    path: string; // folder path
    resourceCount: number;
    resources: string[];
    tags?: Record<string, string>;
}

export interface ResourceDifference {
    resourceId: string;
    resourceType: string;
    resourceName: string;
    differenceType: 'missing' | 'added' | 'modified' | 'config-diff';
    environments: {
        [envName: string]: ResourceEnvironmentState;
    };
    details?: string;
}

export interface ResourceEnvironmentState {
    exists: boolean;
    sku?: string;
    tier?: string;
    config?: Record<string, any>;
}

/**
 * Terraform state diff for drift detection
 */
export interface StateDiff {
    hasChanges: boolean;
    additions: StateChange[];
    deletions: StateChange[];
    modifications: StateChange[];
    driftDetected: boolean;
    lastStateCheck?: Date;
}

export interface StateChange {
    resourceType: string;
    resourceName: string;
    resourceId: string;
    changeType: 'add' | 'delete' | 'modify';
    attributes?: {
        attribute: string;
        oldValue?: any;
        newValue?: any;
    }[];
}

/**
 * Module dependency information
 */
export interface ModuleDependency {
    moduleName: string;
    modulePath: string;
    source: string;
    version?: string;
    outputs: ModuleOutput[];
    inputs: ModuleInput[];
    dependencies: string[];
}

export interface ModuleOutput {
    name: string;
    value?: string;
    description?: string;
    sensitive?: boolean;
    consumedBy?: string[]; // resource IDs that consume this output
}

export interface ModuleInput {
    name: string;
    type?: string;
    default?: any;
    required: boolean;
    description?: string;
    source?: string; // where the value comes from
}

/**
 * Deployment slot information for App Services
 */
export interface DeploymentSlot {
    name: string;
    status: 'running' | 'stopped' | 'swapping';
    trafficPercentage: number;
    isProduction: boolean;
    appServiceId: string;
    configurationDifferences?: string[];
}

/**
 * Container registry to AKS relationship
 */
export interface ContainerRegistryLink {
    registryId: string;
    registryName: string;
    clusterId: string;
    clusterName: string;
    attachedImages?: string[];
    pullSecretConfigured: boolean;
    adminEnabled: boolean;
}

/**
 * Data flow information for showing data relationships
 */
export interface DataFlow {
    sourceId: string;
    targetId: string;
    flowType: 'data' | 'control' | 'event' | 'dependency';
    direction: 'unidirectional' | 'bidirectional';
    protocol?: string;
    label?: string;
    dataType?: string; // e.g., 'logs', 'metrics', 'blob', 'queue', 'sql'
}

/**
 * Cross-module reference
 */
export interface CrossModuleReference {
    sourceModule: string;
    targetModule: string;
    referenceType: 'output' | 'variable' | 'resource';
    referenceName: string;
    value?: string;
}
