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

    // Get environment variables
    const petSiteUrl = synthetics.getConfiguration().getEnvironmentVariable('PET_SITE_URL') || 
                      'http://petsite-1088770206.us-east-1.elb.amazonaws.com';
    const searchApiUrl = synthetics.getConfiguration().getEnvironmentVariable('SEARCH_API_URL') || 
                        'http://petsearch-live.us-east-1.elasticbeanstalk.com/api/search';
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\?$/, '');
    const baseSiteUrl = petSiteUrl.startsWith('http') ? petSiteUrl : `http://${petSiteUrl}`;
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : `http://${cleanSearchUrl}`;
    
    log.info('Starting API Health Check canary');
    log.info(`Pet Site URL: ${baseSiteUrl}`);
    log.info(`Search API URL: ${baseSearchUrl}`);

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

        const rootResponse = await synthetics.executeHttpStep('petSiteRoot', rootRequest);
        healthChecks.push({
            endpoint: 'Pet Site Root',
            status: rootResponse.statusCode,
            healthy: rootResponse.statusCode >= 200 && rootResponse.statusCode < 400
        });

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

        const searchResponse = await synthetics.executeHttpStep('searchAPI', searchRequest);
        healthChecks.push({
            endpoint: 'Search API',
            status: searchResponse.statusCode,
            healthy: searchResponse.statusCode >= 200 && searchResponse.statusCode < 400
        });

        // Health Check 3: Pet History endpoint
        log.info('Checking Pet History endpoint...');
        const historyRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/pethistory',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const historyResponse = await synthetics.executeHttpStep('petHistory', historyRequest);
        healthChecks.push({
            endpoint: 'Pet History',
            status: historyResponse.statusCode,
            healthy: historyResponse.statusCode >= 200 && historyResponse.statusCode < 400
        });

        // Health Check 4: Housekeeping endpoint
        log.info('Checking Housekeeping endpoint...');
        const housekeepingRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/housekeeping/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const housekeepingResponse = await synthetics.executeHttpStep('housekeeping', housekeepingRequest);
        healthChecks.push({
            endpoint: 'Housekeeping',
            status: housekeepingResponse.statusCode,
            healthy: housekeepingResponse.statusCode >= 200 && housekeepingResponse.statusCode < 400
        });

        // Health Check 5: Pet List Adoptions endpoint
        log.info('Checking Pet List Adoptions endpoint...');
        const adoptionsRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/PetListAdoptions',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const adoptionsResponse = await synthetics.executeHttpStep('petListAdoptions', adoptionsRequest);
        healthChecks.push({
            endpoint: 'Pet List Adoptions',
            status: adoptionsResponse.statusCode,
            healthy: adoptionsResponse.statusCode >= 200 && adoptionsResponse.statusCode < 400
        });

        // Analyze results
        const healthyEndpoints = healthChecks.filter(check => check.healthy).length;
        const totalEndpoints = healthChecks.length;
        const healthPercentage = (healthyEndpoints / totalEndpoints) * 100;

        log.info(`Health Check Summary: ${healthyEndpoints}/${totalEndpoints} endpoints healthy (${healthPercentage.toFixed(1)}%)`);

        // Log individual results
        healthChecks.forEach(check => {
            const status = check.healthy ? 'HEALTHY' : 'UNHEALTHY';
            log.info(`${check.endpoint}: ${status} (Status: ${check.status})`);
            
            // Add execution tags for each endpoint
            const tagName = check.endpoint.toLowerCase().replace(/\s+/g, '-');
            synthetics.addExecutionTag(`${tagName}-status`, check.status.toString());
            synthetics.addExecutionTag(`${tagName}-healthy`, check.healthy.toString());
        });

        // Add summary tags
        synthetics.addExecutionTag('healthy-endpoints', healthyEndpoints.toString());
        synthetics.addExecutionTag('total-endpoints', totalEndpoints.toString());
        synthetics.addExecutionTag('health-percentage', healthPercentage.toFixed(1));

        // Fail if less than 80% of endpoints are healthy
        if (healthPercentage < 80) {
            throw new Error(`Health check failed: Only ${healthPercentage.toFixed(1)}% of endpoints are healthy`);
        }

        log.info('API Health Check canary completed successfully');
        
    } catch (error) {
        log.error('API Health Check canary failed:', error.message);
        
        // Log any partial results
        if (healthChecks.length > 0) {
            log.info('Partial health check results:');
            healthChecks.forEach(check => {
                log.info(`${check.endpoint}: ${check.healthy ? 'HEALTHY' : 'UNHEALTHY'} (${check.status})`);
            });
        }
        
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('apiHealthCanary', apiHealthCanary);
};