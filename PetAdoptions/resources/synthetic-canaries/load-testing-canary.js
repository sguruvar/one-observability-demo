const https = require('https');
const { URL } = require('url');

// Configuration
const config = {
  baseUrl: process.env.PET_SITE_URL || 'http://localhost:5000',
  timeout: 20000,
  concurrentRequests: 5,
  testIterations: 3
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

// Helper function to make concurrent requests
async function makeConcurrentRequests(requests) {
  const startTime = Date.now();
  const results = await Promise.allSettled(requests);
  const endTime = Date.now();
  
  return {
    results,
    totalTime: endTime - startTime,
    successCount: results.filter(r => r.status === 'fulfilled').length,
    failureCount: results.filter(r => r.status === 'rejected').length
  };
}

// Main canary function
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const results = {
    success: true,
    errors: [],
    responseTimes: {},
    tests: {},
    loadTestResults: {}
  };

  try {
    console.log('Starting Load Testing Canary...');
    
    // Test 1: Concurrent pet searches
    console.log('Test 1: Testing concurrent pet searches...');
    const searchRequests = [];
    const petTypes = ['dog', 'cat', 'bird', 'fish', 'hamster'];
    const petColors = ['brown', 'black', 'white', 'orange', 'gray'];
    
    for (let i = 0; i < config.concurrentRequests; i++) {
      const petType = petTypes[i % petTypes.length];
      const petColor = petColors[i % petColors.length];
      searchRequests.push(
        makeRequest(`${config.baseUrl}/?selectedPetType=${petType}&selectedPetColor=${petColor}`)
      );
    }
    
    const searchLoadTest = await makeConcurrentRequests(searchRequests);
    results.loadTestResults.concurrentSearches = searchLoadTest;
    
    if (searchLoadTest.failureCount > 0) {
      results.success = false;
      results.errors.push(`${searchLoadTest.failureCount} concurrent search requests failed`);
    }

    // Test 2: Concurrent adoption listings checks
    console.log('Test 2: Testing concurrent adoption listings...');
    const listingRequests = [];
    for (let i = 0; i < config.concurrentRequests; i++) {
      listingRequests.push(makeRequest(`${config.baseUrl}/PetListAdoptions`));
    }
    
    const listingLoadTest = await makeConcurrentRequests(listingRequests);
    results.loadTestResults.concurrentListings = listingLoadTest;
    
    if (listingLoadTest.failureCount > 0) {
      results.success = false;
      results.errors.push(`${listingLoadTest.failureCount} concurrent listing requests failed`);
    }

    // Test 3: Concurrent pet history checks
    console.log('Test 3: Testing concurrent pet history...');
    const historyRequests = [];
    for (let i = 0; i < config.concurrentRequests; i++) {
      historyRequests.push(makeRequest(`${config.baseUrl}/pethistory`));
    }
    
    const historyLoadTest = await makeConcurrentRequests(historyRequests);
    results.loadTestResults.concurrentHistory = historyLoadTest;
    
    if (historyLoadTest.failureCount > 0) {
      results.success = false;
      results.errors.push(`${historyLoadTest.failureCount} concurrent history requests failed`);
    }

    // Test 4: Sequential rapid requests (simulating user clicking)
    console.log('Test 4: Testing sequential rapid requests...');
    const rapidRequests = [];
    for (let i = 0; i < config.testIterations; i++) {
      rapidRequests.push(makeRequest(`${config.baseUrl}/`));
      rapidRequests.push(makeRequest(`${config.baseUrl}/?selectedPetType=dog&selectedPetColor=brown`));
      rapidRequests.push(makeRequest(`${config.baseUrl}/PetListAdoptions`));
    }
    
    const rapidTest = await makeConcurrentRequests(rapidRequests);
    results.loadTestResults.rapidSequential = rapidTest;
    
    if (rapidTest.failureCount > 0) {
      results.success = false;
      results.errors.push(`${rapidTest.failureCount} rapid sequential requests failed`);
    }

    // Test 5: Mixed workload (searches + listings + history)
    console.log('Test 5: Testing mixed workload...');
    const mixedRequests = [
      makeRequest(`${config.baseUrl}/?selectedPetType=cat&selectedPetColor=black`),
      makeRequest(`${config.baseUrl}/PetListAdoptions`),
      makeRequest(`${config.baseUrl}/pethistory`),
      makeRequest(`${config.baseUrl}/?selectedPetType=bird&selectedPetColor=orange`),
      makeRequest(`${config.baseUrl}/`)
    ];
    
    const mixedTest = await makeConcurrentRequests(mixedRequests);
    results.loadTestResults.mixedWorkload = mixedTest;
    
    if (mixedTest.failureCount > 0) {
      results.success = false;
      results.errors.push(`${mixedTest.failureCount} mixed workload requests failed`);
    }

    const totalTime = Date.now() - startTime;
    results.totalExecutionTime = totalTime;
    results.timestamp = new Date().toISOString();

    // Calculate overall load test metrics
    const allTests = [
      results.loadTestResults.concurrentSearches,
      results.loadTestResults.concurrentListings,
      results.loadTestResults.concurrentHistory,
      results.loadTestResults.rapidSequential,
      results.loadTestResults.mixedWorkload
    ];
    
    const totalRequests = allTests.reduce((sum, test) => sum + test.successCount + test.failureCount, 0);
    const totalFailures = allTests.reduce((sum, test) => sum + test.failureCount, 0);
    const successRate = totalRequests > 0 ? ((totalRequests - totalFailures) / totalRequests) * 100 : 0;
    
    results.loadTestResults.summary = {
      totalRequests,
      totalFailures,
      successRate: successRate.toFixed(2) + '%',
      averageResponseTime: (totalTime / totalRequests).toFixed(2) + 'ms'
    };

    // Success criteria: Success rate > 95% and reasonable response times
    if (successRate < 95) {
      results.success = false;
      results.errors.push(`Load test success rate ${successRate.toFixed(2)}% is below 95% threshold`);
    }

    const maxResponseTime = 10000; // 10 seconds for load tests
    if (totalTime > maxResponseTime) {
      results.success = false;
      results.errors.push(`Total load test time ${totalTime}ms exceeded ${maxResponseTime}ms threshold`);
    }

    console.log('Load Testing Canary completed successfully');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Total requests: ${totalRequests}`);
    console.log(`Success rate: ${successRate.toFixed(2)}%`);

    return {
      statusCode: 200,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Load Testing Canary failed:', error);
    results.success = false;
    results.errors.push(error.message);
    results.timestamp = new Date().toISOString();
    
    return {
      statusCode: 500,
      body: JSON.stringify(results, null, 2)
    };
  }
};

