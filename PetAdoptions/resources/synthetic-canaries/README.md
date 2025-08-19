# Pet Adoptions Synthetic Canaries

This directory contains AWS CloudWatch Synthetic Canaries that replace the previous .NET traffic generator for monitoring the Pet Adoptions application.

## Overview

The synthetic canaries provide continuous monitoring of the Pet Adoptions application by simulating real user interactions and verifying system health. They run on configurable schedules and provide detailed metrics and alerting.

## Migration from .NET Traffic Generator

### Previous Implementation
- **Technology**: .NET 6 background service
- **Deployment**: ECS container running continuously
- **Functionality**: Simulated user traffic every 20 seconds
- **Cost**: Continuous EC2/ECS costs

### New Implementation
- **Technology**: AWS CloudWatch Synthetic Canaries (Node.js)
- **Deployment**: Managed AWS service
- **Functionality**: Scheduled monitoring with configurable intervals
- **Cost**: Pay-per-execution model

## Canary Types

### 1. Pet Search Canary (`pet-search-canary.js`)
- **Purpose**: Monitor pet search functionality
- **Schedule**: Every 5 minutes
- **Tests**: 
  - Basic pet search with parameters
  - Multiple pet type/color combinations
  - Search without parameters
- **Success Criteria**: HTTP 200 responses, response time < 2 seconds

### 2. Adoption Flow Canary (`adoption-flow-canary.js`)
- **Purpose**: Monitor complete adoption workflow
- **Schedule**: Every 10 minutes
- **Tests**:
  - Search for a pet
  - Initiate adoption (TakeMeHome)
  - Complete payment
  - Verify adoption listing
  - Check pet history
- **Success Criteria**: All steps complete successfully, response time < 5 seconds

### 3. Housekeeping Canary (`housekeeping-canary.js`)
- **Purpose**: Monitor application reset functionality
- **Schedule**: Every 15 minutes
- **Tests**:
  - Check current pet history state
  - Perform housekeeping (reset data)
  - Verify data reset effect
  - Check adoption listings
  - Verify home page loads
- **Success Criteria**: HTTP 200 responses, data properly reset

### 4. Load Testing Canary (`load-testing-canary.js`)
- **Purpose**: Simulate higher traffic scenarios
- **Schedule**: Every 30 minutes
- **Tests**:
  - Concurrent pet searches
  - Concurrent adoption listings
  - Concurrent pet history checks
  - Sequential rapid requests
  - Mixed workload testing
- **Success Criteria**: Success rate > 95%, response time < 10 seconds

### 5. Data Integrity Canary (`data-integrity-canary.js`)
- **Purpose**: Verify data consistency across operations
- **Schedule**: Every 20 minutes
- **Tests**:
  - Initial state verification
  - Create test adoption record
  - Verify data consistency
  - Cleanup test data
  - Verify cleanup success
- **Success Criteria**: Data integrity maintained, cleanup successful

## Configuration

### Environment Variables
- `PET_SITE_URL`: Base URL of the Pet Adoptions application
- `timeout`: Request timeout in milliseconds
- `concurrentRequests`: Number of concurrent requests for load testing
- `testIterations`: Number of iterations for rapid testing

### Runtime
- **Node.js Version**: 16.0.0 or higher
- **Dependencies**: None (uses built-in Node.js modules)
- **Timeout**: Configurable per canary (5-20 seconds)

## Deployment

### CDK Integration
The canaries are automatically deployed as part of the CDK stack with:
- IAM roles and permissions
- CloudWatch alarms for failures
- SNS notifications
- S3 artifact storage
- Configurable schedules

### IAM Permissions
- `CloudWatchSyntheticsFullAccess`
- `AWSLambdaBasicExecutionRole`
- Custom permissions for CloudWatch metrics and logs

## Monitoring and Alerting

### CloudWatch Metrics
- Canary success/failure rates
- Response times
- Error counts
- Execution duration

### Alarms
- **Canary Failure Alarm**: Triggers when any canary fails
- **SNS Notifications**: Sends alerts to configured email addresses
- **Threshold**: 1 failure triggers the alarm

### Logs
- Detailed execution logs in CloudWatch Logs
- Request/response details
- Error stack traces
- Performance metrics

## Benefits

### Operational
- **24/7 Monitoring**: Continuous health checks
- **Early Detection**: Identify issues before users are impacted
- **Performance Tracking**: Monitor response times and throughput
- **Automated Testing**: No manual intervention required

### Cost
- **Reduced Infrastructure**: No need for continuous EC2/ECS resources
- **Pay-per-Use**: Only pay for actual executions
- **Managed Service**: AWS handles scaling and maintenance

### Reliability
- **Global Deployment**: Canaries run from multiple AWS regions
- **Built-in Retries**: Automatic retry mechanisms
- **Fault Tolerance**: Isolated from application infrastructure

## Troubleshooting

### Common Issues
1. **Timeout Errors**: Increase timeout values or optimize application performance
2. **Permission Errors**: Verify IAM roles and policies
3. **Network Errors**: Check security groups and VPC configuration
4. **Application Errors**: Review application logs for root causes

### Debugging
- Check CloudWatch Logs for detailed execution information
- Review canary metrics for performance trends
- Verify environment variables and configuration
- Test canary scripts locally if needed

## Local Testing

To test canaries locally:

```bash
# Install dependencies
npm install

# Set environment variables
export PET_SITE_URL="http://localhost:5000"

# Run a canary
node pet-search-canary.js
```

## Maintenance

### Regular Tasks
- Review canary success rates monthly
- Adjust schedules based on application usage
- Update timeout values as needed
- Monitor CloudWatch costs

### Updates
- Modify canary scripts for new application features
- Adjust success criteria based on business requirements
- Add new canaries for additional monitoring needs

## Support

For issues or questions:
1. Check CloudWatch Logs for error details
2. Review CDK deployment logs
3. Verify IAM permissions and roles
4. Test canary scripts locally
5. Check application health and availability


