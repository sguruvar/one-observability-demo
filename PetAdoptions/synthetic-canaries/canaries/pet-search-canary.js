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

    // Get environment variables
    const searchApiUrl = synthetics.getConfiguration().getEnvironmentVariable('SEARCH_API_URL') || 
                        'http://petsearch-live.us-east-1.elasticbeanstalk.com/api/search';
    
    // Clean up URL - remove trailing ? if present
    const cleanUrl = searchApiUrl.replace(/\?$/, '');
    const baseUrl = cleanUrl.startsWith('http') ? cleanUrl : `http://${cleanUrl}`;
    
    log.info('Starting Pet Search API canary');
    log.info(`Search API URL: ${baseUrl}`);

    try {
        // Test 1: Load all pets data
        log.info('Testing pet data retrieval...');
        const urlParts = new URL(baseUrl);
        const loadPetsRequest = {
            hostname: urlParts.hostname,
            method: 'GET',
            path: urlParts.pathname,
            port: urlParts.protocol === 'https:' ? 443 : 80,
            protocol: urlParts.protocol
        };

        const petsResponse = await synthetics.executeHttpStep('loadPets', loadPetsRequest);
        
        if (petsResponse.statusCode !== 200) {
            throw new Error(`Pet data load failed with status: ${petsResponse.statusCode}`);
        }

        const petsData = JSON.parse(petsResponse.responseBody);
        log.info(`Successfully loaded ${petsData.length} pets`);

        // Validate response structure
        if (!Array.isArray(petsData) || petsData.length === 0) {
            throw new Error('Invalid pets data structure or empty response');
        }

        // Test sample pet data structure
        const samplePet = petsData[0];
        const requiredFields = ['pettype', 'petid', 'petcolor', 'availability'];
        
        for (const field of requiredFields) {
            if (!samplePet.hasOwnProperty(field)) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Record custom metrics
        await synthetics.addUserAgentHeader();
        synthetics.addExecutionTag('test-type', 'pet-search');
        synthetics.addExecutionTag('pets-count', petsData.length.toString());

        // Test different pet types if available
        const petTypes = [...new Set(petsData.map(pet => pet.pettype))];
        log.info(`Available pet types: ${petTypes.join(', ')}`);

        for (const petType of petTypes.slice(0, 3)) { // Test first 3 types
            const petsOfType = petsData.filter(pet => pet.pettype === petType);
            log.info(`Found ${petsOfType.length} pets of type: ${petType}`);
            
            synthetics.addExecutionTag(`${petType}-count`, petsOfType.length.toString());
        }

        log.info('Pet Search API canary completed successfully');
        
    } catch (error) {
        log.error('Pet Search API canary failed:', error.message);
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('petSearchCanary', petSearchCanary);
};