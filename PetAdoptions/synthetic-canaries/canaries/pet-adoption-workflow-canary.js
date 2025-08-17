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

    // Get environment variables
    const petSiteUrl = synthetics.getConfiguration().getEnvironmentVariable('PET_SITE_URL') || 
                      'http://petsite-1088770206.us-east-1.elb.amazonaws.com';
    const searchApiUrl = synthetics.getConfiguration().getEnvironmentVariable('SEARCH_API_URL') || 
                        'http://petsearch-live.us-east-1.elasticbeanstalk.com/api/search';
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\?$/, '');
    const baseSiteUrl = petSiteUrl.startsWith('http') ? petSiteUrl : `http://${petSiteUrl}`;
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : `http://${cleanSearchUrl}`;
    
    log.info('Starting Pet Adoption Workflow canary');
    log.info(`Pet Site URL: ${baseSiteUrl}`);
    log.info(`Search API URL: ${baseSearchUrl}`);

    try {
        // Step 1: Housekeeping
        log.info('Step 1: Performing housekeeping...');
        const siteUrlParts = new URL(baseSiteUrl);
        const housekeepingRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/housekeeping/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const housekeepingResponse = await synthetics.executeHttpStep('housekeeping', housekeepingRequest);
        log.info(`Housekeeping completed with status: ${housekeepingResponse.statusCode}`);

        // Step 2: Load Pet Data
        log.info('Step 2: Loading pet data...');
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
            throw new Error(`Pet data load failed with status: ${petsResponse.statusCode}`);
        }

        const allPets = JSON.parse(petsResponse.responseBody);
        log.info(`Loaded ${allPets.length} pets for adoption workflow`);

        if (allPets.length === 0) {
            throw new Error('No pets available for adoption workflow test');
        }

        // Select a random pet for adoption
        const randomIndex = Math.floor(Math.random() * allPets.length);
        const selectedPet = allPets[randomIndex];
        
        log.info(`Selected pet for adoption: ${selectedPet.pettype} - ${selectedPet.petcolor} (ID: ${selectedPet.petid})`);

        // Step 3: Search for the selected pet
        log.info('Step 3: Searching for selected pet...');
        const searchRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: `/?selectedPetType=${encodeURIComponent(selectedPet.pettype)}&selectedPetColor=${encodeURIComponent(selectedPet.petcolor)}`,
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const searchResponse = await synthetics.executeHttpStep('searchPet', searchRequest);
        log.info(`Pet search completed with status: ${searchResponse.statusCode}`);

        // Step 4: Take Me Home (Adoption)
        log.info('Step 4: Initiating adoption...');
        const adoptionData = `pettype=${encodeURIComponent(selectedPet.pettype)}&petcolor=${encodeURIComponent(selectedPet.petcolor)}&petid=${encodeURIComponent(selectedPet.petid)}`;
        
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

        const adoptionResponse = await synthetics.executeHttpStep('adoptPet', adoptionRequest);
        log.info(`Pet adoption completed with status: ${adoptionResponse.statusCode}`);

        // Step 5: Make Payment
        log.info('Step 5: Processing payment...');
        const paymentData = `pettype=${encodeURIComponent(selectedPet.pettype)}&petid=${encodeURIComponent(selectedPet.petid)}`;
        
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

        const paymentResponse = await synthetics.executeHttpStep('makePayment', paymentRequest);
        log.info(`Payment completed with status: ${paymentResponse.statusCode}`);

        // Step 6: List Adopted Pets
        log.info('Step 6: Listing adopted pets...');
        const listAdoptionsRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/PetListAdoptions',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        const listResponse = await synthetics.executeHttpStep('listAdoptions', listAdoptionsRequest);
        log.info(`Adoption list retrieved with status: ${listResponse.statusCode}`);

        // Add execution tags for monitoring
        synthetics.addExecutionTag('workflow-type', 'full-adoption');
        synthetics.addExecutionTag('pet-type', selectedPet.pettype);
        synthetics.addExecutionTag('pet-color', selectedPet.petcolor);
        synthetics.addExecutionTag('pet-id', selectedPet.petid);

        log.info('Pet Adoption Workflow canary completed successfully');
        
    } catch (error) {
        log.error('Pet Adoption Workflow canary failed:', error.message);
        throw error;
    }
};

exports.handler = async () => {
    return await synthetics.executeStep('petAdoptionWorkflowCanary', petAdoptionWorkflowCanary);
};