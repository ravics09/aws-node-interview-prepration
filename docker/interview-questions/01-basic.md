# Docker Interview Questions — Basic

[← Back to index](./README.md) · Context: **Node.js + AWS**

---

### Q1. What is Docker and what problem does it solve?

**Answer.** Docker is a platform for building, shipping, and running applications in **containers** — lightweight, isolated, portable units that bundle your code with its runtime, libraries, and dependencies. It solves the **"works on my machine"** problem: the same image runs identically on a laptop, CI, and AWS ECS/EKS.

**Node + AWS angle:** A Node app + its exact Node version + native modules are packaged into one image. That same image runs in local dev, gets pushed to **ECR**, and runs on **ECS Fargate** — no environment drift.

---

### Q2. What's the difference between an image and a container?

**Answer.**
- **Image** — an immutable, read-only template (layers) built from a Dockerfile. It's the "class."
- **Container** — a running (or stopped) instance of an image, with a thin writable layer on top. It's the "object."

You build an image once and run many containers from it.

```bash
docker build -t my-node-api:1.0 .      # produce an image
docker run -p 3000:3000 my-node-api:1.0 # run a container from it
```

---

### Q3. How is a container different from a virtual machine (VM)?

**Answer.**
- **VM** virtualizes **hardware** and runs a full **guest OS** on a hypervisor — heavy (GBs), slow to boot (minutes).
- **Container** virtualizes the **OS** — shares the host kernel, isolating processes via Linux namespaces + cgroups. Lightweight (MBs), starts in milliseconds.

**Lead-level note:** Containers' fast startup + small footprint are why they scale and deploy quickly on ECS/EKS. VMs give stronger isolation; containers give density and speed (Fargate adds VM-level isolation per task under the hood).

---

### Q4. What is a Dockerfile? Explain the common instructions.

**Answer.** A Dockerfile is a text recipe of instructions to build an image.

```dockerfile
FROM node:20-slim          # base image
WORKDIR /app               # working directory inside the image
COPY package*.json ./      # copy dependency manifests first (layer caching)
RUN npm ci --omit=dev      # run a build-time command
COPY . .                   # copy the rest of the source
ENV NODE_ENV=production    # environment variable
EXPOSE 3000                # document the listening port
USER node                  # run as non-root
CMD ["node", "dist/main.js"] # default process when a container starts
```

Key instructions: `FROM`, `WORKDIR`, `COPY`/`ADD`, `RUN`, `ENV`, `ARG`, `EXPOSE`, `USER`, `ENTRYPOINT`, `CMD`, `HEALTHCHECK`.

---

### Q5. What are Docker image layers and why do they matter?

**Answer.** Each Dockerfile instruction creates a **layer**; layers are cached and reused. If a layer's inputs haven't changed, Docker reuses the cache instead of rebuilding — making builds faster and images smaller (shared layers).

**Node best practice (cache optimization):** copy `package*.json` and `npm ci` **before** copying source, so dependency installation is only re-run when dependencies change — not on every code change.

```dockerfile
COPY package*.json ./
RUN npm ci            # cached unless package files change
COPY . .              # changes here don't bust the npm layer
```

---

### Q6. What's the difference between `CMD` and `ENTRYPOINT`?

**Answer.**
- **`ENTRYPOINT`** — the fixed executable that always runs.
- **`CMD`** — default arguments (or the default command) that can be overridden at `docker run`.

```dockerfile
ENTRYPOINT ["node"]
CMD ["dist/main.js"]   # `docker run img dist/worker.js` overrides CMD -> node dist/worker.js
```

Use `ENTRYPOINT` for the program, `CMD` for default args. Prefer **exec form** (`["node","app.js"]`) over shell form so signals (SIGTERM) reach the process directly.

---

### Q7. What's the difference between `COPY` and `ADD`?

**Answer.** Both copy files into the image. `COPY` is straightforward file/dir copying. `ADD` additionally can **auto-extract local tar archives** and **fetch remote URLs**. Best practice: **use `COPY`** unless you specifically need `ADD`'s extraction (explicit and predictable).

---

### Q8. What are volumes and why use them?

**Answer.** Containers are ephemeral — their writable layer is lost when removed. **Volumes** persist data outside the container lifecycle and share data between host and container.

```bash
docker run -v pgdata:/var/lib/postgresql/data postgres   # named volume (persists)
docker run -v $(pwd):/app node:20                          # bind mount (local dev)
```

**Node + AWS angle:** For local dev, bind-mount your source for hot reload. In production on Fargate, **don't rely on container storage** for state — use **S3/RDS/DynamoDB/EFS**; containers should be stateless.

---

### Q9. What is `.dockerignore` and why is it important?

**Answer.** Like `.gitignore`, it excludes files from the build context sent to the Docker daemon. Critical for Node:

```
node_modules
npm-debug.log
.git
dist
.env
*.md
test
```

**Why:** excluding `node_modules`/`.git` makes builds faster, images smaller, and prevents leaking local artifacts or secrets (`.env`) into the image.

---

### Q10. How do you map ports and pass environment variables?

**Answer.**
```bash
docker run -p 8080:3000 \            # host:container port mapping
  -e NODE_ENV=production \           # single env var
  --env-file .env \                  # file of env vars
  my-node-api:1.0
```
`EXPOSE` in the Dockerfile only documents the port; `-p` actually publishes it.

**AWS note:** In ECS, port mappings and env/secrets are defined in the **task definition** (`portMappings`, `environment`, `secrets` from Secrets Manager) — not at `docker run`.

---

### Q11. What is Docker Hub / a container registry? What's ECR?

**Answer.** A **registry** stores and distributes images. **Docker Hub** is the public default. **Amazon ECR (Elastic Container Registry)** is AWS's private registry, integrated with IAM and ECS/EKS.

```bash
docker pull node:20                  # from Docker Hub
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/my-api:1.0  # to ECR
```

**AWS note:** ECS pulls images from ECR using the task **execution role**; ECR provides image **vulnerability scanning**.

---

### Q12. How do you view logs and inspect a running container?

**Answer.**
```bash
docker ps                 # list running containers
docker logs -f <id>       # stream stdout/stderr logs
docker exec -it <id> sh   # shell into a running container
docker inspect <id>       # full JSON metadata
docker stats              # live resource usage
```

**Node + AWS note:** Log to **stdout/stderr** (12-factor) — on ECS the `awslogs` driver ships them to CloudWatch automatically. Don't write log files inside the container.
