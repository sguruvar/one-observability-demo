import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SyntheticCanariesProps extends StackProps {
  petSiteUrl?: string;
  searchApiUrl?: string;
  canarySchedule?: string;
  notificationEmail?: string;
  trafficDelayTime?: string;
}

export class SyntheticCanaries extends Stack {
  constructor(scope: Construct, id: string, props?: SyntheticCanariesProps) {
    super(scope, id, props);

    const stackName = id;

    // Get URLs from existing infrastructure via SSM parameters
    // These parameters should be set by the main Services stack
    const petSiteUrl = ssm.StringParameter.fromStringParameterAttributes(this, 'getPetSiteUrl', {
      parameterName: '/petstore/petsiteurl'
    }).stringValue;

    const searchApiUrl = ssm.StringParameter.fromStringParameterAttributes(this, 'getSearchApiUrl', {
      parameterName: '/petstore/searchapiurl'
    }).stringValue;

    // Get configuration from context or props for other settings
    const canarySchedule = props?.canarySchedule || this.node.tryGetContext('canary_schedule') || 'rate(5 minutes)';
    const notificationEmail = props?.notificationEmail || this.node.tryGetContext('notification_email') || '';
    const trafficDelayTime = props?.trafficDelayTime || this.node.tryGetContext('traffic_delay_time') || '1';

    // S3 Bucket for Canary Artifacts - region-agnostic naming
    const canaryArtifactsBucket = new s3.Bucket(this, 'CanaryArtifactsBucket', {
      bucketName: `${stackName.toLowerCase()}-canary-artifacts-${this.account}`,
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
      roleName: `${stackName}-canary-execution-role`,
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

    // Add CloudWatch permissions for metrics and logs
    canaryExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:PutMetricData',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        resources: ['*'],
      })
    );

    // SNS Topic for Notifications (only if email is provided)
    let canaryAlarmTopic: sns.Topic | undefined;
    if (notificationEmail) {
      canaryAlarmTopic = new sns.Topic(this, 'CanaryAlarmTopic', {
        topicName: `${stackName}-canary-alarms`,
      });

      canaryAlarmTopic.addSubscription(
        new subs.EmailSubscription(notificationEmail)
      );
    }

    // Continuous Traffic Generator Canary removed - replaced with other monitoring canaries

    // API Health Check Canary
    const apiHealthCanary = new synthetics.Canary(this, 'ApiHealthCanary', {
      canaryName: `${stackName.toLowerCase()}-api-health-canary`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const apiHealthCanary = async function () {
    const config = {
        includeRequestHeaders: true,
        includeResponseHeaders: true,
        restrictedHeaders: [],
        restrictedUrlParameters: []
    };

    const apiCanaryBlueprint = synthetics.getConfiguration();
    apiCanaryBlueprint.setConfig(config);

    // Get environment variables - no hardcoded fallbacks
    const petSiteUrl = process.env.PET_SITE_URL;
    const searchApiUrl = process.env.SEARCH_API_URL;
    
    // Validate required environment variables
    if (!petSiteUrl) {
        throw new Error('PET_SITE_URL environment variable is required');
    }
    if (!searchApiUrl) {
        throw new Error('SEARCH_API_URL environment variable is required');
    }
    
    log.info('Starting API Health Check canary');
    log.info(\`Pet Site URL: \${petSiteUrl}\`);
    log.info(\`Search API URL: \${searchApiUrl}\`);
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\\?$/, '');
    const baseSiteUrl = petSiteUrl.startsWith('http') ? petSiteUrl : \`http://\${petSiteUrl}\`;
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : \`http://\${cleanSearchUrl}\`;
    
    log.info('Starting API Health Check canary');
    log.info(\`Pet Site URL: \${baseSiteUrl}\`);
    log.info(\`Search API URL: \${baseSearchUrl}\`);

    const healthChecks = [];

    try {
        // Health Check 1: Pet Site Root
        log.info('Checking Pet Site root endpoint...');
        const siteUrlParts = new URL(baseSiteUrl);
        const rootRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        let rootResponse;
        try {
            rootResponse = await synthetics.executeHttpStep('petSiteRoot', rootRequest);
            healthChecks.push({
                endpoint: 'Pet Site Root',
                status: rootResponse.statusCode || 0,
                healthy: (rootResponse.statusCode || 0) >= 200 && (rootResponse.statusCode || 0) < 400
            });
        } catch (error) {
            log.error('Pet Site Root check failed:', error.message);
            healthChecks.push({
                endpoint: 'Pet Site Root',
                status: 0,
                healthy: false
            });
        }

        // Health Check 2: Search API
        log.info('Checking Search API endpoint...');
        const searchUrlParts = new URL(baseSearchUrl);
        const searchRequest = {
            hostname: searchUrlParts.hostname,
            method: 'GET',
            path: searchUrlParts.pathname,
            port: searchUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: searchUrlParts.protocol
        };

        let searchResponse;
        try {
            searchResponse = await synthetics.executeHttpStep('searchAPI', searchRequest);
            healthChecks.push({
                endpoint: 'Search API',
                status: searchResponse.statusCode || 0,
                healthy: (searchResponse.statusCode || 0) >= 200 && (searchResponse.statusCode || 0) < 400
            });
        } catch (error) {
            log.error('Search API check failed:', error.message);
            healthChecks.push({
                endpoint: 'Search API',
                status: 0,
                healthy: false
            });
        }

        // Health Check 3: Pet History endpoint
        log.info('Checking Pet History endpoint...');
        const historyRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/pethistory',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        let historyResponse;
        try {
            historyResponse = await synthetics.executeHttpStep('petHistory', historyRequest);
            healthChecks.push({
                endpoint: 'Pet History',
                status: historyResponse.statusCode || 0,
                healthy: (historyResponse.statusCode || 0) >= 200 && (historyResponse.statusCode || 0) < 400
            });
        } catch (error) {
            log.error('Pet History check failed:', error.message);
            healthChecks.push({
                endpoint: 'Pet History',
                status: 0,
                healthy: false
            });
        }

        // Health Check 4: Housekeeping endpoint
        log.info('Checking Housekeeping endpoint...');
        const housekeepingRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/housekeeping/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        let housekeepingResponse;
        try {
            housekeepingResponse = await synthetics.executeHttpStep('housekeeping', housekeepingRequest);
            healthChecks.push({
                endpoint: 'Housekeeping',
                status: housekeepingResponse.statusCode || 0,
                healthy: (housekeepingResponse.statusCode || 0) >= 200 && (housekeepingResponse.statusCode || 0) < 400
            });
        } catch (error) {
            log.error('Housekeeping check failed:', error.message);
            healthChecks.push({
                endpoint: 'Housekeeping',
                status: 0,
                healthy: false
            });
        }

        // Health Check 5: Pet List Adoptions endpoint
        log.info('Checking Pet List Adoptions endpoint...');
        const adoptionsRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/PetListAdoptions',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        let adoptionsResponse;
        try {
            adoptionsResponse = await synthetics.executeHttpStep('petListAdoptions', adoptionsRequest);
            healthChecks.push({
                endpoint: 'Pet List Adoptions',
                status: adoptionsResponse.statusCode || 0,
                healthy: (adoptionsResponse.statusCode || 0) >= 200 && (adoptionsResponse.statusCode || 0) < 400
            });
        } catch (error) {
            log.error('Pet List Adoptions check failed:', error.message);
            healthChecks.push({
                endpoint: 'Pet List Adoptions',
                status: 0,
                healthy: false
            });
        }

        // Analyze results
        const healthyEndpoints = healthChecks.filter(check => check.healthy).length;
        const totalEndpoints = healthChecks.length;
        const healthPercentage = (healthyEndpoints / totalEndpoints) * 100;

        log.info(\`Health Check Summary: \${healthyEndpoints}/\${totalEndpoints} endpoints healthy (\${healthPercentage.toFixed(1)}%)\`);

        // Log individual results
        healthChecks.forEach(check => {
            const status = check.healthy ? 'HEALTHY' : 'UNHEALTHY';
            log.info(\`\${check.endpoint}: \${status} (Status: \${check.status})\`);
        });

        // Add summary information to logs
        log.info(\`Total endpoints: \${totalEndpoints}\`);
        log.info(\`Healthy endpoints: \${healthyEndpoints}\`);
        log.info(\`Health percentage: \${healthPercentage.toFixed(1)}%\`);

        // Fail if less than 80% of endpoints are healthy
        if (healthPercentage < 80) {
            throw new Error(\`Health check failed: Only \${healthPercentage.toFixed(1)}% of endpoints are healthy\`);
        }

        log.info('API Health Check canary completed successfully');
        
    } catch (error) {
        log.error('API Health Check canary failed:', error.message);
        
        // Log any partial results
        if (healthChecks.length > 0) {
            log.info('Partial health check results:');
            healthChecks.forEach(check => {
                log.info(\`\${check.endpoint}: \${check.healthy ? 'HEALTHY' : 'UNHEALTHY'} (\${check.status})\`);
            });
        }
        
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('apiHealthCanary', apiHealthCanary);
};
        `),
        handler: 'index.handler',
      }),
      artifactsBucketLocation: {
        bucket: canaryArtifactsBucket,
        prefix: 'api-health-canary',
      },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.expression('rate(2 minutes)'), // More frequent health checks
      environmentVariables: {
        PET_SITE_URL: petSiteUrl,
        SEARCH_API_URL: searchApiUrl,
      },
      timeToLive: Duration.minutes(5), // Shorter execution time for health checks
      failureRetentionPeriod: Duration.days(30),
      successRetentionPeriod: Duration.days(30),
    });

    // Pet Adoption Workflow Canary
    const petAdoptionWorkflowCanary = new synthetics.Canary(this, 'PetAdoptionWorkflowCanary', {
      canaryName: `${stackName.toLowerCase()}-pet-adoption-workflow-canary`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const petAdoptionWorkflowCanary = async function () {
    const config = {
        includeRequestHeaders: true,
        includeResponseHeaders: true,
        restrictedHeaders: [],
        restrictedUrlParameters: []
    };

    const apiCanaryBlueprint = synthetics.getConfiguration();
    apiCanaryBlueprint.setConfig(config);

    // Get environment variables - no hardcoded fallbacks
    const petSiteUrl = process.env.PET_SITE_URL;
    const searchApiUrl = process.env.SEARCH_API_URL;
    
    // Validate required environment variables
    if (!petSiteUrl) {
        throw new Error('PET_SITE_URL environment variable is required');
    }
    if (!searchApiUrl) {
        throw new Error('SEARCH_API_URL environment variable is required');
    }
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\\?$/, '');
    const baseSiteUrl = petSiteUrl.startsWith('http') ? petSiteUrl : \`http://\${petSiteUrl}\`;
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : \`http://\${cleanSearchUrl}\`;
    
    log.info('Starting Pet Adoption Workflow canary');
    log.info(\`Pet Site URL: \${baseSiteUrl}\`);
    log.info(\`Search API URL: \${baseSearchUrl}\`);

    try {
        // Step 1: Housekeeping
        log.info('Performing housekeeping...');
        const siteUrlParts = new URL(baseSiteUrl);
        const housekeepingRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/housekeeping/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        await synthetics.executeHttpStep('housekeeping', housekeepingRequest);

        // Step 2: Load Pet Data
        log.info('Loading pet data...');
        const searchUrlParts = new URL(baseSearchUrl);
        const loadPetsRequest = {
            hostname: searchUrlParts.hostname,
            method: 'GET',
            path: searchUrlParts.pathname,
            port: searchUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: searchUrlParts.protocol
        };

        const petsResponse = await synthetics.executeHttpStep('loadPetData', loadPetsRequest);
        
        if (petsResponse.statusCode !== 200) {
            throw new Error(\`Pet data load failed with status: \${petsResponse.statusCode}\`);
        }

        const allPets = JSON.parse(petsResponse.responseBody);
        log.info(\`Loaded \${allPets.length} pets from database\`);

        if (allPets.length === 0) {
            throw new Error('No pets available for adoption workflow');
        }

        // Select a random pet for the workflow
        const randomIndex = Math.floor(Math.random() * allPets.length);
        const currentPet = allPets[randomIndex];

        log.info(\`Testing adoption workflow for: \${currentPet.pettype} \${currentPet.petcolor} (\${currentPet.petid})\`);

        // Step 3: Search for the pet
        const searchUrl = \`/?selectedPetType=\${encodeURIComponent(currentPet.pettype)}&selectedPetColor=\${encodeURIComponent(currentPet.petcolor)}\`;
        log.info(\`Searching for pet: \${searchUrl}\`);
        
        const searchRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: searchUrl,
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        await synthetics.executeHttpStep('searchPet', searchRequest);

        // Step 4: Take Me Home (Adoption)
        const adoptionData = \`pettype=\${encodeURIComponent(currentPet.pettype)}&petcolor=\${encodeURIComponent(currentPet.petcolor)}&petid=\${encodeURIComponent(currentPet.petid)}\`;
        
        const adoptionRequest = {
            hostname: siteUrlParts.hostname,
            method: 'POST',
            path: '/Adoption/TakeMeHome',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(adoptionData)
            },
            postData: adoptionData
        };

        await synthetics.executeHttpStep('adoptPet', adoptionRequest);

        // Step 5: Make Payment
        const paymentData = \`pettype=\${encodeURIComponent(currentPet.pettype)}&petid=\${encodeURIComponent(currentPet.petid)}\`;
        
        const paymentRequest = {
            hostname: siteUrlParts.hostname,
            method: 'POST',
            path: '/Payment/MakePayment',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(paymentData)
            },
            postData: paymentData
        };

        await synthetics.executeHttpStep('makePayment', paymentRequest);

        // Step 6: Verify adoption in list
        const listAdoptionsRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/PetListAdoptions',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        await synthetics.executeHttpStep('listAdoptions', listAdoptionsRequest);

        log.info('Pet Adoption Workflow canary completed successfully');
        
        // Add execution tags
        synthetics.addExecutionTag('pet-type', currentPet.pettype);
        synthetics.addExecutionTag('pet-color', currentPet.petcolor);
        synthetics.addExecutionTag('pet-id', currentPet.petid);
        synthetics.addExecutionTag('workflow-status', 'success');
        
    } catch (error) {
        log.error('Pet Adoption Workflow canary failed:', error.message);
        synthetics.addExecutionTag('workflow-status', 'failed');
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('petAdoptionWorkflowCanary', petAdoptionWorkflowCanary);
};
        `),
        handler: 'index.handler',
      }),
      artifactsBucketLocation: {
        bucket: canaryArtifactsBucket,
        prefix: 'pet-adoption-workflow-canary',
      },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.expression('rate(10 minutes)'), // Moderate frequency for workflow testing
      environmentVariables: {
        PET_SITE_URL: petSiteUrl,
        SEARCH_API_URL: searchApiUrl,
      },
      timeToLive: Duration.minutes(10), // Moderate execution time
      failureRetentionPeriod: Duration.days(30),
      successRetentionPeriod: Duration.days(30),
    });

    // Pet Search Canary
    const petSearchCanary = new synthetics.Canary(this, 'PetSearchCanary', {
      canaryName: `${stackName.toLowerCase()}-pet-search-canary`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_6_2,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline(`
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const petSearchCanary = async function () {
    const config = {
        includeRequestHeaders: true,
        includeResponseHeaders: true,
        restrictedHeaders: [],
        restrictedUrlParameters: []
    };

    const apiCanaryBlueprint = synthetics.getConfiguration();
    apiCanaryBlueprint.setConfig(config);

    // Get environment variables - no hardcoded fallbacks
    const searchApiUrl = process.env.SEARCH_API_URL;
    
    // Validate required environment variables
    if (!searchApiUrl) {
        throw new Error('SEARCH_API_URL environment variable is required');
    }
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\\?$/, '');
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : \`http://\${cleanSearchUrl}\`;
    
    log.info('Starting Pet Search canary');
    log.info(\`Search API URL: \${baseSearchUrl}\`);

    try {
        // Test 1: Load all pets data
        log.info('Testing pet data retrieval...');
        const urlParts = new URL(baseSearchUrl);
        const loadPetsRequest = {
            hostname: urlParts.hostname,
            method: 'GET',
            path: urlParts.pathname,
            port: urlParts.protocol === 'https:' ? 443 : 80,
            protocol: urlParts.protocol
        };

        const petsResponse = await synthetics.executeHttpStep('loadPets', loadPetsRequest);
        
        if (petsResponse.statusCode !== 200) {
            throw new Error(\`Pet data retrieval failed with status: \${petsResponse.statusCode}\`);
        }

        let allPets;
        try {
            allPets = JSON.parse(petsResponse.responseBody);
        } catch (e) {
            throw new Error(\`Failed to parse pet data: \${e.message}\`);
        }

        if (!Array.isArray(allPets)) {
            throw new Error('Pet data is not an array');
        }

        log.info(\`Successfully loaded \${allPets.length} pets from search API\`);

        // Test 2: Validate pet data structure
        log.info('Validating pet data structure...');
        if (allPets.length > 0) {
            const samplePet = allPets[0];
            const requiredFields = ['pettype', 'petid', 'petcolor', 'availability'];
            
            for (const field of requiredFields) {
                if (!(field in samplePet)) {
                    throw new Error(\`Missing required field: \${field}\`);
                }
            }
            
            log.info('Pet data structure validation passed');
        } else {
            log.warning('No pets available for structure validation');
        }

        // Test 3: Test search functionality with sample data
        if (allPets.length > 0) {
            log.info('Testing search functionality...');
            const samplePet = allPets[0];
            
            // Test search by pet type
            const searchByTypeRequest = {
                hostname: urlParts.hostname,
                method: 'GET',
                path: \`\${urlParts.pathname}?type=\${encodeURIComponent(samplePet.pettype)}\`,
                port: urlParts.protocol === 'https:' ? 443 : 80,
                protocol: urlParts.protocol
            };

            const searchResponse = await synthetics.executeHttpStep('searchByType', searchByTypeRequest);
            
            if (searchResponse.statusCode !== 200) {
                log.warning(\`Search by type returned status: \${searchResponse.statusCode}\`);
            } else {
                log.info('Search by type functionality working');
            }
        }

        log.info('Pet Search canary completed successfully');
        
        // Add execution tags
        synthetics.addExecutionTag('pets-loaded', allPets.length.toString());
        synthetics.addExecutionTag('search-status', 'success');
        
    } catch (error) {
        log.error('Pet Search canary failed:', error.message);
        synthetics.addExecutionTag('search-status', 'failed');
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('petSearchCanary', petSearchCanary);
};
        `),
        handler: 'index.handler',
      }),
      artifactsBucketLocation: {
        bucket: canaryArtifactsBucket,
        prefix: 'pet-search-canary',
      },
      role: canaryExecutionRole,
      schedule: synthetics.Schedule.expression('rate(3 minutes)'), // Frequent search testing
      environmentVariables: {
        SEARCH_API_URL: searchApiUrl,
      },
      timeToLive: Duration.minutes(3), // Quick execution for search tests
      failureRetentionPeriod: Duration.days(30),
      successRetentionPeriod: Duration.days(30),
    });

    // CloudWatch Alarms (only if SNS topic exists)
    if (canaryAlarmTopic) {
      // Continuous Traffic Canary Alarm
      // new cloudwatch.Alarm(this, 'ContinuousTrafficCanaryAlarm', {
      //   alarmName: `${stackName}-continuous-traffic-canary-failures`,
      //   alarmDescription: 'Continuous Traffic Canary failure alarm',
      //   metric: continuousTrafficCanary.metricFailed({
      //     period: Duration.minutes(5),
      //     statistic: 'Sum',
      //   }),
      //   threshold: 1,
      //   evaluationPeriods: 2,
      //   treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      // }).addAlarmAction({
      //   bind: () => ({ alarmActionArn: canaryAlarmTopic!.topicArn }),
      // });

      // API Health Canary Alarm
      new cloudwatch.Alarm(this, 'ApiHealthCanaryAlarm', {
        alarmName: `${stackName}-api-health-canary-failures`,
        alarmDescription: 'API Health Canary failure alarm',
        metric: apiHealthCanary.metricFailed({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1, // Immediate alert for health check failures
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction({
        bind: () => ({ alarmActionArn: canaryAlarmTopic!.topicArn }),
      });

      // Pet Adoption Workflow Canary Alarm
      new cloudwatch.Alarm(this, 'PetAdoptionWorkflowCanaryAlarm', {
        alarmName: `${stackName}-pet-adoption-workflow-canary-failures`,
        alarmDescription: 'Pet Adoption Workflow Canary failure alarm',
        metric: petAdoptionWorkflowCanary.metricFailed({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 2,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction({
        bind: () => ({ alarmActionArn: canaryAlarmTopic!.topicArn }),
      });

      // Pet Search Canary Alarm
      new cloudwatch.Alarm(this, 'PetSearchCanaryAlarm', {
        alarmName: `${stackName}-pet-search-canary-failures`,
        alarmDescription: 'Pet Search Canary failure alarm',
        metric: petSearchCanary.metricFailed({
          period: Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1, // Immediate alert for search failures
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction({
        bind: () => ({ alarmActionArn: canaryAlarmTopic!.topicArn }),
      });
    }

    // Store canary information in SSM for reference
    this.createSsmParameters(new Map(Object.entries({
      '/petstore/canaries/continuous-traffic-canary-name': 'Continuous Traffic Canary (Removed)',
      '/petstore/canaries/api-health-canary-name': apiHealthCanary.canaryName,
      '/petstore/canaries/pet-adoption-workflow-canary-name': petAdoptionWorkflowCanary.canaryName,
      '/petstore/canaries/pet-search-canary-name': petSearchCanary.canaryName,
      '/petstore/canaries/artifacts-bucket': canaryArtifactsBucket.bucketName,
      '/petstore/canaries/traffic-delay-time': trafficDelayTime,
    })));

    // Outputs
    this.createOutputs(new Map(Object.entries({
      'ArtifactsBucketName': canaryArtifactsBucket.bucketName,
      'ContinuousTrafficCanaryName': 'Continuous Traffic Canary (Removed)',
      'ApiHealthCanaryName': apiHealthCanary.canaryName,
      'PetAdoptionWorkflowCanaryName': petAdoptionWorkflowCanary.canaryName,
      'PetSearchCanaryName': petSearchCanary.canaryName,
      'TrafficDelayTime': trafficDelayTime,
      'SnsTopicArn': canaryAlarmTopic?.topicArn || 'Not created - no email provided',
    })));
  }

  private createSsmParameters(params: Map<string, string>) {
    params.forEach((value, key) => {
      const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '');
      new ssm.StringParameter(this, `Param${cleanKey}`, {
        parameterName: key,
        stringValue: value,
      });
    });
  }

  private createOutputs(params: Map<string, string>) {
    params.forEach((value, key) => {
      new CfnOutput(this, `Output${key}`, { value: value });
    });
  }
}