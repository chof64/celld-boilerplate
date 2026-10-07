# Deploying Celld

This guide covers the operational lifecycle of a Celld application:

- starting a production Celld node,
- choosing single-node or multi-node deployment,
- configuring the fleet object store,
- networking and health checks,
- deploying the application,
- adding and removing nodes,
- upgrading Celld,
- choosing rolling versus stopped-fleet upgrades,
- recovering or rolling back an application deployment.

It is intentionally infrastructure-agnostic. The same architecture can be run by Docker, Coolify, systemd, Kubernetes, Nomad, or another supervisor.

For application architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Two different things get deployed

Keep these operations separate:

```text
Application deployment
  pnpm deploy
      |
      v
  celld deploy
      |
      v
fleet deployment pointer
      |
      v
running nodes adopt new application code in place


Celld node upgrade
  new celld binary / container image
      |
      v
restart or replace fleet nodes
      |
      v
rolling update OR stopped-fleet update
```

An application deploy normally does **not** restart Celld nodes.

A Celld runtime upgrade changes the node binary/container itself and therefore requires replacing or restarting nodes.

---

## 2. Production topology

A Celld fleet runs one application.

Every node in a fleet uses the same fleet object store and application deployment pointer.

### Single node

A single node is valid and is the simplest production shape:

```text
Internet
   |
   v
Ingress / TLS
   |
   v
Celld node
   |
   +-- local work directory
   |
   +-- fleet bucket
```

For a deliberately single-node deployment, use:

```text
CELLD_DURABILITY=bucket
```

Every durable write waits for the fleet bucket before Celld acknowledges it.

This keeps the durability model straightforward but makes object-store latency part of every durable write.

### Multi-node fleet

For workloads where lower durable-write latency, higher availability, or node maintenance without taking the whole application offline matters, use two or more nodes:

```text
                     fleet bucket
                         |
              +----------+----------+
              |          |          |
              v          v          v
           node-a      node-b      node-c
              ^          ^          ^
              +----------+----------+
                   private peer network
                         ^
                         |
                    public ingress
```

Use:

```text
CELLD_DURABILITY=fleet
```

This is Celld's current default. The owner sends durable writes to one or two fleet peers and can acknowledge once a follower holds the write on disk, or once the bucket proof finishes, whichever happens first.

A one-node fleet with `CELLD_DURABILITY=fleet` still works, but it has no follower and therefore waits for the bucket. Setting `bucket` on a deliberately single-node deployment makes that intent explicit.

---

## 3. What Celld persists

There are two important persistence surfaces:

```text
fleet object store
  deployment manifests
  static assets
  durable state / LTX
  fleet leases and metadata
  R2 logical buckets
  other fleet state

node work directory (CELLD_WATCH)
  local SQLite files
  replication state
  follower data
  runtime work files
```

The fleet object store is authoritative shared durability.

The node work directory must still be treated as persistent node state. In fleet durability mode, a follower disk can contain acknowledged writes that have not yet reached the bucket when maintenance begins.

Do not use an ephemeral container filesystem for `CELLD_WATCH`.

---

## 4. Network surfaces

A production node has two different listeners.

### Public Worker listener

Example:

```text
0.0.0.0:8080
```

This receives application HTTP and WebSocket traffic.

Expose this listener through your load balancer, reverse proxy, or ingress.

TLS can terminate at the ingress layer.

### Internal listener

Example:

```text
10.0.0.12:8081
```

This handles:

- peer traffic,
- cell routing,
- operator APIs,
- diagnostics and state inspection,
- graceful-shutdown control surfaces.

The internal listener must remain private.

Celld does not provide TLS for peer traffic, and some operator routes are intentionally unauthenticated. Use a trusted private network or encrypted overlay such as WireGuard or Tailscale.

Never publish the internal listener to the public Internet.

### Advertised address

Each multi-node fleet member advertises an address that every other node can reach:

```text
node-a.internal:8081
node-b.internal:8081
node-c.internal:8081
```

`CELLD_ADVERTISE` must route to that node's **internal listener**, not its public Worker listener.

Nodes discover membership from leases stored in the fleet bucket. There is no join command and no static peer list.

---

## 5. Primary node environment variables

Celld accepts command-line flags or environment variables. For supervised production deployments, environment variables are usually easier to manage.

A typical multi-node configuration looks like:

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# AWS_SESSION_TOKEN=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=10.0.0.12:8081
CELLD_ADVERTISE=node-a.internal:8081
CELLD_NODE=node-a

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=fleet
```

A single-node setup can instead use:

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=127.0.0.1:8081
CELLD_NODE=node-a

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=bucket
```

These are **infrastructure variables**. They do not belong in this repository's application `.env`, `.env.example`, or `.env.prod.example`.

### Core variables

| Variable | Purpose |
| --- | --- |
| `CELLD_BUCKET` | Fleet object-store bucket/container and optional prefix |
| `CELLD_ADDR` | Public Worker listener |
| `CELLD_INTERNAL_ADDR` | Private peer/operator listener |
| `CELLD_ADVERTISE` | Address other nodes use to reach this node |
| `CELLD_NODE` | Optional explicit node-session ID |
| `CELLD_WATCH` | Persistent local SQLite/replication work directory |
| `CELLD_DURABILITY` | `bucket` or `fleet` |

### Common operational variables

These normally stay at their defaults until measurements justify changing them.

| Variable | Current default / role |
| --- | --- |
| `CELLD_DEPLOY_POLL_S` | 30 seconds; deployment-pointer polling interval |
| `CELLD_DEPLOY_MAX_AGE_S` | 60 seconds; maximum age of old code in a resident DO after deployment adoption |
| `CELLD_SHUTDOWN_TOTAL_MS` | 40000 ms; total graceful process shutdown bound |
| `CELLD_READY_FLEET_GATE_MS` | 120000 ms; first-readiness fleet-capacity gate |
| `CELLD_OPERATION_DEADLINE_MS` | 15000 ms; normal operation deadline |
| `CELLD_ACTIVATIONS` | Concurrent cold-cell activation limit |
| `CELLD_MAX_RESIDENT_CELLS` | Optional hard cap for resident cells |
| `CELLD_MAX_RSS_MB` | Memory-pressure threshold |
| `CELLD_IDLE_EVICT_S` | Optional idle-cell hibernation age |
| `CELLD_PLACEMENT_WEIGHT` | Relative ownership share; defaults to CPU count |
| `RUST_LOG` | Runtime logging filter |

Use `celld --help` on the exact Celld release you run for the complete list.

---

## 6. Object-store configuration

The same fleet bucket must be used by every node and by `celld deploy`.

A bucket prefix can isolate multiple fleets in one physical bucket:

```text
s3://shared-bucket/production
s3://shared-bucket/development
```

Treat each prefix as an independent administrative trust boundary.

### S3-compatible storage

Typical configuration:

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Celld uses the standard AWS credential chain.

For AWS S3 itself, `S3_ENDPOINT` is normally unnecessary and the region should be the actual AWS region.

### Google Cloud Storage

Use:

```text
CELLD_BUCKET=gs://my-celld-fleet
```

Celld uses Google Application Default Credentials. `GOOGLE_APPLICATION_CREDENTIALS` and `GOOGLE_SERVICE_ACCOUNT_KEY` are supported credential inputs.

### Azure Blob Storage

Use:

```text
CELLD_BUCKET=az://my-container
AZURE_STORAGE_ACCOUNT_NAME=...
```

Authentication can use an account key, managed identity, or workload identity.

Do not use local storage as the production fleet backend. `celld dev` has its own local object store specifically for development.

---

## 7. Running a node with Docker

Celld publishes a release image at:

```text
ghcr.io/denoland/celld
```

For production, pin the Celld version or image digest rather than following a floating image.

Example:

```bash
docker run -d \
  --name celld \
  --restart unless-stopped \
  --network host \
  --stop-timeout 90 \
  --env-file /etc/celld/node.env \
  -v /var/lib/celld:/var/lib/celld \
  ghcr.io/denoland/celld:<PINNED_VERSION>
```

The environment file is infrastructure configuration and should be stored by your deployment/secrets system, not committed to the application repository.

The persistent mount must include the path configured by `CELLD_WATCH`.

A 90-second stop timeout is a reasonable starting point with Celld's current 40-second default graceful-shutdown bound. If you increase `CELLD_SHUTDOWN_TOTAL_MS`, increase the supervisor/orchestrator stop grace as well.

The same principles apply to Coolify, Docker Compose, Kubernetes, systemd, or another supervisor:

1. persist `CELLD_WATCH`,
2. pass bucket credentials securely,
3. expose the Worker listener,
4. keep the internal listener private,
5. give SIGTERM enough time to complete a graceful handoff,
6. pin the Celld release.

---

## 8. Health checks

Use the public health endpoint:

```text
/.well-known/celld/health
```

Example:

```bash
curl -f http://127.0.0.1:8080/.well-known/celld/health
```

A healthy node returns success.

The endpoint reports `503` while the node is draining and while a joining/replacement node has not yet passed its first-readiness fleet gate.

Use this endpoint for:

- load-balancer health checks,
- rolling-update readiness,
- container health checks,
- post-restart validation.

Do not use the private operator listener as a public health endpoint.

---

## 9. Diagnosing the fleet

Before and after infrastructure changes, run:

```bash
celld diagnose
```

with the same fleet-bucket environment and credentials used by the nodes.

By default, diagnose also tests the bucket's conditional write behavior. Use the command's read-only mode only when you explicitly do not want that write probe.

The private internal listener also exposes `/state`, which is useful during drains and recovery:

```bash
curl http://127.0.0.1:8081/state
```

Only call operator endpoints from the trusted internal network.

Useful operational checks include:

```bash
celld --version
celld diagnose
celld cell list
```

---

## 10. First production deployment

A clean first deployment is:

```text
1. Provision fleet bucket
2. Start Celld node(s)
3. Wait for public health
4. Deploy application
5. Wait for nodes to adopt deployment
6. Test public application
```

From this repository:

```bash
pnpm install
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

The deploy process must inherit the fleet object-store configuration and credentials:

```text
CELLD_BUCKET
S3_ENDPOINT / region when applicable
provider credentials
```

Application Worker variables remain governed by `celld/env.ts`. The deploy wrapper builds the temporary `.wrangler.deploy.jsonc` and passes the fleet configuration through to native `celld deploy`.

Worker projects require `esbuild` on `PATH`, or `CELLD_ESBUILD` can point to it.

---

## 11. What happens during `pnpm deploy`

The deployment path is:

```text
application source
      |
      v
pnpm deploy
      |
      v
temporary .wrangler.deploy.jsonc
      |
      v
celld deploy
      |
      v
modules + assets + manifest
      |
      v
fleet deployment pointer updated last
      |
      v
nodes poll and adopt
```

Celld writes deployment contents before moving the fleet-wide current pointer.

Running nodes poll that pointer every `CELLD_DEPLOY_POLL_S` seconds, currently 30 seconds by default.

Nodes build the new deployment beside the one currently serving. New requests switch to the new deployment after it is ready, while already-started requests finish on the old deployment.

A failed application build/adoption does not replace the deployment the node is already serving.

No node restart is required for a normal application deployment.

### Durable Objects during deployment

Resident Durable Objects move to the new application generation at a safe point.

Hibernatable WebSockets survive the move. Regular WebSockets may be closed when Celld forces a deployment move after `CELLD_DEPLOY_MAX_AGE_S`.

Clients must therefore support reconnecting realtime transports.

During the adoption window, one application version can call a Durable Object still running the adjacent version. Consecutive application releases should therefore keep internal RPC/message shapes compatible during that transition.

---

## 12. Serialize application deployments

The fleet-wide deployment pointer is the application selector.

Do not run two production deploy writers for the same fleet at the same time.

Your CI/CD or deployment platform should provide a per-fleet deployment lock:

```text
production fleet
      |
      +-- exactly one active pnpm deploy
```

This does not need to be implemented inside the application boilerplate.

---

## 13. Application rollback

There is intentionally no custom rollback database or release registry in this boilerplate.

To return to a known-good application version:

1. check out or build the known-good source revision,
2. supply its production Worker environment,
3. run `pnpm deploy` again,
4. let the fleet adopt that deployment normally.

The new deploy becomes the current fleet pointer.

A code rollback does **not** roll back durable state that the newer application already wrote. Design persistent schema and internal messages with forward/backward compatibility in mind.

Do not casually reverse Durable Object class/migration identity changes.

---

## 14. Adding a node

Scaling up requires no join command.

For the new node:

1. use the same `CELLD_BUCKET`,
2. use the same durability mode and compatible Celld release,
3. give it a unique internal listener/advertised address,
4. give it its own persistent `CELLD_WATCH`,
5. start it,
6. wait for `/.well-known/celld/health` to return healthy,
7. add its public Worker listener to ingress/load balancing.

The nodes discover each other through fleet leases in the bucket.

A new node does not need the addresses of every existing node.

---

## 15. Removing a node

Prefer a graceful stop.

Send SIGTERM through your supervisor:

```bash
docker stop celld
```

or the equivalent systemd/Kubernetes/platform action.

Celld then:

1. reports public health as `503`,
2. stops accepting new public work,
3. finishes already accepted requests,
4. proves cell state durable,
5. hands cells to compatible peers in batches,
6. shuts down within its configured total stop budget.

Do not use SIGKILL for normal maintenance.

For a multi-node fleet, remove nodes one at a time unless you have a specific recovery plan.

If you scale a fleet down to one node, it remains durable, but durable writes must wait for the object store because there is no follower.

---

## 16. Load balancer draining

The preferred setup is a health-check-aware load balancer:

```text
SIGTERM
   |
   v
Celld health -> 503
   |
   v
load balancer stops new traffic
   |
   v
Celld completes existing requests and cell handoff
```

If your ingress is only DNS-based and does not actively check node health, remove the node from DNS/ingress before stopping it and allow enough time for cached DNS and active connections to drain.

The application should always be capable of retrying a request against another healthy node when a connection is closed during maintenance.

---

## 17. Upgrading the Celld runtime

Application deployments and Celld runtime upgrades are different.

Before changing the Celld binary/image:

1. read the release notes and current Celld upgrade documentation,
2. determine whether that specific version transition supports mixed versions,
3. choose **rolling update** or **stopped-fleet update** accordingly,
4. verify backups and stop-grace configuration,
5. serialize runtime maintenance separately from application deployment.

Do not assume every Celld version can coexist with its predecessor.

Some Celld releases change peer protocols, bucket formats, replication/log formats, or durable metadata and explicitly require every old node to stop before any new-version fleet begins serving.

---

## 18. Rolling update

Use this only when the Celld release documentation says the old and new releases may coexist.

A typical multi-node rolling upgrade is:

```text
node-a old   node-b old   node-c old
    |
    | stop/replace node-a
    v
node-a new   node-b old   node-c old
    |
    | wait for node-a healthy
    | stop/replace node-b
    v
node-a new   node-b new   node-c old
    |
    | wait for node-b healthy
    | stop/replace node-c
    v
node-a new   node-b new   node-c new
```

For each node:

1. confirm the rest of the fleet has capacity,
2. update the pinned Celld image/binary,
3. send SIGTERM to the old process,
4. let it complete its graceful drain,
5. start the replacement using that node's persistent work directory,
6. wait for `/.well-known/celld/health`,
7. verify fleet diagnostics,
8. continue to the next node.

Celld's readiness gate intentionally delays a replacement from becoming healthy until the fleet has sufficiently settled.

Do not advance the rollout just because the process started. Advance when the health endpoint is healthy.

---

## 19. Stopped-fleet update

Use this when the release notes say mixed versions are unsafe.

This is a different procedure from a rolling update.

```text
old fleet serving
      |
      v
stop application traffic
stop deployment writers
      |
      v
stop EVERY old Celld node
      |
      v
wait for leases to expire
      |
      v
backup bucket + node work directories
prevent old binaries from restarting
      |
      v
start new-version nodes
      |
      v
wait healthy
      |
      v
restore application traffic
```

Procedure:

1. stop application deployment writers,
2. stop or drain public application traffic,
3. gracefully stop every old-version node,
4. wait until every old node lease has expired,
5. back up the stopped fleet bucket,
6. back up each node's `CELLD_WATCH` directory,
7. ensure the old version cannot automatically restart,
8. update the Celld image/binary everywhere,
9. start the new fleet,
10. wait for healthy nodes and run diagnostics,
11. restore application traffic.

The default node lease lifetime is currently 10 seconds, but use the exact release's configuration and diagnostics rather than assuming a fixed sleep is sufficient.

### Why local node data matters

With fleet durability, follower disks can contain acknowledged writes that the bucket has not received yet.

During an incompatible stopped-fleet upgrade, do not delete or replace local node data before you have a safe backup and the new release's upgrade procedure says it is no longer required.

---

## 20. Single-node runtime upgrade

A single-node deployment cannot provide application availability while its only Celld process is stopped.

Its upgrade is therefore naturally:

```text
remove/drain public traffic
        |
        v
SIGTERM Celld
        |
        v
graceful stop completes
        |
        v
replace binary/image
        |
        v
start node
        |
        v
wait healthy
        |
        v
restore traffic
```

When using `CELLD_DURABILITY=bucket`, acknowledged writes are already bucket-proven.

Still preserve the node work directory unless the Celld release's upgrade instructions explicitly say otherwise.

---

## 21. Stop-grace configuration

Celld's current default:

```text
CELLD_SHUTDOWN_TOTAL_MS=40000
```

The supervisor must allow more time than this before sending SIGKILL.

Examples of equivalent platform settings include:

- Docker stop timeout,
- systemd `TimeoutStopSec`,
- Kubernetes `terminationGracePeriodSeconds`,
- hosting-platform shutdown grace.

Do not configure the platform grace to exactly the same value as Celld's internal bound. Leave margin for process/supervisor overhead.

If shutdowns repeatedly hit the configured bound, investigate capacity, object-store latency, cell count, and handoff behavior rather than simply hiding the problem with a very large timeout.

---

## 22. Deployment and upgrade checklist

### Before an application deploy

- [ ] Correct production Worker variables available
- [ ] Correct fleet bucket/credentials available
- [ ] One deployment writer for this fleet
- [ ] `pnpm check` passes
- [ ] `pnpm deploy -- --dry-run` succeeds when appropriate
- [ ] Adjacent application versions are RPC/message compatible

### After an application deploy

- [ ] Nodes adopted the expected deployment
- [ ] Public health endpoints are healthy
- [ ] REST API responds
- [ ] WebSocket reconnect path works
- [ ] Logs show no deployment-adoption failures

### Before a runtime upgrade

- [ ] Read the exact Celld release upgrade notes
- [ ] Decide rolling vs stopped-fleet
- [ ] Pin the new version/digest
- [ ] Confirm persistent `CELLD_WATCH`
- [ ] Confirm fleet bucket backup/recovery posture
- [ ] Confirm stop grace > `CELLD_SHUTDOWN_TOTAL_MS`
- [ ] Confirm surviving fleet capacity for rolling update
- [ ] Pause application deploys while runtime maintenance is in progress

### After a runtime upgrade

- [ ] `celld --version` shows the intended version
- [ ] `/.well-known/celld/health` is healthy
- [ ] `celld diagnose` succeeds
- [ ] REST request succeeds
- [ ] Durable Object write succeeds
- [ ] WebSocket connection/reconnect succeeds
- [ ] No unexpected recovery/handoff errors in logs

---

## 23. Suggested production shapes

### Small application

```text
1 Celld node
CELLD_DURABILITY=bucket
managed object store
persistent CELLD_WATCH
public health check
```

Use this when simplicity matters more than maintenance availability and object-store write latency is acceptable.

### Normal highly available application

```text
2-3+ Celld nodes
CELLD_DURABILITY=fleet
same fleet bucket
private peer network
persistent work directory per node
health-check-aware load balancer
rolling upgrades when release-compatible
```

This is the recommended shape when the application should stay available through ordinary node maintenance.

---

## 24. What the application repository owns

This repository should own:

```text
wrangler.jsonc
Celld application source
Worker environment contract
frontend/static assets
application deploy wrapper
application architecture
deployment documentation
```

Infrastructure should own:

```text
Celld version/image
CELLD_BUCKET
bucket credentials
CELLD_ADDR
CELLD_INTERNAL_ADDR
CELLD_ADVERTISE
CELLD_NODE
CELLD_WATCH volume
CELLD_DURABILITY
load balancer / TLS
private network
supervisor stop grace
node scaling
node/runtime upgrades
deployment serialization
```

That boundary keeps the boilerplate portable across infrastructure platforms.

---

## 25. Operational rule of thumb

For application code:

> Deploy through `pnpm deploy`; Celld nodes adopt it without restart.

For node maintenance:

> Stop nodes gracefully. Roll one at a time only when the two Celld versions are explicitly compatible.

For incompatible runtime upgrades:

> Stop the whole old fleet first, preserve the bucket and node data, then start the new fleet.

For networking:

> Public Worker listener may face ingress; internal peer/operator listener stays private.

For durability:

> Single node: bucket durability is the explicit simple posture. Multi-node: fleet durability is the normal posture.
