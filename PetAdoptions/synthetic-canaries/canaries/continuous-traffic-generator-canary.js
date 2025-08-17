const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const continuousTrafficGeneratorCanary = async function () {
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
    const trafficDelayTime = parseInt(synthetics.getConfiguration().getEnvironmentVariable('TRAFFIC_DELAY_TIME') || '1');
    
    // Clean up URLs
    const cleanSearchUrl = searchApiUrl.replace(/\?$/, '');
    const baseSiteUrl = petSiteUrl.startsWith('http') ? petSiteUrl : `http://${petSiteUrl}`;
    const baseSearchUrl = cleanSearchUrl.startsWith('http') ? cleanSearchUrl : `http://${cleanSearchUrl}`;
    
    log.info('Starting Continuous Traffic Generator canary');
    log.info(`Pet Site URL: ${baseSiteUrl}`);
    log.info(`Search API URL: ${baseSearchUrl}`);
    log.info(`Traffic Delay Time: ${trafficDelayTime}`);

    const siteUrlParts = new URL(baseSiteUrl);
    const searchUrlParts = new URL(baseSearchUrl);

    // Calculate delay in milliseconds (original was trafficDelayTime * 20 seconds)
    const delayMs = trafficDelayTime * 20000;
    log.info(`Delay between cycles: ${delayMs / 1000} seconds`);

    // Run continuous loop for the duration of the canary execution
    const startTime = Date.now();
    const maxRunTime = 14 * 60 * 1000; // 14 minutes (leave 1 minute buffer for 15min timeout)
    let cycleCount = 0;

    try {
        while ((Date.now() - startTime) < maxRunTime) {
            cycleCount++;
            log.info(`Starting traffic generation cycle ${cycleCount} at: ${new Date().toISOString()}`);

            await generateTrafficCycle(siteUrlParts, searchUrlParts, cycleCount);

            // Check if we have time for another cycle
            if ((Date.now() - startTime + delayMs) < maxRunTime) {
                log.info(`Waiting ${delayMs / 1000} seconds before next cycle...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                log.info('Approaching timeout limit, stopping continuous execution');
                break;
            }
        }

        log.info(`Continuous Traffic Generator completed ${cycleCount} cycles successfully`);
        synthetics.addExecutionTag('cycles-completed', cycleCount.toString());
        synthetics.addExecutionTag('execution-type', 'continuous');
        
    } catch (error) {
        log.error('Continuous Traffic Generator failed:', error.message);
        synthetics.addExecutionTag('cycles-completed', cycleCount.toString());
        synthetics.addExecutionTag('failed-at-cycle', cycleCount.toString());
        throw error;
    }
};

async function generateTrafficCycle(siteUrlParts, searchUrlParts, cycleNumber) {
    try {
        // Step 1: Housekeeping
        log.info(`Cycle ${cycleNumber}: Performing housekeeping...`);
        const housekeepingRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/housekeeping/',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        await synthetics.executeHttpStep(`housekeeping-${cycleNumber}`, housekeepingRequest);

        // Step 2: Load Pet Data
        log.info(`Cycle ${cycleNumber}: Loading pet data...`);
        const loadPetsRequest = {
            hostname: searchUrlParts.hostname,
            method: 'GET',
            path: searchUrlParts.pathname,
            port: searchUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: searchUrlParts.protocol
        };

        const petsResponse = await synthetics.executeHttpStep(`loadPetData-${cycleNumber}`, loadPetsRequest);
        
        if (petsResponse.statusCode !== 200) {
            throw new Error(`Pet data load failed with status: ${petsResponse.statusCode}`);
        }

        const allPets = JSON.parse(petsResponse.responseBody);
        log.info(`Cycle ${cycleNumber}: Loaded ${allPets.length} pets`);

        if (allPets.length === 0) {
            log.warning(`Cycle ${cycleNumber}: No pets available, skipping adoption workflow`);
            return;
        }

        // Generate random load size (like original traffic generator)
        const loadSize = Math.floor(Math.random() * (allPets.length - 5)) + 5; // Random between 5 and total pets
        log.info(`Cycle ${cycleNumber}: Processing ${loadSize} pet adoptions`);

        // Clean up adoption history if load is high (like original)
        if (loadSize > 20) {
            log.info(`Cycle ${cycleNumber}: High load detected, cleaning up adoption history`);
            const deleteRequest = {
                hostname: siteUrlParts.hostname,
                method: 'DELETE',
                path: '/pethistory/deletepetadoptionshistory',
                port: siteUrlParts.protocol === 'https:' ? 443 : 80,
                protocol: siteUrlParts.protocol
            };
            await synthetics.executeHttpStep(`deleteHistory-${cycleNumber}`, deleteRequest);
        } else {
            // Get pet history
            const historyRequest = {
                hostname: siteUrlParts.hostname,
                method: 'GET',
                path: '/pethistory',
                port: siteUrlParts.protocol === 'https:' ? 443 : 80,
                protocol: siteUrlParts.protocol
            };
            await synthetics.executeHttpStep(`petHistory-${cycleNumber}`, historyRequest);
        }

        // Process adoptions
        for (let i = 0; i < loadSize; i++) {
            const randomIndex = Math.floor(Math.random() * allPets.length);
            const currentPet = allPets[randomIndex];

            log.info(`Cycle ${cycleNumber}: Processing adoption ${i + 1}/${loadSize} - ${currentPet.pettype} ${currentPet.petcolor} (${currentPet.petid})`);

            // Step 3: Search for pet
            const searchRequest = {
                hostname: siteUrlParts.hostname,
                method: 'GET',
                path: `/?selectedPetType=${encodeURIComponent(currentPet.pettype)}&selectedPetColor=${encodeURIComponent(currentPet.petcolor)}`,
                port: siteUrlParts.protocol === 'https:' ? 443 : 80,
                protocol: siteUrlParts.protocol
            };

            await synthetics.executeHttpStep(`searchPet-${cycleNumber}-${i}`, searchRequest);

            // Step 4: Take Me Home (Adoption)
            const adoptionData = `pettype=${encodeURIComponent(currentPet.pettype)}&petcolor=${encodeURIComponent(currentPet.petcolor)}&petid=${encodeURIComponent(currentPet.petid)}`;
            
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

            await synthetics.executeHttpStep(`adoptPet-${cycleNumber}-${i}`, adoptionRequest);

            // Step 5: Make Payment
            const paymentData = `pettype=${encodeURIComponent(currentPet.pettype)}&petid=${encodeURIComponent(currentPet.petid)}`;
            
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

            await synthetics.executeHttpStep(`makePayment-${cycleNumber}-${i}`, paymentRequest);
        }

        // Step 6: List Adopted Pets
        const listAdoptionsRequest = {
            hostname: siteUrlParts.hostname,
            method: 'GET',
            path: '/PetListAdoptions',
            port: siteUrlParts.protocol === 'https:' ? 443 : 80,
            protocol: siteUrlParts.protocol
        };

        await synthetics.executeHttpStep(`listAdoptions-${cycleNumber}`, listAdoptionsRequest);

        log.info(`Cycle ${cycleNumber}: Completed successfully - processed ${loadSize} adoptions`);
        
        // Add execution tags for this cycle
        synthetics.addExecutionTag(`cycle-${cycleNumber}-pets-processed`, loadSize.toString());
        synthetics.addExecutionTag(`cycle-${cycleNumber}-status`, 'success');

    } catch (error) {
        log.error(`Cycle ${cycleNumber}: Failed with error: ${error.message}`);
        synthetics.addExecutionTag(`cycle-${cycleNumber}-status`, 'failed');
        throw error;
    }
}

exports.handler = async () => {
    return await synthetics.executeStep('continuousTrafficGeneratorCanary', continuousTrafficGeneratorCanary);
};