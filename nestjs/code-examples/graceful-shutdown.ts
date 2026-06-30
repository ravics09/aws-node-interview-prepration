/**
 * Graceful shutdown for a Node.js HTTP service (Q9).
 *
 * Why it matters: On ECS/EKS/EC2 the platform sends SIGTERM before terminating
 * a task (deploys, scale-in, spot reclaim). If you exit immediately you drop
 * in-flight requests. Proper draining + readiness flipping gives zero-downtime
 * deploys when combined with ALB connection draining (deregistration delay).
 *
 * Packages: express (example uses Express; the pattern is framework-agnostic).
 */

import express from 'express';
import type { Server } from 'http';

const app = express();

// A readiness flag the load balancer health check should reflect.
// When false, the ALB target group health check should fail so the LB stops
// routing NEW traffic to this instance while we finish in-flight work.
let isShuttingDown = false;

app.get('/health/live', (_req, res) => {
  // Liveness: is the process responsive? Keep it cheap; do NOT check deps here.
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', (_req, res) => {
  // Readiness: should we receive traffic right now?
  if (isShuttingDown) return res.status(503).json({ status: 'draining' });
  // (Optionally include tolerant dependency checks here.)
  res.status(200).json({ status: 'ready' });
});

app.get('/work', async (_req, res) => {
  await new Promise((r) => setTimeout(r, 500)); // simulate in-flight work
  res.json({ done: true });
});

const server: Server = app.listen(3000, () => console.log('listening on :3000'));

// Tune to be LESS than the orchestrator's stop timeout / grace period
// (e.g., ECS stopTimeout) so we always exit before being SIGKILLed.
const SHUTDOWN_TIMEOUT_MS = 25_000;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining...`);

  // Hard cap: force-exit if draining hangs (e.g., a stuck keep-alive socket).
  const forceTimer = setTimeout(() => {
    console.error('[shutdown] drain timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  // Stop accepting new connections; callback fires once existing ones finish.
  server.close(async (err) => {
    if (err) {
      console.error('[shutdown] error closing server', err);
      process.exit(1);
    }
    try {
      // Close other resources in dependency order.
      // await queueConsumer.stop();   // stop pulling SQS, let in-flight finish
      // await db.end();               // drain DB pool
      // await redis.quit();
      console.log('[shutdown] clean exit');
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (e) {
      console.error('[shutdown] error during resource cleanup', e);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Treat these as fatal: log, then shut down cleanly and let the orchestrator
// restart a fresh process rather than continuing in an undefined state (Q13).
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection', reason);
  void shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException', err);
  void shutdown('uncaughtException');
});
