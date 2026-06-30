# Use Case 4 — Deploy the Container to ECS Fargate

[← Back to index](./README.md)

**Goal:** run the ECR image as an autoscaled ECS **service** on Fargate, behind an ALB, with logs to CloudWatch, secrets from Secrets Manager, and correct IAM roles.

## Task definition (the key artifact)

```jsonc
{
  "family": "my-api",
  "networkMode": "awsvpc",                 // each task gets its own ENI/IP
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",                            // 0.5 vCPU
  "memory": "1024",                        // 1 GB
  "runtimePlatform": { "cpuArchitecture": "X86_64" }, // or ARM64 for Graviton
  "executionRoleArn": "arn:aws:iam::123:role/ecsTaskExecutionRole",  // pull image + read secrets + logs
  "taskRoleArn": "arn:aws:iam::123:role/myApiTaskRole",               // APP's AWS permissions
  "containerDefinitions": [{
    "name": "api",
    "image": "123.dkr.ecr.us-east-1.amazonaws.com/my-api:abc123",     // immutable tag
    "essential": true,
    "portMappings": [{ "containerPort": 3000 }],
    "environment": [{ "name": "NODE_ENV", "value": "production" }],
    "secrets": [
      { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/db" }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/health/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))\""],
      "interval": 15, "timeout": 3, "retries": 3, "startPeriod": 20
    },
    "stopTimeout": 30,                        // grace period for SIGTERM draining
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/my-api",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "api"
      }
    }
  }]
}
```

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
```

## Service behind an ALB with autoscaling

```bash
aws ecs create-service \
  --cluster prod \
  --service-name my-api \
  --task-definition my-api \
  --desired-count 2 \                       # spread across 2 AZs
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-a,subnet-b],securityGroups=[sg-123],assignPublicIp=DISABLED}" \
  --load-balancers "targetGroupArn=arn:...:targetgroup/my-api/abc,containerName=api,containerPort=3000" \
  --health-check-grace-period-seconds 30 \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200"   # rolling, zero-downtime

# Target-tracking autoscaling on requests-per-target (good for I/O-bound Node)
aws application-autoscaling register-scalable-target \
  --service-namespace ecs --resource-id service/prod/my-api \
  --scalable-dimension ecs:service:DesiredCount --min-capacity 2 --max-capacity 20
```

## The two IAM roles (a classic interview point)
- **Execution role** (`ecsTaskExecutionRole`): lets **ECS itself** pull the image from ECR, fetch `secrets` from Secrets Manager/SSM, and write logs to CloudWatch.
- **Task role** (`myApiTaskRole`): grants **your application code** its runtime AWS permissions (e.g., `s3:PutObject`, `dynamodb:GetItem`) — scoped to exact ARNs (least privilege).

## How a deploy stays zero-downtime
1. New tasks start with the new image and must pass the **ALB health check** (`/health/ready`).
2. Old tasks are sent **SIGTERM**; the app **drains** in-flight requests (graceful shutdown) within `stopTimeout`.
3. ALB **deregistration delay** stops routing to draining tasks first.
4. `minimumHealthyPercent=100` keeps full capacity throughout. (Use **CodeDeploy blue/green** for canary shifting + alarm-based auto-rollback.)

## Lead-level notes
- **Autoscale on ALB requests-per-target** (Node is often I/O-bound; CPU alone misleads).
- **Multi-AZ** (`desired-count ≥ 2`, subnets in 2 AZs) for availability.
- **Private subnets** for tasks (`assignPublicIp=DISABLED`) + **VPC endpoints** for ECR/Secrets/S3 to avoid NAT cost and keep traffic private.
- **Fargate Spot** for stateless/queue workers to cut cost.
