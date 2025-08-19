#!/bin/bash

# Synthetic Canaries Deployment Script
# This script deploys the synthetic canaries stack for the pet adoption system

set -e

echo "🚀 Deploying Synthetic Canaries Stack..."

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo "❌ CDK CLI not found. Please install it first:"
    echo "   npm install -g aws-cdk"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "cdk.json" ]; then
    echo "❌ Please run this script from the CDK project directory"
    exit 1
fi

# Build the project
echo "📦 Building project..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix the errors and try again."
    exit 1
fi

echo "✅ Build successful!"

# Check if we need to bootstrap CDK
echo "🔍 Checking CDK bootstrap status..."
if ! cdk bootstrap --check; then
    echo "⚠️  CDK bootstrap required. Running bootstrap..."
    cdk bootstrap
fi

# Deploy the synthetic canaries stack
echo "🚀 Deploying Synthetic Canaries stack..."
cdk deploy SyntheticCanaries --require-approval never

if [ $? -eq 0 ]; then
    echo "✅ Synthetic Canaries deployed successfully!"
    echo ""
    echo "📊 Next steps:"
    echo "   1. Check CloudWatch Synthetics console for your canaries"
    echo "   2. Monitor canary execution logs"
    echo "   3. Set up CloudWatch alarms if needed"
    echo "   4. Configure SNS notifications for alerts"
    echo ""
    echo "🔗 Useful links:"
    echo "   - CloudWatch Synthetics: https://console.aws.amazon.com/cloudwatch/synthetics"
    echo "   - CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home#logs"
    echo "   - CloudWatch Alarms: https://console.aws.amazon.com/cloudwatch/home#alarms"
else
    echo "❌ Deployment failed. Please check the error messages above."
    exit 1
fi
