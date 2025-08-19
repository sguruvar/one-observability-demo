const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const https = require('https');
const http = require('http');

const petAdoptionWorkflowCanary = async function () {
    log.info('Starting Pet Adoption Workflow canary');
    
    try {
        // Step 1: Access the main PetSite
        const petSiteUrl = process.env.PET_SITE_URL;
        log.info('Step 1: Accessing PetSite main page:', petSiteUrl);
        
        const mainPageResponse = await new Promise((resolve, reject) => {
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
        
        if (mainPageResponse.statusCode !== 200 && mainPageResponse.statusCode !== 302) {
            throw new Error('Failed to access main page - Status: ' + mainPageResponse.statusCode);
        }
        
        log.info('Main page accessed successfully');
        
        // Step 2: Test the adoption page
        const baseUrl = petSiteUrl.split('?')[0]; // Remove query parameters
        const adoptionUrl = baseUrl + '/Adoption';
        log.info('Step 2: Testing adoption page at:', adoptionUrl);
        
        const adoptionResponse = await new Promise((resolve, reject) => {
            const url = new URL(adoptionUrl);
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
        
        if (adoptionResponse.statusCode !== 200 && adoptionResponse.statusCode !== 302) {
            throw new Error('Failed to access adoption page - Status: ' + adoptionResponse.statusCode);
        }
        
        log.info('Adoption page accessed successfully');
        
        // Step 3: Test the payment page
        const paymentUrl = baseUrl + '/Payment';
        log.info('Step 3: Testing payment page at:', paymentUrl);
        
        const paymentResponse = await new Promise((resolve, reject) => {
            const url = new URL(paymentUrl);
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
        
        if (paymentResponse.statusCode !== 200 && paymentResponse.statusCode !== 302) {
            throw new Error('Failed to access payment page - Status: ' + paymentResponse.statusCode);
        }
        
        log.info('Payment page accessed successfully');
        
        log.info('Pet Adoption Workflow canary completed successfully');
        return 'SUCCESS';
        
    } catch (error) {
        log.error('Pet Adoption Workflow failed:', error);
        throw error;
    }
};

exports.handler = async () => {
    return await petAdoptionWorkflowCanary();
};
