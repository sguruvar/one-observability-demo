const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  baseUrl: process.env.PET_SITE_URL || 'http://localhost:5000',
  timeout: 15000,
  testPet: {
    pettype: 'test-pet',
    petcolor: 'test-color',
    petid: 'data-integrity-test-' + Date.now()
  }
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: config.timeout
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Helper function to check if pet appears in listings
function checkPetInListings(listingsBody, petId) {
  return listingsBody.includes(petId) || listingsBody.includes(config.testPet.pettype);
}

// Helper function to check if pet appears in history
function checkPetInHistory(historyBody, petId) {
  return historyBody.includes(petId) || historyBody.includes(config.testPet.pettype);
}

// Main canary function
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const results = {
    success: true,
    errors: [],
    responseTimes: {},
    tests: {},
    dataIntegrity: {}
  };

  try {
    console.log('Starting Data Integrity Canary...');
    
    // Phase 1: Initial state verification
    console.log('Phase 1: Verifying initial state...');
    
    // Check initial pet history
    const initialHistoryStart = Date.now();
    const initialHistoryResponse = await makeRequest(`${config.baseUrl}/pethistory`);
    const initialHistoryTime = Date.now() - initialHistoryStart;
    
    results.responseTimes.initialHistory = initialHistoryTime;
    results.tests.initialHistory = {
      success: initialHistoryResponse.statusCode === 200,
      statusCode: initialHistoryResponse.statusCode,
      responseTime: initialHistoryTime
    };

    if (initialHistoryResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Initial history check failed with status ${initialHistoryResponse.statusCode}`);
      throw new Error('Initial history check failed');
    }

    // Check initial adoption listings
    const initialListingsStart = Date.now();
    const initialListingsResponse = await makeRequest(`${config.baseUrl}/PetListAdoptions`);
    const initialListingsTime = Date.now() - initialListingsStart;
    
    results.responseTimes.initialListings = initialListingsTime;
    results.tests.initialListings = {
      success: initialListingsResponse.statusCode === 200,
      statusCode: initialListingsResponse.statusCode,
      responseTime: initialListingsTime
    };

    if (initialListingsResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Initial listings check failed with status ${initialListingsResponse.statusCode}`);
      throw new Error('Initial listings check failed');
    }

    // Phase 2: Create test adoption record
    console.log('Phase 2: Creating test adoption record...');
    
    // Search for the test pet
    const searchStart = Date.now();
    const searchResponse = await makeRequest(
      `${config.baseUrl}/?selectedPetType=${config.testPet.pettype}&selectedPetColor=${config.testPet.petcolor}`
    );
    const searchTime = Date.now() - searchStart;
    
    results.responseTimes.search = searchTime;
    results.tests.search = {
      success: searchResponse.statusCode === 200,
      statusCode: searchResponse.statusCode,
      responseTime: searchTime
    };

    if (searchResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Search failed with status ${searchResponse.statusCode}`);
      throw new Error('Search failed');
    }

    // Initiate adoption
    const adoptionStart = Date.now();
    const adoptionResponse = await makeRequest(
      `${config.baseUrl}/Adoption/TakeMeHome`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `pettype=${config.testPet.pettype}&petcolor=${config.testPet.petcolor}&petid=${config.testPet.petid}`
      }
    );
    const adoptionTime = Date.now() - adoptionStart;
    
    results.responseTimes.adoption = adoptionTime;
    results.tests.adoption = {
      success: adoptionResponse.statusCode === 200,
      statusCode: adoptionResponse.statusCode,
      responseTime: adoptionTime
    };

    if (adoptionResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Adoption failed with status ${adoptionResponse.statusCode}`);
      throw new Error('Adoption failed');
    }

    // Complete payment
    const paymentStart = Date.now();
    const paymentResponse = await makeRequest(
      `${config.baseUrl}/Payment/MakePayment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `pettype=${config.testPet.pettype}&petid=${config.testPet.petid}`
      }
    );
    const paymentTime = Date.now() - paymentStart;
    
    results.responseTimes.payment = paymentTime;
    results.tests.payment = {
      success: paymentResponse.statusCode === 200,
      statusCode: paymentResponse.statusCode,
      responseTime: paymentTime
    };

    if (paymentResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Payment failed with status ${paymentResponse.statusCode}`);
      throw new Error('Payment failed');
    }

    // Phase 3: Verify data consistency
    console.log('Phase 3: Verifying data consistency...');
    
    // Wait a moment for data to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if pet appears in adoption listings
    const verifyListingsStart = Date.now();
    const verifyListingsResponse = await makeRequest(`${config.baseUrl}/PetListAdoptions`);
    const verifyListingsTime = Date.now() - verifyListingsStart;
    
    results.responseTimes.verifyListings = verifyListingsTime;
    results.tests.verifyListings = {
      success: verifyListingsResponse.statusCode === 200,
      statusCode: verifyListingsResponse.statusCode,
      responseTime: verifyListingsTime
    };

    if (verifyListingsResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Listings verification failed with status ${verifyListingsResponse.statusCode}`);
    } else {
      const petInListings = checkPetInListings(verifyListingsResponse.body, config.testPet.petid);
      results.dataIntegrity.petInListings = petInListings;
      
      if (!petInListings) {
        results.success = false;
        results.errors.push('Test pet not found in adoption listings after creation');
      }
    }

    // Check if pet appears in history
    const verifyHistoryStart = Date.now();
    const verifyHistoryResponse = await makeRequest(`${config.baseUrl}/pethistory`);
    const verifyHistoryTime = Date.now() - verifyHistoryStart;
    
    results.responseTimes.verifyHistory = verifyHistoryTime;
    results.tests.verifyHistory = {
      success: verifyHistoryResponse.statusCode === 200,
      statusCode: verifyHistoryResponse.statusCode,
      responseTime: verifyHistoryTime
    };

    if (verifyHistoryResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`History verification failed with status ${verifyHistoryResponse.statusCode}`);
    } else {
      const petInHistory = checkPetInHistory(verifyHistoryResponse.body, config.testPet.petid);
      results.dataIntegrity.petInHistory = petInHistory;
      
      if (!petInHistory) {
        results.success = false;
        results.errors.push('Test pet not found in history after creation');
      }
    }

    // Phase 4: Cleanup test data
    console.log('Phase 4: Cleaning up test data...');
    
    // Perform housekeeping to reset data
    const cleanupStart = Date.now();
    const cleanupResponse = await makeRequest(`${config.baseUrl}/housekeeping/`);
    const cleanupTime = Date.now() - cleanupStart;
    
    results.responseTimes.cleanup = cleanupTime;
    results.tests.cleanup = {
      success: cleanupResponse.statusCode === 200,
      statusCode: cleanupResponse.statusCode,
      responseTime: cleanupTime
    };

    if (cleanupResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Cleanup failed with status ${cleanupResponse.statusCode}`);
    }

    // Verify cleanup was successful
    const finalCheckStart = Date.now();
    const finalCheckResponse = await makeRequest(`${config.baseUrl}/PetListAdoptions`);
    const finalCheckTime = Date.now() - finalCheckStart;
    
    results.responseTimes.finalCheck = finalCheckTime;
    results.tests.finalCheck = {
      success: finalCheckResponse.statusCode === 200,
      statusCode: finalCheckResponse.statusCode,
      responseTime: finalCheckTime
    };

    if (finalCheckResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Final check failed with status ${finalCheckResponse.statusCode}`);
    } else {
      const petStillInListings = checkPetInListings(finalCheckResponse.body, config.testPet.petid);
      results.dataIntegrity.petCleanedUp = !petStillInListings;
      
      if (petStillInListings) {
        results.success = false;
        results.errors.push('Test pet still found in listings after cleanup');
      }
    }

    const totalTime = Date.now() - startTime;
    results.totalExecutionTime = totalTime;
    results.timestamp = new Date().toISOString();

    // Success criteria: All tests pass and data integrity is maintained
    const maxResponseTime = 8000; // 8 seconds for data integrity operations
    const slowResponses = Object.values(results.responseTimes).filter(time => time > maxResponseTime);
    
    if (slowResponses.length > 0) {
      results.success = false;
      results.errors.push(`Some responses were slow: ${slowResponses.length} responses exceeded ${maxResponseTime}ms`);
    }

    console.log('Data Integrity Canary completed successfully');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Tests passed: ${Object.values(results.tests).filter(t => t.success).length}/${Object.keys(results.tests).length}`);
    console.log(`Data integrity checks: ${Object.values(results.dataIntegrity).filter(v => v === true).length}/${Object.keys(results.dataIntegrity).length} passed`);

    return {
      statusCode: 200,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Data Integrity Canary failed:', error);
    results.success = false;
    results.errors.push(error.message);
    results.timestamp = new Date().toISOString();
    
    return {
      statusCode: 500,
      body: JSON.stringify(results, null, 2)
    };
  }
};

