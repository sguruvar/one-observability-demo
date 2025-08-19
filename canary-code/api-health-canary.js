const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const apiHealthCanary = async function () {
    log.info('Starting API Health Check canary');
    
    try {
        // Test PetSite endpoint
        const petSiteUrl = process.env.PET_SITE_URL;
        log.info('Testing PetSite endpoint:', petSiteUrl);
        
        const petSiteResponse = await new Promise((resolve, reject) => {
            const url = new URL(petSiteUrl);
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
        
        // Accept both 200 OK and 302 Found (redirects are common for web apps)
        if (petSiteResponse.statusCode === 200 || petSiteResponse.statusCode === 302) {
            log.info('PetSite endpoint is healthy - Status:', petSiteResponse.statusCode);
        } else {
            throw new Error('PetSite endpoint returned unexpected status: ' + petSiteResponse.statusCode);
        }
        
        // Test Search API endpoint
        const searchApiUrl = process.env.SEARCH_API_URL;
        log.info('Testing Search API endpoint:', searchApiUrl);
        
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
            log.info('Search API endpoint is healthy - Status:', searchResponse.statusCode);
        } else {
            throw new Error('Search API endpoint returned unexpected status: ' + searchResponse.statusCode);
        }
        
        log.info('All endpoints are healthy');
        return 'SUCCESS';
        
    } catch (error) {
        log.error('Health check failed:', error);
        throw error;
    }
};

exports.handler = async () => {
    return await apiHealthCanary();
};
