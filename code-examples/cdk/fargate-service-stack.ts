/**
 * ECS Fargate service behind an ALB with autoscaling, via AWS CDK (Q40, Q44, Q46).
 *
 * Demonstrates the canonical container deployment:
 *  - Multi-AZ VPC, Fargate service across AZs.
 *  - ALB with a readiness health check.
 *  - Secrets injected at runtime from Secrets Manager (not baked into the image).
 *  - Distinct task role (app permissions) vs execution role (pull image / read
 *    secrets) — least privilege.
 *  - Target-tracking autoscaling on CPU and ALB requests-per-target.
 *
 * Packages: aws-cdk-lib, constructs
 */
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

export class FargateServiceStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Multi-AZ VPC for high availability (Q52).
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc, containerInsights: true });

    // App secrets (e.g., DB credentials) created/managed outside the image.
    const dbSecret = secretsmanager.Secret.fromSecretNameV2(this, 'DbSecret', 'prod/app/db');

    // ALB + Fargate service in one construct; runs containers in private subnets.
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Svc', {
      cluster,
      desiredCount: 2, // start across 2 AZs
      cpu: 512,
      memoryLimitMiB: 1024,
      publicLoadBalancer: true,
      circuitBreaker: { rollback: true }, // auto-rollback failed deploys (Q36)
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('123456789012.dkr.ecr.us-east-1.amazonaws.com/app:latest'),
        containerPort: 3000,
        environment: { NODE_ENV: 'production' },
        // Secrets are resolved at runtime and injected as env vars securely.
        secrets: {
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
        },
      },
    });

    // Readiness health check (Q51/Q93): LB only routes to healthy tasks.
    service.targetGroup.configureHealthCheck({
      path: '/health/ready',
      healthyThresholdCount: 2,
      interval: Duration.seconds(15),
    });

    // Connection draining so in-flight requests finish on deploy/scale-in (Q9).
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');

    // Least-privilege app permission example (task role, NOT execution role).
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
        resources: ['arn:aws:dynamodb:us-east-1:123456789012:table/app-*'],
      }),
    );

    // Autoscaling: target tracking on CPU and ALB requests-per-target (Q46).
    const scaling = service.service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 20 });
    scaling.scaleOnCpuUtilization('Cpu', { targetUtilizationPercent: 60 });
    scaling.scaleOnRequestCount('Rps', {
      requestsPerTarget: 1000,
      targetGroup: service.targetGroup,
    });
  }
}
