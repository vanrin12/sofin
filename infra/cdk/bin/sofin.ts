#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SofinStack } from '../lib/sofin-stack';

const app = new cdk.App();

// Account/region resolve from the standard CDK_DEFAULT_* env (your AWS CLI
// profile) so this stays env-driven — no hard-coded account or region.
new SofinStack(app, 'SofinStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    'Single EC2 host running the Sofin docker-compose stack (services, web/admin, Postgres, RabbitMQ, Caddy).',
});
