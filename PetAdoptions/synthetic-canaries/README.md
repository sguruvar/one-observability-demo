# Pet Adoptions Synthetic Canaries

This directory contains AWS CloudWatch Synthetic Canaries that replace the .NET traffic generator with serverless continuous monitoring.

## Canary Overview

**continuous-traffic-generator-canary** - Runs continuously like the original traffic generator, performing:
- Housekeeping operations
- Pet data loading
- Random pet adoption workflows (5 to total pets count)
- Payment processing
- Adoption history management

## Architecture

The canary is deployed using AWS CDK and automatically retrieves endpoint URLs from the existing Pet Adoptions infrastructure via SSM parameters:
- Pet Site URL: `/petstore/petsiteurl`
- Search API URL: `/petstore/searchapiurl`

## Execution Model

**Continuous Operation**: Each canary execution runs for up to 15 minutes, performing multiple traffic generation cycles with configurable delays between cycles (just like the original traffic generator).

- **Schedule**: How often to start a new 15-minute continuous session (default: every 5 minutes)
- **Traffic Delay**: Delay between cycles within each session (default: 1 * 20 seconds = 20 seconds)
- **Load Generation**: Random number of adoptions per cycle (5 to total pets available)
- **History Cleanup**: Automatically deletes adoption history when load > 20 pets

## Deployment

### Prerequisites
1. Deploy the main Pet Adoptions infrastructure first (Services and Applications stacks)
2. Ensure AWS CDK is installed: `npm install -g aws-cdk`
3. Configure AWS credentials

### Quick Deployment
```bash
cd PetAdoptions/cdk/pet_stack
npm install
npm run build
cdk deploy SyntheticCanaries
```

### Custom Deployment
```bash
# Use the deployment script with options
./PetAdoptions/synthetic-canaries/deployment/deploy.sh \
  --notification-email your-email@example.com \
  --schedule "rate(10 minutes)" \
  --traffic-delay-time 2
```

## Configuration

The canary automatically retrieves URLs from existing infrastructure. Optional configuration:
- `notification_email` - Email for failure notifications
- `canary_schedule` - How often to start new continuous sessions (default: rate(5 minutes))
- `traffic_delay_time` - Multiplier for delay between cycles (default: 1 = 20 seconds)

## Monitoring

After deployment, view your canary in the AWS Console:
- CloudWatch Synthetics: https://console.aws.amazon.com/cloudwatch/home#synthetics:canary/list
- CloudWatch Alarms: https://console.aws.amazon.com/cloudwatch/home#alarmsV2:

Each execution will show:
- Number of cycles completed
- Pets processed per cycle
- Individual step success/failure
- Execution tags for detailed tracking

## Migration from Traffic Generator

This replaces the containerized .NET traffic generator with:
- ✅ **Same continuous behavior** - Runs multiple cycles with delays
- ✅ **Same workflow logic** - Identical pet adoption process
- ✅ **Same load patterns** - Random load generation and history cleanup
- ✅ **Serverless execution** - No infrastructure to manage
- ✅ **Built-in monitoring** - Rich CloudWatch metrics and logs
- ✅ **Cost optimization** - Pay only for execution time