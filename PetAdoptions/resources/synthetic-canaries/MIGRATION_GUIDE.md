# Migration Guide: .NET Traffic Generator to Synthetic Canaries

This guide provides step-by-step instructions for migrating from the existing .NET traffic generator to AWS CloudWatch Synthetic Canaries.

## Prerequisites

- AWS CDK v2 installed and configured
- Access to AWS account with appropriate permissions
- Pet Adoptions application deployed and accessible
- Understanding of the current traffic generator functionality

## Migration Steps

### Phase 1: Preparation

#### 1.1 Backup Current Configuration
```bash
# Backup the current traffic generator configuration
# Traffic generator has been removed and replaced with synthetic canaries

# Backup current CDK stack configuration
cp PetAdoptions/cdk/pet_stack/lib/services.ts PetAdoptions/cdk/pet_stack/lib/services.ts.backup
```

#### 1.2 Verify Application Endpoints
Ensure all endpoints used by the traffic generator are accessible:
- Pet search: `/{baseUrl}/?selectedPetType={type}&selectedPetColor={color}`
- Adoption: `/{baseUrl}/Adoption/TakeMeHome`
- Payment: `/{baseUrl}/Payment/MakePayment`
- Listings: `/{baseUrl}/PetListAdoptions`
- History: `/{baseUrl}/pethistory`
- Housekeeping: `/{baseUrl}/housekeeping/`

#### 1.3 Review Current Traffic Patterns
Analyze the existing traffic generator to understand:
- Request frequencies and patterns
- Error handling and retry logic
- Performance thresholds
- Data cleanup procedures

### Phase 2: Synthetic Canary Implementation

#### 2.1 Deploy Synthetic Canaries
```bash
# Navigate to CDK directory
cd PetAdoptions/cdk/pet_stack

# Install dependencies
npm install

# Deploy the stack with synthetic canaries
npm run cdk deploy
```

#### 2.2 Verify Canary Deployment
Check AWS Console for:
- CloudWatch > Synthetics > Canaries
- IAM roles and policies
- CloudWatch alarms
- S3 artifact buckets

#### 2.3 Test Canary Functionality
```bash
# Test individual canaries locally
cd ../../resources/synthetic-canaries

# Test pet search canary
export PET_SITE_URL="http://your-app-url"
node pet-search-canary.js

# Test adoption flow canary
node adoption-flow-canary.js
```

### Phase 3: Validation and Testing

#### 3.1 Monitor Canary Execution
- Check CloudWatch Logs for execution details
- Verify metrics are being collected
- Confirm alarms are working correctly
- Test SNS notifications

#### 3.2 Performance Comparison
Compare synthetic canaries with previous traffic generator:
- Response times
- Success rates
- Error patterns
- Resource utilization

#### 3.3 End-to-End Testing
Run comprehensive tests:
- All canary types execute successfully
- Alerts trigger on failures
- Data integrity maintained
- Application performance unaffected

### Phase 4: Traffic Generator Decommissioning

#### 4.1 Gradual Traffic Reduction
```bash
# Option 1: Reduce traffic generator frequency
# Update the trafficdelaytime parameter in SSM
aws ssm put-parameter \
  --name "/petstore/trafficdelaytime" \
  --value "5" \
  --type "String" \
  --overwrite

# Option 2: Scale down ECS service
aws ecs update-service \
  --cluster your-cluster \
  --service traffic-generator \
  --desired-count 0
```

#### 4.2 Monitor Application Health
During the transition period:
- Watch for any performance degradation
- Monitor error rates
- Check synthetic canary success rates
- Verify business metrics remain stable

#### 4.3 Complete Decommissioning
```bash
# Remove traffic generator from CDK stack
# TrafficGeneratorService has been removed from services.ts

# Remove ECS service
aws ecs delete-service \
  --cluster your-cluster \
  --service traffic-generator \
  --force

# Clean up resources
aws ecs deregister-task-definition \
  --task-definition traffic-generator:1
```

### Phase 5: Post-Migration Activities

#### 5.1 Update Monitoring and Alerting
- Configure CloudWatch dashboards for synthetic canaries
- Set up additional alarms if needed
- Update runbooks and documentation
- Train operations team on new monitoring

#### 5.2 Performance Optimization
- Adjust canary schedules based on usage patterns
- Optimize timeout values and retry logic
- Fine-tune success criteria
- Add new canaries for additional monitoring needs

#### 5.3 Documentation Updates
- Update operational procedures
- Document canary configurations
- Create troubleshooting guides
- Update incident response playbooks

## Rollback Plan

### Immediate Rollback
If issues arise during migration:
```bash
# Restore traffic generator
aws ecs update-service \
  --cluster your-cluster \
  --service traffic-generator \
  --desired-count 1

# Revert CDK changes
cd PetAdoptions/cdk/pet_stack
npm run cdk destroy --force
git checkout services.ts.backup
npm run cdk deploy
```

### Partial Rollback
If specific canaries have issues:
```bash
# Disable problematic canaries
aws synthetics stop-canary --name your-canary-name

# Adjust canary schedules
aws synthetics update-canary \
  --name your-canary-name \
  --schedule-expression "rate(0 minutes)"
```

## Success Criteria

### Technical Requirements
- [ ] All synthetic canaries deploy successfully
- [ ] Canaries execute on schedule without errors
- [ ] CloudWatch metrics and logs are collected
- [ ] Alarms trigger correctly on failures
- [ ] SNS notifications are delivered

### Business Requirements
- [ ] Application monitoring coverage maintained or improved
- [ ] No degradation in application performance
- [ ] Cost reduction achieved
- [ ] Operational efficiency improved
- [ ] Team productivity enhanced

### Operational Requirements
- [ ] Monitoring dashboards updated
- [ ] Team trained on new tools
- [ ] Documentation updated
- [ ] Runbooks revised
- [ ] Incident response procedures updated

## Timeline

### Week 1: Preparation and Planning
- Complete prerequisites
- Backup current configuration
- Review and analyze current setup

### Week 2: Implementation
- Deploy synthetic canaries
- Configure monitoring and alerting
- Test basic functionality

### Week 3: Validation
- Comprehensive testing
- Performance validation
- Team training

### Week 4: Migration
- Gradual traffic reduction
- Monitor and validate
- Complete decommissioning

### Week 5: Post-Migration
- Performance optimization
- Documentation updates
- Process improvements

## Risk Mitigation

### Technical Risks
- **Canary failures**: Implement comprehensive error handling and retry logic
- **Performance impact**: Test thoroughly in staging environment
- **Configuration errors**: Use infrastructure as code and version control

### Operational Risks
- **Knowledge gaps**: Provide comprehensive training and documentation
- **Process changes**: Update runbooks and procedures before migration
- **Monitoring gaps**: Implement redundant monitoring during transition

### Business Risks
- **Service disruption**: Use gradual migration approach
- **Data loss**: Maintain backups and verify data integrity
- **Cost overruns**: Monitor CloudWatch costs and optimize schedules

## Support and Resources

### Documentation
- [AWS CloudWatch Synthetics User Guide](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics.html)
- [CDK Synthetics Constructs](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_synthetics-readme.html)
- [Pet Adoptions Synthetic Canaries README](./README.md)

### AWS Support
- AWS Support Center for technical issues
- AWS Solutions Architect for architectural guidance
- AWS Professional Services for implementation support

### Internal Resources
- DevOps team for deployment support
- Application team for endpoint validation
- Operations team for monitoring setup
- Security team for IAM review

## Conclusion

This migration represents a significant improvement in monitoring capabilities while reducing operational overhead and costs. The synthetic canaries provide more reliable, scalable, and cost-effective monitoring compared to the previous .NET traffic generator.

By following this guide and maintaining careful oversight throughout the process, the migration should be completed successfully with minimal disruption to the application and operations.

