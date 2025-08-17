const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  baseUrl: process.env.PET_SITE_URL || 'http://localhost:5000',
  timeout: 10000,
  petTypes: ['dog', 'cat', 'bird', 'fish'],
  petColors: ['brown', 'black', 'white', 'orange', 'gray']
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
    console.log('Starting Pet Search Canary...');
    
    // Test 1: Basic pet search functionality
    console.log('Test 1: Testing basic pet search...');
    const searchStart = Date.now();
    const searchResponse = await makeRequest(`${config.baseUrl}/?selectedPetType=dog&selectedPetColor=brown`);
    const searchTime = Date.now() - searchStart;
    
    results.responseTimes.search = searchTime;
    results.tests.basicSearch = {
      success: searchResponse.statusCode === 200,
      statusCode: searchResponse.statusCode,
      responseTime: searchTime
    };

    if (searchResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`Search failed with status ${searchResponse.statusCode}`);
    }

    // Test 2: Test different pet type combinations
    console.log('Test 2: Testing different pet type combinations...');
    const combinations = [
      { type: 'cat', color: 'black' },
      { type: 'bird', color: 'orange' },
      { type: 'fish', color: 'gray' }
    ];

    for (const combo of combinations) {
      const comboStart = Date.now();
      const comboResponse = await makeRequest(
        `${config.baseUrl}/?selectedPetType=${combo.type}&selectedPetColor=${combo.color}`
      );
      const comboTime = Date.now() - comboStart;
      
      results.responseTimes[`${combo.type}_${combo.color}`] = comboTime;
      results.tests[`${combo.type}_${combo.color}`] = {
        success: comboResponse.statusCode === 200,
        statusCode: comboResponse.statusCode,
        responseTime: comboTime
      };

      if (comboResponse.statusCode !== 200) {
        results.success = false;
        results.errors.push(`${combo.type} ${combo.color} search failed with status ${comboResponse.statusCode}`);
      }
    }

    // Test 3: Test search with no parameters (should still work)
    console.log('Test 3: Testing search with no parameters...');
    const noParamsStart = Date.now();
    const noParamsResponse = await makeRequest(`${config.baseUrl}/`);
    const noParamsTime = Date.now() - noParamsStart;
    
    results.responseTimes.noParams = noParamsTime;
    results.tests.noParams = {
      success: noParamsResponse.statusCode === 200,
      statusCode: noParamsResponse.statusCode,
      responseTime: noParamsTime
    };

    if (noParamsResponse.statusCode !== 200) {
      results.success = false;
      results.errors.push(`No params search failed with status ${noParamsResponse.statusCode}`);
    }

    const totalTime = Date.now() - startTime;
    results.totalExecutionTime = totalTime;
    results.timestamp = new Date().toISOString();

    // Success criteria: All tests pass and response times are reasonable
    const maxResponseTime = 2000; // 2 seconds
    const slowResponses = Object.values(results.responseTimes).filter(time => time > maxResponseTime);
    
    if (slowResponses.length > 0) {
      results.success = false;
      results.errors.push(`Some responses were slow: ${slowResponses.length} responses exceeded ${maxResponseTime}ms`);
    }

    console.log('Pet Search Canary completed successfully');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Tests passed: ${Object.values(results.tests).filter(t => t.success).length}/${Object.keys(results.tests).length}`);

    return {
      statusCode: 200,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Pet Search Canary failed:', error);
    results.success = false;
    results.errors.push(error.message);
    results.timestamp = new Date().toISOString();
    
    return {
      statusCode: 500,
      body: JSON.stringify(results, null, 2)
    };
  }
};

