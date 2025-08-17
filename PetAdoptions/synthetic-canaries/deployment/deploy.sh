#!/bin/bash

# Pet Adoptions Synthetic Canaries CDK Deployment Script
set -e

# Configuration
STACK_NAME="SyntheticCanaries"
REGION="us-east-1"
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
        --stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --profile)
            AWS_PROFILE="$2"
            shift 2
            ;;
        --schedule)
            CANARY_SCHEDULE="$2"
            shift 2
            ;;
        --traffic-delay-time)
            TRAFFIC_DELAY_TIME="$2"
            shift 2
            ;;
        --notification-email)
            NOTIFICATION_EMAIL="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --stack-name STACK_NAME           CDK stack name (default: SyntheticCanaries)"
            echo "  --region REGION                   AWS region (default: ca-central-1)"
            echo "  --profile PROFILE                 AWS profile (default: o11y)"

            echo "  --schedule SCHEDULE              Canary schedule expression (default: rate(5 minutes))"
            echo "  --traffic-delay-time TIME        Traffic delay time multiplier (default: 1)"
            echo "  --notification-email EMAIL       Email for failure notifications (optional)"
            echo "  --help                           Show this help message"
            echo ""
            echo "Example:"
            echo "  $0 --notification-email admin@example.com --schedule 'rate(10 minutes)' --traffic-delay-time 2"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# No validation needed - URLs will be retrieved from existing infrastructure

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

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

print_info "Starting deployment of Pet Adoptions Synthetic Canaries using CDK"
print_info "Stack Name: $STACK_NAME"
print_info "Region: $REGION"
print_info "Schedule: $CANARY_SCHEDULE"
print_info "Traffic Delay Time: $TRAFFIC_DELAY_TIME"
print_info "URLs will be retrieved from existing infrastructure via SSM parameters"

if [[ -n "$NOTIFICATION_EMAIL" ]]; then
    print_info "Notification Email: $NOTIFICATION_EMAIL"
else
    print_warning "No notification email provided. Alarms will be created without notifications."
fi

# Get the directory of this script and navigate to CDK project
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
CDK_DIR="$SCRIPT_DIR/../../cdk/pet_stack"

# Check if CDK directory exists
if [[ ! -d "$CDK_DIR" ]]; then
    print_error "CDK directory not found at: $CDK_DIR"
    exit 1
fi

cd "$CDK_DIR"

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
print_info "Bootstrapping CDK environment..."
cdk bootstrap --region "$REGION"

# Build the project
print_info "Building CDK project..."
npm run build

# Deploy the stack
print_info "Deploying CDK stack..."
cdk deploy "$STACK_NAME" --region "$REGION" --require-approval never

if [[ $? -eq 0 ]]; then
    print_info "CDK deployment completed successfully!"
    
    # Get stack outputs
    print_info "Stack outputs:"
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    print_info "Deployment completed successfully!"
    print_info "You can view your canaries in the AWS Console:"
    print_info "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#synthetics:canary/list"
    
    if [[ -n "$NOTIFICATION_EMAIL" ]]; then
        print_warning "Don't forget to confirm your SNS subscription by checking your email!"
    fi
    
else
    print_error "CDK deployment failed. Check the output above for details."
    exit 1
fi