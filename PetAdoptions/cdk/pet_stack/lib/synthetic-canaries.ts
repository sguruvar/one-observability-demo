import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface SyntheticCanariesProps extends StackProps {
  canarySchedule?: string;
}

export class SyntheticCanaries extends Stack {
  constructor(scope: Construct, id: string, props?: SyntheticCanariesProps) {
    super(scope, id, props);

    const stackName = id;
    const canarySchedule = props?.canarySchedule || 'rate(1 minute)';

    // S3 Bucket for Canary Artifacts
    const canaryArtifactsBucket = new s3.Bucket(this, 'CanaryArtifactsBucket', {
      bucketName: `${stackName.toLowerCase()}-canary-artifacts-${this.account}-${this.region}`,
      publicReadAccess: false,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: Duration.days(30),
        },
      ],
    });

    // IAM Role for Canaries
    const canaryExecutionRole = new iam.Role(this, 'CanaryExecutionRole', {
      roleName: `${stackName}-canary-execution-role-${this.region}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchSyntheticsFullAccess'),
      ],
    });

    // Add S3 permissions for canary artifacts
    canaryExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [`${canaryArtifactsBucket.bucketArn}/*`],
      })
    );

    canaryExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [canaryArtifactsBucket.bucketArn],
      })
    );

    // Get URLs from SSM parameters (these should be us-west-1 URLs for cross-region testing)
    const petSiteUrl = ssm.StringParameter.fromStringParameterAttributes(this, 'getPetSiteUrl', {
      parameterName: '/petstore/petsiteurl'
    }).stringValue;

    const searchApiUrl = ssm.StringParameter.fromStringParameterAttributes(this, 'getSearchApiUrl', {
      parameterName: '/petstore/searchapiurl'
    }).stringValue;

    // 1. API Health Check Canary - Tests basic connectivity to both endpoints
    const apiHealthCanary = new synthetics.Canary(this, 'ApiHealthCanary', {
      canaryName: `${stackName.toLowerCase()}-api-health-canary-${this.region}`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_9_1,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset('./canary-code'),
        handler: 'api-health-canary.handler'
      }),
      artifactsBucketLocation: { bucket: canaryArtifactsBucket },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.rate(Duration.minutes(1)),
      timeout: Duration.minutes(1),
      successRetentionPeriod: Duration.days(31),
      failureRetentionPeriod: Duration.days(31),
      environmentVariables: {
        PET_SITE_URL: petSiteUrl,
        SEARCH_API_URL: searchApiUrl
      }
    });

    // 2. Pet Adoption Workflow Canary - Tests the complete adoption flow
    const petAdoptionWorkflowCanary = new synthetics.Canary(this, 'PetAdoptionWorkflowCanary', {
      canaryName: `${stackName.toLowerCase()}-pet-adoption-workflow-canary-${this.region}`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_9_1,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset('./canary-code'),
        handler: 'pet-adoption-workflow-canary.handler'
      }),
      artifactsBucketLocation: { bucket: canaryArtifactsBucket },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.rate(Duration.minutes(1)),
      timeout: Duration.minutes(1),
      successRetentionPeriod: Duration.days(31),
      failureRetentionPeriod: Duration.days(31),
      environmentVariables: {
        PET_SITE_URL: petSiteUrl,
        SEARCH_API_URL: searchApiUrl
      }
    });

    // 3. Pet Search Canary - Tests the search functionality
    const petSearchCanary = new synthetics.Canary(this, 'PetSearchCanary', {
      canaryName: `${stackName.toLowerCase()}-pet-search-canary-${this.region}`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_9_1,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset('./canary-code'),
        handler: 'pet-search-canary.handler'
      }),
      artifactsBucketLocation: { bucket: canaryArtifactsBucket },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.rate(Duration.minutes(1)),
      timeout: Duration.minutes(1),
      successRetentionPeriod: Duration.days(31),
      failureRetentionPeriod: Duration.days(31),
      environmentVariables: {
        PET_SITE_URL: petSiteUrl,
        SEARCH_API_URL: searchApiUrl
      }
    });

    // Outputs
    new CfnOutput(this, 'ApiHealthCanaryName', {
      value: apiHealthCanary.canaryName,
      description: 'Name of the API Health Check canary'
    });

    new CfnOutput(this, 'PetAdoptionWorkflowCanaryName', {
      value: petAdoptionWorkflowCanary.canaryName,
      description: 'Name of the Pet Adoption Workflow canary'
    });

    new CfnOutput(this, 'PetSearchCanaryName', {
      value: petSearchCanary.canaryName,
      description: 'Name of the Pet Search canary'
    });

    new CfnOutput(this, 'ArtifactsBucketName', {
      value: canaryArtifactsBucket.bucketName,
      description: 'Name of the S3 bucket for canary artifacts'
    });

    new CfnOutput(this, 'PetSiteUrl', {
      value: petSiteUrl,
      description: 'PetSite URL being tested (should be us-west-1)'
    });

    new CfnOutput(this, 'SearchApiUrl', {
      value: searchApiUrl,
      description: 'Search API URL being tested (should be us-west-1)'
    });
  }
}