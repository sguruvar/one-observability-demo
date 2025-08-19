#!/usr/bin/env node
import { Services } from '../lib/services';
import { Applications } from '../lib/applications';
import { SyntheticCanaries } from '../lib/synthetic-canaries';
//import { EKSPetsite } from '../lib/ekspetsite'
import { App, Tags, Aspects } from 'aws-cdk-lib';
//import { AwsSolutionsChecks } from 'cdk-nag';


const stackName = "Services";
const app = new App();

const stack = new Services(app, stackName, { 
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'ap-southeast-1'  // Explicitly set to ap-southeast-1 for testing
}});

const applications = new Applications(app, "Applications", {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'ap-southeast-1'  // Explicitly set to ap-southeast-1 for testing
}});

const syntheticCanaries = new SyntheticCanaries(app, "SyntheticCanaries", {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'ap-southeast-1'  // Explicitly set to ap-southeast-1 for testing
}});

Tags.of(app).add("Workshop","true")
//Aspects.of(stack).add(new AwsSolutionsChecks({verbose: true}));
//Aspects.of(applications).add(new AwsSolutionsChecks({verbose: true}));
//Aspects.of(syntheticCanaries).add(new AwsSolutionsChecks({verbose: true}));
