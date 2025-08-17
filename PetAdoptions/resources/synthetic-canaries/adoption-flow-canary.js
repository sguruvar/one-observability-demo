const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  baseUrl: process.env.PET_SITE_URL || 'http://localhost:5000',
  timeout: 15000,
  testPet: {
    pettype: 'dog',
    petcolor: 'brown',
    petid: 'test-123'
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

// Main canary function
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const results = {
    success: true,
    errors: [],
    responseTimes: {},
    tests: {},
    adoptionId: null
  };

  try {
    console.log('Starting Adoption Flow Canary...');
    
    // Step 1: Search for a pet to adopt
    console.log('Step 1: Searching for a pet...');
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
      throw new Error('Search step failed');
    }

    // Step 2: Initiate adoption (TakeMeHome)
    console.log('Step 2: Initiating adoption...');
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
      results.errors.push(`Adoption initiation failed with status ${adoptionResponse.statusCode}`);
      throw new Error('Adoption step failed');
    }

    // Step 3: Complete payment
    console.log('Step 3: Completing payment...');
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
      throw new Error('Payment step failed');
    }

    // Step 4: Verify adoption listing
    console.log('Step 4: Verifying adoption listing...');
    const listingStart = Date.now();
    const listingResponse = await makeRequest(`${config.baseUrl}/PetListAdoptions`);
    const listingTime = Date.now() - listingStart;
    
    results.responseTimes.listing = listingTime;
    results.tests.listing = {
      success: listingResponse.statusCode === 200,
      statusCode: listingResponse.statusCode,
      responseTime: listingTime
    };

    if (listingResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Adoption listing failed with status ${listingResponse.statusCode}`);
      throw new Error('Listing verification failed');
    }

    // Step 5: Verify pet history
    console.log('Step 5: Verifying pet history...');
    const historyStart = Date.now();
    const historyResponse = await makeRequest(`${config.baseUrl}/pethistory`);
    const historyTime = Date.now() - historyStart;
    
    results.responseTimes.history = historyTime;
    results.tests.history = {
      success: historyResponse.statusCode === 200,
      statusCode: historyResponse.statusCode,
      responseTime: historyTime
    };

    if (historyResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Pet history failed with status ${historyResponse.statusCode}`);
      throw new Error('History verification failed');
    }

    const totalTime = Date.now() - startTime;
    results.totalExecutionTime = totalTime;
    results.timestamp = new Date().toISOString();

    // Success criteria: All steps complete successfully and response times are reasonable
    const maxResponseTime = 5000; // 5 seconds for complex operations
    const slowResponses = Object.values(results.responseTimes).filter(time => time > maxResponseTime);
    
    if (slowResponses.length > 0) {
      results.success = false;
      results.errors.push(`Some responses were slow: ${slowResponses.length} responses exceeded ${maxResponseTime}ms`);
    }

    console.log('Adoption Flow Canary completed successfully');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Steps completed: ${Object.values(results.tests).filter(t => t.success).length}/${Object.keys(results.tests).length}`);

    return {
      statusCode: 200,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Adoption Flow Canary failed:', error);
    results.success = false;
    results.errors.push(error.message);
    results.timestamp = new Date().toISOString();
    
    return {
      statusCode: 500,
      body: JSON.stringify(results, null, 2)
    };
  }
};

