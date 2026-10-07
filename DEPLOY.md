# Deploy Celld

This is the production runbook for this boilerplate.

It covers:

1. **Deploy Celld** — single-node and multi-node.
2. **Upgrade Celld** — rolling update or stop-and-update.
3. **Production tuning** — the few settings worth knowing first.

Celld docs: https://celld.dev/docs

---

# 1. Deploy Celld

## Container image

Use the official image and pin the version or digest:

```text
ghcr.io/denoland/celld:<PINNED_VERSION>
```

Every node needs:

- persistent storage for `CELLD_WATCH`,
- fleet object-store credentials,
- public Worker listener on `:8080`,
- private Celld listener on `:8081`,
- graceful shutdown time.

This guide assumes containers do **not** use host networking.

The public Worker listener binds inside the container:

```dotenv
CELLD_ADDR=0.0.0.0:8080
```

The internal listener depends on the topology:

- **single node:** bind to loopback with `127.0.0.1:8081`; no advertise address is needed,
- **multi-node:** bind to `0.0.0.0:8081` and set a private peer-reachable `CELLD_ADVERTISE`.

Leave `CELLD_NODE` unset. Celld generates the node-session ID automatically.

References: [Start a node](https://github.com/denoland/celld/blob/main/docs/README.md#start-a-node) · [Security](https://github.com/denoland/celld/blob/main/docs/security.md)

---

## Single-node production

Use this when simplicity matters more than zero-downtime node maintenance.

```text
Internet
   |
Ingress / TLS
   |
Celld
├─ :8080 public
├─ 127.0.0.1:8081 internal only
├─ persistent CELLD_WATCH
└─ fleet bucket
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
CELLD_INTERNAL_ADDR=127.0.0.1:8081

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=bucket
```

No `CELLD_ADVERTISE` is needed because no peer node needs to reach the internal listener. Binding it to loopback also keeps the operator surface inaccessible from the container network.

For a deliberate single-node deployment use:

```text
CELLD_DURABILITY=bucket
```

so acknowledged durable writes wait for the object store.

### Container requirements

- Persist `/var/lib/celld` or whatever contains `CELLD_WATCH`.
- Publish only the public Worker listener through ingress.
- Keep the internal listener on `127.0.0.1:8081`; do not publish it from the container.
- Give the container at least ~90 seconds to stop gracefully with current defaults.
- Supply credentials through the infrastructure/secrets manager.

### Start and deploy

1. Start the Celld container.
2. Wait for:
   ```text
   /.well-known/celld/health
   ```
3. Deploy the application:
   ```bash
   pnpm check
   pnpm deploy -- --dry-run
   pnpm deploy
   ```

The node and deploy process must use the same `CELLD_BUCKET`.

---

## Multi-node production

Use this for higher availability, maintenance without full downtime, and lower durable-write latency.

```text
                       fleet bucket
                           |
              +------------+------------+
              |            |            |
           Celld A      Celld B      Celld C
           :8080        :8080        :8080
           :8081        :8081        :8081
              ^            ^            ^
              +------------+------------+
                    private network
                           ^
                           |
                     public ingress
```

All nodes use the same:

```text
CELLD_BUCKET
CELLD_DURABILITY=fleet
```

Each node gets its own:

```text
CELLD_WATCH
CELLD_ADVERTISE
```

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

The advertised hostnames must resolve between nodes on the private network.

Celld discovers peers from leases in the fleet bucket; there is no join command or peer list.

Reference: [Add nodes](https://github.com/denoland/celld/blob/main/docs/README.md#add-nodes)

---

## Object storage

All nodes and `celld deploy` must use the same fleet bucket or prefix.

### S3-compatible example

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

For AWS S3, `S3_ENDPOINT` is normally unnecessary.

Celld also supports Google Cloud Storage and Azure Blob Storage.

Reference: [Configure object storage](https://github.com/denoland/celld/blob/main/docs/README.md#configure-object-storage)

---

## Deploy the application

Deploy **once per fleet**:

```bash
pnpm deploy
```

```text
pnpm deploy
    |
celld deploy
    |
fleet deployment pointer
    |
+---+---+
|       |
A       B       ...
```

Do not deploy application code node-by-node.

Running nodes poll the deployment pointer and adopt the new application in place.

Serialize production deploys so only one writer updates a fleet at a time.

Reference: [Deploy an application](https://github.com/denoland/celld/blob/main/docs/README.md#deploy-an-application)

---

# 2. Upgrade Celld

A Celld runtime upgrade is different from an application deploy.

Before upgrading:

1. Read the release notes for the exact old/new versions.
2. Check whether mixed versions are supported.
3. Choose **rolling update** or **stop-and-update**.
4. Pause application deploys.
5. Preserve the fleet bucket and every node's `CELLD_WATCH`.

Do not assume every Celld release can coexist with the previous one.

References: [Roll out a node](https://github.com/denoland/celld/blob/main/docs/README.md#shut-down-and-roll-out-a-node) · [Guarantees](https://github.com/denoland/celld/blob/main/docs/guarantees.md)

---

## Drain a node

For a multi-node fleet, you can explicitly start a graceful drain through the private operator API:

```bash
curl -X POST http://celld-a.internal:8081/shutdown
```

Replace `celld-a.internal` with the node's private `CELLD_ADVERTISE` hostname/address.

This starts the graceful ownership handoff. The node becomes unhealthy on:

```text
/.well-known/celld/health
```

so a health-aware load balancer stops routing new public requests to it.

The operator API is unauthenticated and must only be reachable on the trusted private network.

### Preferred platform command

SIGTERM starts the same graceful shutdown/handoff, so in normal container operations it is also valid—and often simpler—to use the platform's ordinary stop command:

```bash
docker stop <celld-container>
```

or the equivalent stop/redeploy action in your orchestrator.

For a **single-node** setup, the internal listener is bound to `127.0.0.1` inside the container, so the normal platform stop/SIGTERM path is the recommended drain command.

Reference: [Celld operator API and graceful shutdown](https://github.com/denoland/celld/blob/main/docs/README.md#shut-down-and-roll-out-a-node)

---

## Rolling update

Use when the old and new Celld releases are compatible in the same live fleet.

```text
A old   B old   C old
  ↓
A new   B old   C old
          ↓
A new   B new   C old
                  ↓
A new   B new   C new
```

For each node:

1. Confirm the remaining nodes have enough capacity.
2. Drain the node:
   ```bash
   curl -X POST http://celld-a.internal:8081/shutdown
   ```
   or stop it through the orchestrator, which sends SIGTERM.
3. Let Celld finish handoff and exit.
4. Replace the pinned Celld image.
5. Reuse the same persistent `CELLD_WATCH`.
6. Start the replacement.
7. Wait for `/.well-known/celld/health`.
8. Run `celld diagnose`.
9. Continue to the next node.

A draining node reports unhealthy, so a health-aware load balancer can stop routing new requests to it automatically.

---

## Stop-and-update

Use when mixed versions are not supported.

```text
stop traffic + pause deploys
            |
stop ALL old nodes gracefully
            |
wait for old leases to disappear
            |
preserve/backup bucket + CELLD_WATCH
            |
update all Celld images
            |
start new fleet
            |
health + diagnose
            |
restore traffic
```

Important:

- prevent old images from auto-restarting,
- preserve every node's local state,
- preserve/back up the fleet bucket,
- do not start the new fleet until old writers are gone.

For a single-node deployment this is naturally the upgrade strategy, with one node.

---

## Graceful shutdown

Celld handles SIGTERM/SIGINT gracefully.

Important setting:

```text
CELLD_SHUTDOWN_TOTAL_MS
```

Current default:

```text
40000 ms
```

The platform stop grace must be longer than this.

A ~90 second stop grace is a reasonable baseline with the current default.

---

# 3. Production tuning

Start with Celld defaults. Tune only when needed.

## Durability

Single node:

```dotenv
CELLD_DURABILITY=bucket
```

Multi-node:

```dotenv
CELLD_DURABILITY=fleet
```

Fleet durability can acknowledge after a follower fsync instead of always waiting for the object-store round trip.

Reference: [Testing and performance notes](https://github.com/denoland/celld/blob/main/docs/testing.md)

---

## Memory

Useful limits:

```text
CELLD_MAX_RSS_MB
CELLD_MAX_RESIDENT_CELLS
```

Celld already performs memory-pressure shedding; do not disable it casually.

Reference: [Environment variables](https://github.com/denoland/celld/blob/main/docs/README.md#environment-variables)

---

## Idle eviction and balancing

Optional:

```text
CELLD_IDLE_EVICT_S
```

This hibernates idle resident cells after the configured age.

It can also make fleet balancing more effective because hibernated cells can move between nodes.

For differently sized nodes:

```text
CELLD_PLACEMENT_WEIGHT
```

Celld otherwise derives placement weight from CPU capacity.

Reference: [Cell lifecycle](https://github.com/denoland/celld/blob/main/docs/README.md#cell-lifecycle)

---

## Deployment polling

```text
CELLD_DEPLOY_POLL_S
```

Current default:

```text
30 seconds
```

Usually leave this at the default.

Lower values make application deployments propagate faster but increase bucket polling.

---

## Telemetry

Bucket-backed telemetry:

```dotenv
CELLD_OTEL=1
```

OTLP collector:

```dotenv
CELLD_OTEL=http://collector:4318
```

Reference: [Telemetry](https://github.com/denoland/celld/blob/main/docs/telemetry.md)

---

## LTX cleanup

Superseded LTX epochs are retained by default.

Optional epoch GC:

```text
CELLD_LTX_RETENTION_SECS
```

Inspect candidates first:

```bash
celld cell gc --dry-run
```

Enable retention only after reading the compatibility/retention notes for the Celld release you run.

Reference: [Epoch GC](https://github.com/denoland/celld/blob/main/docs/guarantees.md#epoch-gc)

---

## Health and diagnostics

Health:

```text
/.well-known/celld/health
```

Diagnostics:

```bash
celld --version
celld diagnose
celld cell list
```

Reference: [Diagnose a fleet](https://github.com/denoland/celld/blob/main/docs/README.md#diagnose-a-fleet)

---

# Production checklist

- Pin the Celld version/image.
- Persist `CELLD_WATCH`.
- Single node: internal listener `127.0.0.1:8081`, no `CELLD_ADVERTISE`.
- Multi-node: internal listener `0.0.0.0:8081` plus a private `CELLD_ADVERTISE`.
- Never use `0.0.0.0` as `CELLD_ADVERTISE`.
- Leave `CELLD_NODE` unset by default.
- Single node: `CELLD_DURABILITY=bucket`.
- Multi-node: `CELLD_DURABILITY=fleet`.
- Deploy the application once per fleet.
- Serialize application deploys.
- Drain with `POST /shutdown` on the private listener or use the platform's normal SIGTERM stop.
- Use `POST /shutdown` only from the trusted private network.
- Rolling upgrade only when releases are compatible.
- Otherwise stop the old fleet before starting the new version.

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
