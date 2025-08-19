#!/bin/bash

# Deploy CloudWatch Synthetic Canaries directly using AWS CLI
# This bypasses CDK deployment issues

set -e

REGION="ap-southeast-1"
PROFILE="o11y"
STACK_NAME="syntheticcanaries"

echo "Deploying CloudWatch Synthetic Canaries to $REGION..."

# Get SSM parameter values
PET_SITE_URL=$(aws ssm get-parameter --name "/petstore/petsiteurl" --region $REGION --profile $PROFILE --query "Parameter.Value" --output text)
SEARCH_API_URL=$(aws ssm get-parameter --name "/petstore/searchapiurl" --region $REGION --profile $PROFILE --query "Parameter.Value" --output text)

echo "PetSite URL: $PET_SITE_URL"
echo "Search API URL: $SEARCH_API_URL"

# Create S3 bucket for canary artifacts
BUCKET_NAME="${STACK_NAME}-canary-artifacts-$(aws sts get-caller-identity --profile $PROFILE --query Account --output text)-${REGION}"
echo "Creating S3 bucket: $BUCKET_NAME"

aws s3 mb s3://$BUCKET_NAME --region $REGION --profile $PROFILE
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET_NAME --region $REGION --profile $PROFILE --lifecycle-configuration '{
  "Rules": [
    {
      "ID": "DeleteOldArtifacts",
      "Status": "Enabled",
      "Expiration": {
        "Days": 30
      }
    }
  ]
}'

# Create IAM role for canaries
ROLE_NAME="${STACK_NAME}-canary-execution-role-${REGION}"
echo "Creating IAM role: $ROLE_NAME"

# Create trust policy
cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role --role-name $ROLE_NAME --assume-role-policy-document file://trust-policy.json --profile $PROFILE

# Attach managed policy
aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn arn:aws:iam::aws:policy/CloudWatchSyntheticsFullAccess --profile $PROFILE

# Add S3 permissions
aws iam put-role-policy --role-name $ROLE_NAME --policy-name S3Permissions --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:DeleteObject\"],
      \"Resource\": \"arn:aws:s3:::$BUCKET_NAME/*\"
    },
    {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:ListBucket\"],
      \"Resource\": \"arn:aws:s3:::$BUCKET_NAME\"
    }
  ]
}" --profile $PROFILE

# Wait for role to be available
echo "Waiting for IAM role to be available..."
sleep 10

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --profile $PROFILE --query 'Role.Arn' --output text)

# Create canary artifacts
echo "Creating canary artifacts..."

# Create a temporary directory for the canary code
TEMP_DIR=$(mktemp -d)
cp canary-code/*.js $TEMP_DIR/

# Create zip file for each canary
cd $TEMP_DIR

# API Health Canary
zip -r api-health-canary.zip api-health-canary.js
aws s3 cp api-health-canary.zip s3://$BUCKET_NAME/canary-code/ --profile $PROFILE

# Pet Adoption Workflow Canary
zip -r pet-adoption-workflow-canary.zip pet-adoption-workflow-canary.js
aws s3 cp pet-adoption-workflow-canary.zip s3://$BUCKET_NAME/canary-code/ --profile $PROFILE

# Pet Search Canary
zip -r pet-search-canary.zip pet-search-canary.js
aws s3 cp pet-search-canary.zip s3://$BUCKET_NAME/canary-code/ --profile $PROFILE

cd -

# Create the canaries
echo "Creating canaries..."

# API Health Canary
aws synthetics create-canary \
  --name "${STACK_NAME}-api-health-canary-${REGION}" \
  --artifact-s3-location "s3://$BUCKET_NAME/canary-code/api-health-canary.zip" \
  --execution-role-arn "$ROLE_ARN" \
  --runtime-version "syn-nodejs-puppeteer-9.1" \
  --schedule "rate(1 minute)" \
  --run-config '{"TimeoutInSeconds": 60}' \
  --region $REGION \
  --profile $PROFILE

# Pet Adoption Workflow Canary
aws synthetics create-canary \
  --name "${STACK_NAME}-pet-adoption-workflow-canary-${REGION}" \
  --artifact-s3-location "s3://$BUCKET_NAME/canary-code/pet-adoption-workflow-canary.zip" \
  --execution-role-arn "$ROLE_ARN" \
  --runtime-version "syn-nodejs-puppeteer-9.1" \
  --schedule "rate(1 minute)" \
  --run-config '{"TimeoutInSeconds": 60}' \
  --region $REGION \
  --profile $PROFILE

# Pet Search Canary
aws synthetics create-canary \
  --name "${STACK_NAME}-pet-search-canary-${REGION}" \
  --artifact-s3-location "s3://$BUCKET_NAME/canary-code/pet-search-canary.zip" \
  --execution-role-arn "$ROLE_ARN" \
  --runtime-version "syn-nodejs-puppeteer-9.1" \
  --schedule "rate(1 minute)" \
  --run-config '{"TimeoutInSeconds": 60}' \
  --region $REGION \
  --profile $PROFILE

# Clean up
rm -rf $TEMP_DIR
rm -f trust-policy.json

echo "Canaries created successfully!"
echo "Starting canaries..."

# Start all canaries
aws synthetics start-canary --name "${STACK_NAME}-api-health-canary-${REGION}" --region $REGION --profile $PROFILE
aws synthetics start-canary --name "${STACK_NAME}-pet-adoption-workflow-canary-${REGION}" --region $REGION --profile $PROFILE
aws synthetics start-canary --name "${STACK_NAME}-pet-search-canary-${REGION}" --region $REGION --profile $PROFILE

echo "All canaries started!"
echo "Check status with: aws synthetics describe-canaries --region $REGION --profile $PROFILE"
