# Deploy Celld

This guide covers the production operation of this boilerplate:

1. Deploy Celld as a **single node** or **multi-node fleet**.
2. Upgrade Celld with either a **rolling update** or **stop-and-update**.
3. Apply the most useful production tuning and operational settings.

For application design, see [ARCHITECTURE.md](./ARCHITECTURE.md).

Celld documentation: https://celld.dev/docs

---

# 1. Deploy Celld

## Container image

Use the official image:

```text
ghcr.io/denoland/celld:<PINNED_VERSION>
```

Pin a Celld version or image digest in production. Do not follow a floating tag for unattended upgrades.

Every node also needs:

- persistent storage for `CELLD_WATCH`,
- access to the fleet object store,
- a public Worker listener,
- a private internal listener,
- enough shutdown grace for graceful handoff.

This guide assumes containers **do not use host networking**.

Use:

```dotenv
CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
```

`0.0.0.0` is the local bind address inside the container.

The public listener may be routed through ingress.

The internal listener must stay on a trusted private network.

Do not set `CELLD_NODE` by default. Celld generates a node-session ID automatically.

References:

- [Celld: Start a node](https://github.com/denoland/celld/blob/main/docs/README.md#start-a-node)
- [Celld security](https://github.com/denoland/celld/blob/main/docs/security.md)
- [Celld limitations](https://github.com/denoland/celld/blob/main/docs/limitations.md)

---

## Single-node production

Use a single node when simplicity is more important than maintenance availability or lowest possible durable-write latency.

### Topology

```text
Internet
   |
   v
Ingress / TLS
   |
   v
Celld
  :8080 public
  :8081 private
     |
     +-- persistent CELLD_WATCH
     |
     +-- fleet bucket
```

### Environment

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# AWS_SESSION_TOKEN=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
CELLD_ADVERTISE=celld.internal:8081

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=bucket
```

The value of `CELLD_ADVERTISE` must resolve to the container's private internal listener. Celld requires an explicit advertise address when the internal listener binds to `0.0.0.0`.

For a single node:

```text
CELLD_DURABILITY=bucket
```

makes the intended durability posture explicit: every acknowledged durable write is proven through the object store.

### Container shape

A minimal Compose-style example:

```yaml
services:
  celld:
    image: ghcr.io/denoland/celld:<PINNED_VERSION>
    restart: unless-stopped

    environment:
      CELLD_BUCKET: s3://my-celld-fleet
      S3_ENDPOINT: https://object-storage.example.com
      AWS_REGION: auto

      CELLD_ADDR: 0.0.0.0:8080
      CELLD_INTERNAL_ADDR: 0.0.0.0:8081
      CELLD_ADVERTISE: celld.internal:8081

      CELLD_WATCH: /var/lib/celld/state
      CELLD_DURABILITY: bucket

    volumes:
      - celld-state:/var/lib/celld

    expose:
      - "8080"
      - "8081"

    stop_grace_period: 90s
```

Supply object-store credentials through your infrastructure/secrets manager.

Only port 8080 should be routed publicly.

### First deploy

Start the Celld node, wait for health, then deploy the application:

```bash
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

Health endpoint:

```text
/.well-known/celld/health
```

The deploy command and the Celld node must use the same fleet bucket.

---

## Multi-node production

Use two or more nodes when you want:

- maintenance without taking the application offline,
- lower durable-write latency through fleet replication,
- more runtime capacity.

### Topology

```text
                         fleet bucket
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
         Celld A          Celld B          Celld C
       public :8080     public :8080     public :8080
       private:8081     private:8081     private:8081
              ^               ^               ^
              +---------------+---------------+
                       private network
                              ^
                              |
                         public ingress
```

All nodes share the same:

```text
CELLD_BUCKET
CELLD_DURABILITY=fleet
```

Each node gets:

- its own persistent `CELLD_WATCH`,
- a unique peer-reachable `CELLD_ADVERTISE`.

### Node A

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
CELLD_ADVERTISE=celld-a.internal:8081

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=fleet
```

### Node B

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
CELLD_ADVERTISE=celld-b.internal:8081

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=fleet
```

Additional nodes follow the same pattern.

Celld discovers fleet membership from leases stored in the bucket. There is no join command and no fixed peer list.

The advertised addresses must be reachable from every Celld node over the trusted private network.

References:

- [Celld: Add nodes](https://github.com/denoland/celld/blob/main/docs/README.md#add-nodes)
- [Celld Durable Object ownership](https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md#ownership-and-the-single-threaded-model)

---

## Object storage

Every node in a fleet and every `celld deploy` invocation must use the same bucket or bucket prefix.

### S3-compatible

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Celld uses the standard AWS credential chain.

For AWS S3 itself, `S3_ENDPOINT` is normally not needed.

Celld also supports Google Cloud Storage and Azure Blob Storage.

Reference:

- [Celld object-storage configuration](https://github.com/denoland/celld/blob/main/docs/README.md#configure-object-storage)

---

## Application deployment

Deploy the application once per fleet:

```bash
pnpm deploy
```

Do **not** deploy separately to every node.

```text
pnpm deploy
     |
     v
celld deploy
     |
     v
fleet deployment pointer
     |
     +--------+--------+
     |        |        |
     v        v        v
   node A   node B   node C
```

Running nodes poll the deployment pointer and adopt the new application in place.

A normal application deploy does not restart Celld.

Only one deploy writer should update a fleet at a time. Serialize production deploys in CI/CD.

Reference:

- [Celld: Deploy an application](https://github.com/denoland/celld/blob/main/docs/README.md#deploy-an-application)

---

# 2. Upgrade Celld

Upgrading the **Celld runtime** is different from deploying application code.

Before every Celld upgrade:

1. Read the release notes for the exact old/new versions.
2. Determine whether mixed versions are supported.
3. Choose **rolling update** or **stop-and-update**.
4. Pause application deploys during the runtime upgrade.
5. Preserve the fleet bucket and node `CELLD_WATCH` volumes.

Do not assume every release pair can safely run together.

Reference:

- [Celld: Shut down and roll out a node](https://github.com/denoland/celld/blob/main/docs/README.md#shut-down-and-roll-out-a-node)
- [Celld guarantees / format upgrades](https://github.com/denoland/celld/blob/main/docs/guarantees.md)

---

## Rolling update

Use a rolling update when the Celld release documentation says the two versions can coexist.

```text
A old   B old   C old
  |
  v
A new   B old   C old
          |
          v
A new   B new   C old
                  |
                  v
A new   B new   C new
```

For each node:

1. Ensure the remaining fleet has enough capacity.
2. Stop the node gracefully with SIGTERM.
3. Let Celld hand off state and exit.
4. Replace the pinned image/binary.
5. Reuse the node's persistent `CELLD_WATCH`.
6. Start the replacement.
7. Wait for `/.well-known/celld/health` to become healthy.
8. Run `celld diagnose`.
9. Continue to the next node.

Do not advance merely because the container started. Advance when the replacement node is healthy.

Celld marks the public health endpoint unhealthy while a node is draining, allowing a health-aware load balancer to stop routing new traffic to it.

---

## Stop-and-update

Use stop-and-update when the Celld release documentation says mixed versions are unsafe.

```text
stop public traffic
pause application deploys
        |
        v
gracefully stop ALL old nodes
        |
        v
wait for old leases to expire
        |
        v
backup/preserve bucket + CELLD_WATCH
        |
        v
update all Celld images
        |
        v
start new fleet
        |
        v
health + diagnose
        |
        v
restore traffic
```

Important:

- prevent old images from automatically restarting,
- preserve every node's `CELLD_WATCH`,
- preserve/back up the fleet bucket,
- do not mix incompatible old and new nodes.

This is also the natural upgrade strategy for a single-node deployment, except there is only one node to stop and restart.

---

## Graceful shutdown

Celld handles SIGTERM/SIGINT gracefully.

The primary shutdown budget is:

```text
CELLD_SHUTDOWN_TOTAL_MS
```

The current default is 40000 ms.

Your container/platform stop grace must be longer than this.

A 90-second stop grace is a reasonable baseline with the current default.

During graceful shutdown Celld reports the public health endpoint as unhealthy, finishes accepted requests, and preserves/hands off durable state before exiting.

---

# 3. Production tuning and operations

Start with Celld defaults. Tune only when measurements or workload characteristics justify it.

## Multi-node durability for write latency

For a single node:

```dotenv
CELLD_DURABILITY=bucket
```

For a fleet:

```dotenv
CELLD_DURABILITY=fleet
```

A single node must wait for an object-store proof for durable writes.

With two or more nodes, fleet durability can acknowledge after a follower has the write on disk, while the bucket upload continues/races in parallel.

Reference:

- [Celld testing and durability measurements](https://github.com/denoland/celld/blob/main/docs/testing.md)

---

## Memory pressure

Celld automatically sheds resident cells under memory pressure.

Useful controls:

```text
CELLD_MAX_RSS_MB
CELLD_MAX_RESIDENT_CELLS
```

Do not disable memory-pressure handling casually.

Reference:

- [Celld environment variables](https://github.com/denoland/celld/blob/main/docs/README.md#environment-variables)

---

## Idle cell eviction

Set:

```text
CELLD_IDLE_EVICT_S
```

when you want idle resident cells to hibernate instead of remaining in memory until pressure forces eviction.

This can also improve ownership rebalancing because hibernated cells are easier to move between nodes.

Reference:

- [Celld cell lifecycle](https://github.com/denoland/celld/blob/main/docs/README.md#cell-lifecycle)

---

## Placement weighting

Celld normally derives node ownership weight from CPU capacity.

Override when nodes have intentionally different capacity:

```text
CELLD_PLACEMENT_WEIGHT
```

Use this only when the default CPU-based weighting does not represent the actual capacity of a node.

---

## Deployment polling

Nodes poll the deployment pointer using:

```text
CELLD_DEPLOY_POLL_S
```

Current default:

```text
30 seconds
```

Usually leave this alone. Lower it only when faster application adoption is worth more frequent bucket reads.

---

## Telemetry

Celld telemetry is off by default.

Enable bucket-backed telemetry:

```dotenv
CELLD_OTEL=1
```

or export to an OTLP collector:

```dotenv
CELLD_OTEL=http://collector:4318
```

Reference:

- [Celld telemetry](https://github.com/denoland/celld/blob/main/docs/telemetry.md)

---

## LTX retention / epoch cleanup

Superseded LTX epochs are not deleted by default.

Celld can enable epoch GC with:

```text
CELLD_LTX_RETENTION_SECS
```

Treat this as an explicit storage-maintenance decision, not a default optimization.

Before enabling it, read the release-specific compatibility notes and retention guarantees.

Useful dry run:

```bash
celld cell gc --dry-run
```

Reference:

- [Celld guarantees: Epoch GC](https://github.com/denoland/celld/blob/main/docs/guarantees.md#epoch-gc)

---

## Health and diagnostics

Public health:

```text
/.well-known/celld/health
```

Fleet diagnostics:

```bash
celld diagnose
```

Useful checks:

```bash
celld --version
celld diagnose
celld cell list
```

Reference:

- [Celld: Diagnose a fleet](https://github.com/denoland/celld/blob/main/docs/README.md#diagnose-a-fleet)

---

# Important rules

1. **Pin the Celld version.**
2. **Persist `CELLD_WATCH`.**
3. **Keep port 8081 private.**
4. **Use `0.0.0.0` only as a bind address; peers dial `CELLD_ADVERTISE`.**
5. **Leave `CELLD_NODE` unset unless there is a specific operational need.**
6. **Single node: use `CELLD_DURABILITY=bucket`.**
7. **Multi-node: use `CELLD_DURABILITY=fleet`.**
8. **Deploy the application once per fleet, not once per node.**
9. **Serialize application deploys.**
10. **Use graceful SIGTERM shutdown.**
11. **Rolling upgrade only when old/new Celld versions are compatible.**
12. **Otherwise stop the whole old fleet before starting the new version.**

---

# References

- [Celld documentation](https://celld.dev/docs)
- [Celld repository](https://github.com/denoland/celld)
- [Start a node](https://github.com/denoland/celld/blob/main/docs/README.md#start-a-node)
- [Add nodes](https://github.com/denoland/celld/blob/main/docs/README.md#add-nodes)
- [Deploy an application](https://github.com/denoland/celld/blob/main/docs/README.md#deploy-an-application)
- [Shut down and roll out a node](https://github.com/denoland/celld/blob/main/docs/README.md#shut-down-and-roll-out-a-node)
- [Environment variables](https://github.com/denoland/celld/blob/main/docs/README.md#environment-variables)
- [Security](https://github.com/denoland/celld/blob/main/docs/security.md)
- [Guarantees](https://github.com/denoland/celld/blob/main/docs/guarantees.md)
- [Telemetry](https://github.com/denoland/celld/blob/main/docs/telemetry.md)
- [Testing and performance notes](https://github.com/denoland/celld/blob/main/docs/testing.md)
