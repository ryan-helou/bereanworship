#!/usr/bin/env node
/**
 * Process entrypoint.
 *
 * The web app and the review worker ship as one image and one repository, and
 * this decides which of the two a given container becomes. Railway (and any
 * similar host) can then run several services from the same build without a
 * second Dockerfile or a duplicated deploy pipeline.
 *
 * Role is taken from SERVICE_ROLE, falling back to the platform's own service
 * name so that a service literally called "worker" does the right thing even
 * if someone forgets to set the variable.
 */
import { spawn } from 'node:child_process';

const role = (process.env.SERVICE_ROLE ?? process.env.RAILWAY_SERVICE_NAME ?? 'web').toLowerCase();
const isWorker = role.includes('worker');

const command = isWorker ? 'npx' : 'npx';
const args = isWorker
  ? ['tsx', 'src/worker/index.ts']
  : ['next', 'start', '-p', process.env.PORT ?? '3000'];

console.log(
  JSON.stringify({
    event: 'process.starting',
    role: isWorker ? 'worker' : 'web',
    port: isWorker ? (process.env.PORT ?? '3000') : (process.env.PORT ?? '3000'),
  }),
);

const child = spawn(command, args, { stdio: 'inherit', env: process.env });

// Forward termination so the worker gets its chance to drain in-flight jobs.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
