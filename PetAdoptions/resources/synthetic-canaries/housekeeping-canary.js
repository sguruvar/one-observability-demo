const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  baseUrl: process.env.PET_SITE_URL || 'http://localhost:5000',
  timeout: 10000
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
    tests: {}
  };

  try {
    console.log('Starting Housekeeping Canary...');
    
    // Test 1: Check current pet history state
    console.log('Test 1: Checking current pet history state...');
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
      results.errors.push(`Pet history check failed with status ${historyResponse.statusCode}`);
    }

    // Test 2: Perform housekeeping (reset application data)
    console.log('Test 2: Performing housekeeping...');
    const housekeepingStart = Date.now();
    const housekeepingResponse = await makeRequest(`${config.baseUrl}/housekeeping/`);
    const housekeepingTime = Date.now() - housekeepingStart;
    
    results.responseTimes.housekeeping = housekeepingTime;
    results.tests.housekeeping = {
      success: housekeepingResponse.statusCode === 200,
      statusCode: housekeepingResponse.statusCode,
      responseTime: housekeepingTime
    };

    if (housekeepingResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Housekeeping failed with status ${housekeepingResponse.statusCode}`);
    }

    // Test 3: Verify housekeeping effect by checking pet history again
    console.log('Test 3: Verifying housekeeping effect...');
    const verifyStart = Date.now();
    const verifyResponse = await makeRequest(`${config.baseUrl}/pethistory`);
    const verifyTime = Date.now() - verifyStart;
    
    results.responseTimes.verification = verifyTime;
    results.tests.verification = {
      success: verifyResponse.statusCode === 200,
      statusCode: verifyResponse.statusCode,
      responseTime: verifyTime
    };

    if (verifyResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Post-housekeeping verification failed with status ${verifyResponse.statusCode}`);
    }

    // Test 4: Check if adoption listings are cleared
    console.log('Test 4: Checking adoption listings...');
    const listingsStart = Date.now();
    const listingsResponse = await makeRequest(`${config.baseUrl}/PetListAdoptions`);
    const listingsTime = Date.now() - listingsStart;
    
    results.responseTimes.listings = listingsTime;
    results.tests.listings = {
      success: listingsResponse.statusCode === 200,
      statusCode: listingsResponse.statusCode,
      responseTime: listingsTime
    };

    if (listingsResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Adoption listings check failed with status ${listingsResponse.statusCode}`);
    }

    // Test 5: Verify home page loads correctly after housekeeping
    console.log('Test 5: Verifying home page loads...');
    const homeStart = Date.now();
    const homeResponse = await makeRequest(`${config.baseUrl}/`);
    const homeTime = Date.now() - homeStart;
    
    results.responseTimes.home = homeTime;
    results.tests.home = {
      success: homeResponse.statusCode === 200,
      statusCode: homeResponse.statusCode,
      responseTime: homeTime
    };

    if (homeResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Home page check failed with status ${homeResponse.statusCode}`);
    }

    const totalTime = Date.now() - startTime;
    results.totalExecutionTime = totalTime;
    results.timestamp = new Date().toISOString();

    // Success criteria: All tests pass and response times are reasonable
    const maxResponseTime = 3000; // 3 seconds for housekeeping operations
    const slowResponses = Object.values(results.responseTimes).filter(time => time > maxResponseTime);
    
    if (slowResponses.length > 0) {
      results.success = false;
      results.errors.push(`Some responses were slow: ${slowResponses.length} responses exceeded ${maxResponseTime}ms`);
    }

    console.log('Housekeeping Canary completed successfully');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Tests passed: ${Object.values(results.tests).filter(t => t.success).length}/${Object.keys(results.tests).length}`);

    return {
      statusCode: 200,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Housekeeping Canary failed:', error);
    results.success = false;
    results.errors.push(error.message);
    results.timestamp = new Date().toISOString();
    
    return {
      statusCode: 500,
      body: JSON.stringify(results, null, 2)
    };
  }
};


