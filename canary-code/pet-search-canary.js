const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const petSearchCanary = async function () {
    log.info('Starting Pet Search canary');
    
    try {
        // Test basic search API functionality
        const searchApiUrl = process.env.SEARCH_API_URL;
        log.info('Testing Search API with basic query:', searchApiUrl);
        
        const searchResponse = await new Promise((resolve, reject) => {
            const url = new URL(searchApiUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            const req = client.request(url, { method: 'GET', timeout: 30000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
            });
            
            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));
            req.end();
        });
        
        if (searchResponse.statusCode === 200) {
            log.info('Search API responded successfully - Status:', searchResponse.statusCode);
            
            // Try to parse the response to ensure it's valid JSON
            try {
                const searchData = JSON.parse(searchResponse.body);
                log.info('Search API returned valid JSON data');
                
                // Check if we have some basic structure (adjust based on your actual API response)
                if (searchData && typeof searchData === 'object') {
                    log.info('Search API data structure looks valid');
                } else {
                    log.warn('Search API returned unexpected data structure');
                }
                
            } catch (parseError) {
                log.warn('Search API response is not valid JSON, but endpoint is responding');
            }
            
        } else {
            throw new Error('Search API returned unexpected status: ' + searchResponse.statusCode);
        }
        
        // Test search with a specific query parameter if the API supports it
        const baseSearchUrl = searchApiUrl.split('?')[0]; // Remove existing query parameters
        const searchWithQueryUrl = baseSearchUrl + '?query=test';
        log.info('Testing Search API with query parameter at:', searchWithQueryUrl);
        
        const queryResponse = await new Promise((resolve, reject) => {
            const url = new URL(searchWithQueryUrl);
            const client = url.protocol === 'https:' ? https : http;
            
            const req = client.request(url, { method: 'GET', timeout: 30000 }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
            });
            
            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));
            req.end();
        });
        
        if (queryResponse.statusCode === 200 || queryResponse.statusCode === 400) {
            // Both 200 (success) and 400 (bad request) are acceptable for invalid queries
            log.info('Search with query parameter test completed - Status:', queryResponse.statusCode);
        } else {
            log.warn('Search with query parameter returned unexpected status: ' + queryResponse.statusCode);
        }
        
        log.info('Pet Search canary completed successfully');
        return 'SUCCESS';
        
    } catch (error) {
        log.error('Pet Search canary failed:', error);
        throw error;
    }
};

exports.handler = async () => {
    return await petSearchCanary();
};
