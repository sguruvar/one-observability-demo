#!/bin/bash

# Specreq Queue Rotation Deployment Script
set -e

# Configuration
STACK_NAME="specreq-rotation-system"
REGION="us-east-1"
NOTIFICATION_EMAIL=""
SLACK_WEBHOOK_URL=""
ROTATION_SCHEDULE="cron(0 9 ? * MON *)"  # Every Monday at 9 AM UTC

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
        --notification-email)
            NOTIFICATION_EMAIL="$2"
            shift 2
            ;;
        --slack-webhook-url)
            SLACK_WEBHOOK_URL="$2"
            shift 2
            ;;
        --schedule)
            ROTATION_SCHEDULE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --stack-name STACK_NAME           CloudFormation stack name (default: specreq-rotation-system)"
            echo "  --region REGION                   AWS region (default: us-east-1)"
            echo "  --notification-email EMAIL       Email for rotation notifications (optional)"
            echo "  --slack-webhook-url URL           Slack webhook URL for notifications (optional)"
            echo "  --schedule SCHEDULE               EventBridge schedule expression (default: cron(0 9 ? * MON *))"
            echo "  --help                           Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --notification-email admin@example.com"
            echo "  $0 --notification-email admin@example.com --schedule 'cron(0 10 ? * MON *)'"
            echo "  $0 --slack-webhook-url https://hooks.slack.com/services/..."
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_info "=== Specreq Queue Rotation System Deployment ==="
print_info "Stack Name: $STACK_NAME"
print_info "Region: $REGION"
print_info "Schedule: $ROTATION_SCHEDULE"

if [[ -n "$NOTIFICATION_EMAIL" ]]; then
    print_info "Notification Email: $NOTIFICATION_EMAIL"
else
    print_warning "No notification email provided. SNS notifications will be disabled."
fi

if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
    print_info "Slack webhook configured"
else
    print_warning "No Slack webhook provided. Slack notifications will be disabled."
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

# Get account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
print_info "Deploying to account: $ACCOUNT_ID"

# Check if template exists
TEMPLATE_PATH="specreq-rotation-infrastructure.yaml"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
    print_error "CloudFormation template not found at: $TEMPLATE_PATH"
    exit 1
fi

# Prepare parameters
PARAMETERS="ParameterKey=RotationSchedule,ParameterValue=\"$ROTATION_SCHEDULE\""

if [[ -n "$NOTIFICATION_EMAIL" ]]; then
    PARAMETERS="$PARAMETERS ParameterKey=NotificationEmail,ParameterValue=$NOTIFICATION_EMAIL"
fi

if [[ -n "$SLACK_WEBHOOK_URL" ]]; then
    PARAMETERS="$PARAMETERS ParameterKey=SlackWebhookUrl,ParameterValue=$SLACK_WEBHOOK_URL"
fi

# Check if stack exists
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &> /dev/null; then
    print_info "Stack exists. Updating..."
    OPERATION="update-stack"
else
    print_info "Stack does not exist. Creating..."
    OPERATION="create-stack"
fi

# Deploy the stack
print_info "Deploying CloudFormation stack..."

aws cloudformation $OPERATION \
    --stack-name "$STACK_NAME" \
    --template-body file://"$TEMPLATE_PATH" \
    --parameters $PARAMETERS \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION"

if [[ $? -eq 0 ]]; then
    print_info "CloudFormation operation initiated successfully"
    
    # Wait for stack operation to complete
    print_info "Waiting for stack operation to complete..."
    
    if [[ "$OPERATION" == "create-stack" ]]; then
        aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME" --region "$REGION"
    else
        aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" --region "$REGION"
    fi
    
    if [[ $? -eq 0 ]]; then
        print_info "=== Deployment Completed Successfully! ==="
        
        # Get stack outputs
        print_info "Stack outputs:"
        aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
            --output table
        
        print_info "=== Next Steps ==="
        print_info "1. The rotation will start automatically based on your schedule: $ROTATION_SCHEDULE"
        print_info "2. Current assignee will be stored in SSM parameter: /specreq/current-assignee"
        print_info "3. You can manually trigger rotation by invoking the Lambda function"
        print_info "4. View Lambda logs in CloudWatch: /aws/lambda/specreq-rotation-lambda"
        
        if [[ -n "$NOTIFICATION_EMAIL" ]]; then
            print_warning "Don't forget to confirm your SNS subscription by checking your email!"
        fi
        
        # Show team rotation
        print_info "=== Team Rotation Order ==="
        echo "@babussr → @koffir → @andress → @achandap → @ashishmb → @garrjh → @jshijj → @jalioto → @lvieiras → @faracm → @mevelez → @anaele → @kurampil → @aliving → @vsharmro → @sasikmal → @sshasan → @gurusiva → @vikrvenk"
        
        print_info "=== Manual Commands ==="
        print_info "Get current assignee:"
        print_info "  aws ssm get-parameter --name '/specreq/current-assignee' --region $REGION"
        print_info ""
        print_info "Manually trigger rotation:"
        print_info "  aws lambda invoke --function-name specreq-rotation-lambda --region $REGION response.json"
        
    else
        print_error "Stack operation failed. Check the CloudFormation console for details."
        exit 1
    fi
else
    print_error "Failed to initiate CloudFormation operation"
    exit 1
fi