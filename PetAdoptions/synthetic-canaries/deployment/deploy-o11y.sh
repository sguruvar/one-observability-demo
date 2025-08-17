#!/bin/bash

# Pet Adoptions Synthetic Canaries Deployment Script for o11y profile in ca-central-1
set -e

# Configuration for o11y profile
export AWS_PROFILE=o11y
export AWS_DEFAULT_REGION=ca-central-1
STACK_NAME="SyntheticCanaries"
REGION="ca-central-1"
CANARY_SCHEDULE="rate(5 minutes)"
TRAFFIC_DELAY_TIME="1"
NOTIFICATION_EMAIL=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --notification-email)
            NOTIFICATION_EMAIL="$2"
            shift 2
            ;;
        --traffic-delay-time)
            TRAFFIC_DELAY_TIME="$2"
            shift 2
            ;;
        --schedule)
            CANARY_SCHEDULE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --notification-email EMAIL       Email for failure notifications (optional)"
            echo "  --traffic-delay-time TIME        Traffic delay time multiplier (default: 1)"
            echo "  --schedule SCHEDULE              Canary schedule expression (default: rate(5 minutes))"
            echo "  --help                           Show this help message"
            echo ""
            echo "Example:"
            echo "  $0 --notification-email admin@example.com --traffic-delay-time 2"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_info "=== Pet Adoptions Synthetic Canaries Deployment ==="
print_info "AWS Profile: $AWS_PROFILE"
print_info "Region: $REGION"
print_info "Stack Name: $STACK_NAME"
print_info "Schedule: $CANARY_SCHEDULE"
print_info "Traffic Delay Time: $TRAFFIC_DELAY_TIME"

if [[ -n "$NOTIFICATION_EMAIL" ]]; then
    print_info "Notification Email: $NOTIFICATION_EMAIL"
else
    print_warning "No notification email provided. Alarms will be created without notifications."
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    print_error "AWS CDK is not installed. Please install it first: npm install -g aws-cdk"
    exit 1
fi

# Check AWS credentials for o11y profile
print_info "Checking AWS credentials for o11y profile..."
if ! aws sts get-caller-identity --profile o11y &> /dev/null; then
    print_error "AWS credentials not configured for o11y profile. Please configure it first."
    exit 1
fi

# Get account info
ACCOUNT_ID=$(aws sts get-caller-identity --profile o11y --query Account --output text)
print_info "Deploying to account: $ACCOUNT_ID"

# Get the directory of this script and navigate to CDK project
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
CDK_DIR="$SCRIPT_DIR/../../cdk/pet_stack"

# Check if CDK directory exists
if [[ ! -d "$CDK_DIR" ]]; then
    print_error "CDK directory not found at: $CDK_DIR"
    exit 1
fi

cd "$CDK_DIR"

print_info "Current directory: $(pwd)"

# Install dependencies
print_info "Installing CDK dependencies..."
npm install

# Update CDK context with provided values
print_info "Updating CDK context..."
if [[ -n "$CANARY_SCHEDULE" ]]; then
    cdk context --set canary_schedule "$CANARY_SCHEDULE"
fi

if [[ -n "$TRAFFIC_DELAY_TIME" ]]; then
    cdk context --set traffic_delay_time "$TRAFFIC_DELAY_TIME"
fi

if [[ -n "$NOTIFICATION_EMAIL" ]]; then
    cdk context --set notification_email "$NOTIFICATION_EMAIL"
fi

# Bootstrap CDK (if needed)
print_info "Bootstrapping CDK environment for o11y profile in ca-central-1..."
cdk bootstrap --profile o11y --region ca-central-1

# Build the project
print_info "Building CDK project..."
npm run build

# First, update Services stack to remove traffic generator
print_info "Updating Services stack to remove traffic generator..."
cdk deploy Services --profile o11y --region ca-central-1 --require-approval never

if [[ $? -eq 0 ]]; then
    print_info "Services stack updated successfully (traffic generator removed)"
else
    print_error "Failed to update Services stack"
    exit 1
fi

# Deploy the SyntheticCanaries stack
print_info "Deploying SyntheticCanaries stack..."
cdk deploy SyntheticCanaries --profile o11y --region ca-central-1 --require-approval never

if [[ $? -eq 0 ]]; then
    print_info "=== Deployment Completed Successfully! ==="
    
    # Get stack outputs
    print_info "Stack outputs:"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --profile o11y \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    print_info "=== Next Steps ==="
    print_info "1. View your canary in the AWS Console:"
    print_info "   https://ca-central-1.console.aws.amazon.com/cloudwatch/home?region=ca-central-1#synthetics:canary/list"
    
    print_info "2. Monitor canary executions:"
    print_info "   https://ca-central-1.console.aws.amazon.com/cloudwatch/home?region=ca-central-1#logsV2:log-groups"
    
    print_info "3. Check CloudWatch metrics:"
    print_info "   https://ca-central-1.console.aws.amazon.com/cloudwatch/home?region=ca-central-1#metricsV2:graph=~();namespace=CloudWatchSynthetics"
    
    if [[ -n "$NOTIFICATION_EMAIL" ]]; then
        print_warning "Don't forget to confirm your SNS subscription by checking your email!"
    fi
    
    print_info "=== Canary Behavior ==="
    print_info "• Runs continuously for 15 minutes per execution"
    print_info "• New execution starts every $(echo $CANARY_SCHEDULE | sed 's/rate(\(.*\))/\1/')"
    print_info "• Delay between cycles: $(($TRAFFIC_DELAY_TIME * 20)) seconds"
    print_info "• Performs same workflow as original traffic generator"
    
else
    print_error "CDK deployment failed. Check the output above for details."
    exit 1
fi