# Use Case 3 — Build & Push to Amazon ECR

[← Back to index](./README.md)

**Goal:** build the Node image and push it to a private **ECR** repository, tagged for reproducible deploys.

## 1. Create the repository (once)

```bash
aws ecr create-repository \
  --repository-name my-api \
  --image-scanning-configuration scanOnPush=true \   # scan for CVEs on push
  --image-tag-mutability IMMUTABLE                    # prevent overwriting a tag
```

## 2. Authenticate Docker to ECR

```bash
ACCOUNT=123456789012
REGION=us-east-1
REGISTRY=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $REGISTRY
```

## 3. Build, tag, push (tag with the git SHA, not :latest)

```bash
TAG=$(git rev-parse --short HEAD)      # immutable, traceable tag

docker build -t my-api:$TAG .
docker tag my-api:$TAG $REGISTRY/my-api:$TAG

docker push $REGISTRY/my-api:$TAG
```

## 4. (Optional) Multi-arch build for Graviton (ARM64)

```bash
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t $REGISTRY/my-api:$TAG \
  --push .
```

## 5. Verify & read scan results

```bash
aws ecr describe-images --repository-name my-api --image-ids imageTag=$TAG
aws ecr describe-image-scan-findings --repository-name my-api --image-id imageTag=$TAG
```

## Lifecycle policy (control cost — expire old images)

```json
{
  "rules": [{
    "rulePriority": 1,
    "description": "Keep last 10 images",
    "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10 },
    "action": { "type": "expire" }
  }]
}
```

## Lead-level notes
- **Tag with the git SHA** (or semantic version), never rely on `:latest` in production — you need immutable, rollback-able references.
- **`IMMUTABLE` tags + `scanOnPush`** enforce reproducibility and catch vulnerabilities early; gate your pipeline on critical findings.
- **Least privilege:** the CI role needs only `ecr:GetAuthorizationToken` + push/pull on the specific repo.
- **Lifecycle policies** stop ECR storage cost from creeping up as you accumulate images.
- Prefer **OIDC federation** (GitHub Actions → AWS) over long-lived access keys for CI (see use case 5).
