# Deploying Celld

This guide describes how to run this boilerplate in production.

It deliberately separates the two production shapes we support:

1. **Single-node production** — simplest deployment, one Celld node, bucket durability.
2. **Multi-node production** — two or more Celld nodes, fleet durability, private peer networking, rolling maintenance when the Celld release supports it.

Application deployment and Celld runtime deployment are separate operations. A normal application deploy updates the fleet deployment pointer and running nodes adopt the new application in place. A Celld runtime upgrade replaces or restarts the Celld process itself.

For application structure and runtime boundaries, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

# Shared concepts

## Application deploy versus Celld runtime upgrade

These are different operations:

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
running nodes adopt new app in place
```

versus:

```text
Celld runtime upgrade
  new celld image / binary
      |
      v
replace or restart node processes
      |
      v
rolling update OR stopped-fleet update
```

A normal application deployment does not require restarting the Celld nodes.

A Celld runtime upgrade changes the node implementation and must follow the upgrade rules for the exact old/new Celld versions.

---

## Container networking convention

This guide assumes Celld runs in a container **without host networking**.

Inside the container, Celld binds both listeners on wildcard addresses:

```dotenv
CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
```

`0.0.0.0` is a bind address. It means "listen on every network interface available inside this container."

It is not an address that another node can dial.

For that reason, a wildcard internal bind must be paired with an explicit peer-reachable advertised address:

```dotenv
CELLD_ADVERTISE=celld-a.internal:8081
```

Conceptually:

```text
CELLD_INTERNAL_ADDR
0.0.0.0:8081
      |
      | bind inside container
      v
private container interface :8081
      ^
      |
CELLD_ADVERTISE
celld-a.internal:8081
      ^
      |
other Celld nodes dial this
```

The platform/network must route the advertised hostname or private IP to the container's internal listener.

The public Worker listener may be routed through ingress.

The internal listener must never be exposed to the public Internet.

---

## Node IDs

Do not set `CELLD_NODE` by default.

Celld generates a node-session ID automatically when the variable is absent:

```text
node_<random session id>
```

That is the preferred boilerplate behavior.

Set `CELLD_NODE` only when an operator has a concrete reason to control the session ID. It is not needed for ordinary fleet discovery or node membership.

Fleet membership comes from leases in the fleet bucket, not from a fixed node-name list.

---

## Persistent surfaces

Celld uses two persistence surfaces:

```text
fleet object store
  deployment manifests
  static assets
  durable state / LTX
  fleet leases and metadata
  logical R2 data
  other shared fleet state

node work directory (CELLD_WATCH)
  local SQLite files
  replication state
  follower data
  runtime work files
```

The fleet object store is the shared long-term store.

The local `CELLD_WATCH` directory is also part of the durability system and must live on persistent storage. In fleet durability mode, a follower disk may contain acknowledged writes that have not yet reached the bucket.

Never run two Celld processes against the same `CELLD_WATCH` directory at the same time.

Do not place `CELLD_WATCH` on an ephemeral container filesystem.

---

## Listener security

Celld has two network listeners.

### Public Worker listener

```text
0.0.0.0:8080
```

Use it for:

- public HTTP,
- REST API,
- WebSockets,
- Celld public health.

Expose it through your load balancer, reverse proxy, or platform ingress.

TLS normally terminates at that ingress layer.

### Internal listener

```text
0.0.0.0:8081
```

Use it for:

- peer routing,
- cell traffic,
- fleet RPC transport,
- operator APIs,
- state inspection,
- shutdown/handoff operations.

The internal listener is a trusted private-network surface. Celld does not provide built-in TLS for peer traffic and some operator routes are intentionally unauthenticated.

Use a private network or encrypted overlay.

Never route public Internet traffic to port 8081.

---

# Single-node production deployment

A single-node deployment is the simplest production Celld topology.

Use it when:

- application availability during node maintenance is not required,
- one machine has enough capacity,
- object-store latency for durable writes is acceptable,
- operational simplicity matters more than horizontal redundancy.

## Single-node topology

```text
Internet
   |
   v
TLS / ingress
   |
   v
Celld container
  public :8080
  internal :8081
      |
      +-- persistent CELLD_WATCH
      |
      +-- fleet bucket
```

The internal listener remains private even though there are no peer nodes today. Keeping the listener topology production-correct also makes a later move to a fleet straightforward.

---

## Single-node durability

Use:

```dotenv
CELLD_DURABILITY=bucket
```

Every acknowledged durable write waits for the fleet bucket.

This makes the single-node durability posture explicit: the node has no follower, so the object store is the durability proof.

A one-node deployment using the default `fleet` mode also eventually falls back to the bucket because there is no follower, but `bucket` better communicates the intended topology.

---

## Single-node environment

Example infrastructure environment:

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

Do not add `CELLD_NODE` unless you explicitly need a fixed session ID.

The hostname used by `CELLD_ADVERTISE` must resolve to the container's private internal listener from the network where Celld operates.

For a single-node setup this may be a platform-private service name such as:

```text
celld.internal
```

Even though no second node currently dials it, Celld requires an advertised address when the internal listener binds to `0.0.0.0`.

---

## Single-node container configuration

The container should:

- attach to the platform/private application network,
- bind Celld to `0.0.0.0:8080` and `0.0.0.0:8081`,
- route only port 8080 through public ingress,
- keep port 8081 private,
- mount persistent storage at the path used by `CELLD_WATCH`,
- receive fleet bucket credentials through the infrastructure/secrets layer,
- receive SIGTERM on shutdown,
- have a stop grace longer than Celld's graceful shutdown bound.

A conceptual Docker Compose-style shape is:

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

Supply credentials through your secrets mechanism rather than committing them into Compose or the application repository.

The platform ingress should publish only the public Worker service.

---

## Starting a single node

Operational sequence:

```text
1. Provision fleet bucket
2. Provision persistent CELLD_WATCH volume
3. Configure object-store credentials
4. Start Celld container
5. Wait for Celld health
6. Deploy application
7. Test public API and realtime paths
```

Health endpoint:

```bash
curl -f http://CELLD_PUBLIC_ADDRESS/.well-known/celld/health
```

Once healthy, deploy this project:

```bash
pnpm install
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

The deploy process must have the same fleet bucket configuration and credentials as the node.

---

## Single-node application deployment

Application deploys do not restart the Celld process.

```text
pnpm deploy
    |
    v
celld deploy
    |
    v
fleet deployment pointer
    |
    v
single running node polls pointer
    |
    v
new application generation adopted
```

By default, nodes poll for the deployment pointer periodically.

The previous application continues serving while the replacement generation is built.

Already-running requests finish on the generation that accepted them.

---

## Single-node runtime upgrade

A single-node runtime upgrade necessarily introduces an application-maintenance window because there is no second node to receive public traffic.

Procedure:

```text
remove/drain public traffic
        |
        v
SIGTERM Celld
        |
        v
graceful shutdown
        |
        v
replace image/binary
        |
        v
start Celld
        |
        v
wait healthy
        |
        v
restore traffic
```

Steps:

1. pause application deploys,
2. drain or remove the node from public ingress,
3. send SIGTERM through the platform supervisor,
4. allow Celld to complete its graceful shutdown,
5. update the pinned Celld version,
6. preserve the existing `CELLD_WATCH` volume,
7. start the replacement container,
8. wait for `/.well-known/celld/health`,
9. run diagnostics,
10. restore public traffic.

Do not delete the node work directory during an upgrade unless the exact Celld release documentation explicitly requires it.

---

# Multi-node production deployment

Use a multi-node fleet when:

- application availability during node maintenance matters,
- durable-write latency should avoid always waiting for the bucket,
- workload exceeds one node,
- you want rolling node maintenance when versions are compatible.

A normal production fleet has at least two nodes; three or more nodes provide more capacity and maintenance headroom.

---

## Multi-node topology

```text
                         fleet bucket
                             |
             +---------------+---------------+
             |               |               |
             v               v               v
        Celld node A     Celld node B    Celld node C
        public :8080     public :8080    public :8080
        private:8081     private:8081    private:8081
             ^               ^               ^
             +---------------+---------------+
                     trusted private network

                             ^
                             |
                       public ingress
```

Every node:

- uses the same fleet bucket,
- uses its own persistent `CELLD_WATCH`,
- binds its internal listener to `0.0.0.0:8081`,
- advertises a unique peer-reachable private hostname/address,
- normally runs the same Celld release,
- receives public Worker traffic from the load balancer.

---

## Multi-node durability

Use:

```dotenv
CELLD_DURABILITY=fleet
```

This is Celld's normal multi-node posture.

The owner of a durable cell sends a write to one or two compatible peers. It may acknowledge after a follower has the write on disk, or after the bucket proof completes, whichever occurs first.

The bucket remains the shared long-term persistence layer.

---

## Multi-node environment

Node A:

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

Node B:

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

Node C:

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://object-storage.example.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

CELLD_ADDR=0.0.0.0:8080
CELLD_INTERNAL_ADDR=0.0.0.0:8081
CELLD_ADVERTISE=celld-c.internal:8081

CELLD_WATCH=/var/lib/celld/state
CELLD_DURABILITY=fleet
```

No `CELLD_NODE` is required. Celld generates a node-session ID for each process.

---

## Multi-node private networking

The advertised hostnames must be reachable from every Celld node:

```text
celld-a.internal:8081
celld-b.internal:8081
celld-c.internal:8081
```

If every container runs on the same container network, platform/container DNS may be sufficient.

If nodes live on different physical servers, ordinary single-host Docker DNS is not enough. Use a cross-host private network such as:

- private datacenter/VPC networking,
- Docker/Swarm-style overlay networking,
- WireGuard,
- Tailscale,
- another trusted encrypted overlay.

The network must route:

```text
celld-a.internal:8081 -> node A container :8081
celld-b.internal:8081 -> node B container :8081
celld-c.internal:8081 -> node C container :8081
```

Do not expose these mappings publicly.

The public 8080 listener and private 8081 listener are different security boundaries.

---

## Starting a multi-node fleet

There is no join command and no peer list to maintain.

Start each node with:

- the same `CELLD_BUCKET`,
- compatible Celld versions,
- its own persistent `CELLD_WATCH`,
- its own peer-reachable `CELLD_ADVERTISE`.

Celld publishes node leases to the fleet bucket and discovers the other live nodes from those leases.

Recommended first-start sequence:

```text
1. Provision fleet bucket
2. Provision private cross-node networking
3. Start node A
4. Wait healthy
5. Start node B
6. Wait healthy
7. Start node C / remaining nodes
8. Verify peer reachability / diagnose fleet
9. Add healthy public listeners to ingress
10. Deploy application
```

Starting all nodes together is also valid, but serial startup makes initial networking mistakes easier to diagnose.

---

## Adding a node later

To scale out:

1. provision a new persistent `CELLD_WATCH` volume,
2. use the same fleet bucket,
3. set `CELLD_INTERNAL_ADDR=0.0.0.0:8081`,
4. give the node a unique peer-reachable `CELLD_ADVERTISE`,
5. use a compatible Celld release,
6. start the node,
7. wait for public health to become healthy,
8. run fleet diagnostics,
9. add its public Worker listener to ingress.

The new node discovers the fleet from the bucket.

Existing nodes do not need configuration changes.

---

## Removing a node

Prefer graceful shutdown.

When the supervisor sends SIGTERM, Celld:

1. marks public health unhealthy,
2. stops accepting new public requests,
3. finishes accepted requests,
4. proves durable state,
5. hands cells to compatible peers,
6. releases ownership,
7. exits within the configured shutdown budget.

Remove nodes one at a time during normal maintenance.

Do not use SIGKILL as the normal node-removal procedure.

---

## Multi-node application deployment

Application deployment is fleet-wide and does not need per-node deploy commands.

```text
pnpm deploy
      |
      v
celld deploy
      |
      v
shared fleet bucket
      |
      v
deployment pointer changes
      |
      +--------+--------+
      |        |        |
      v        v        v
    node A   node B   node C
      |        |        |
      +-- each adopts new generation in place
```

Do not deploy separately to every node.

Serialize application deploy writers so only one production deploy updates the fleet pointer at a time.

---

# Object-store configuration

Every node in one fleet and every `celld deploy` invocation must use the same fleet bucket/prefix.

A bucket prefix can isolate separate fleets inside one physical bucket:

```text
s3://shared-bucket/production
s3://shared-bucket/development
```

Treat each prefix as an administrative trust boundary.

## S3-compatible storage

```dotenv
CELLD_BUCKET=s3://my-celld-fleet
S3_ENDPOINT=https://ACCOUNT.r2.cloudflarestorage.com
AWS_REGION=auto

AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# AWS_SESSION_TOKEN=...
```

Celld uses the standard AWS credential chain.

For AWS S3 itself, `S3_ENDPOINT` is normally unnecessary and the region should be the actual AWS region.

## Google Cloud Storage

```dotenv
CELLD_BUCKET=gs://my-celld-fleet
```

Use Google Application Default Credentials or the supported Google credential environment.

## Azure Blob Storage

```dotenv
CELLD_BUCKET=az://my-container
AZURE_STORAGE_ACCOUNT_NAME=...
```

Use an account key, managed identity, or workload identity.

Production fleet nodes require a supported cloud/object-store backend. The local object store used by `celld dev` is development-only.

---

# Application environment versus node environment

Keep application Worker variables separate from Celld infrastructure variables.

Application variables belong in this project's application contract:

```text
.env
.env.example
.env.prod.example
celld/env.ts
```

Examples:

```text
DATABASE_URL
JWT_SIGNING_KEY
PAYMENT_API_KEY
LOG_LEVEL
```

Celld node/fleet variables belong to infrastructure:

```text
CELLD_BUCKET
S3_ENDPOINT
cloud credentials
CELLD_ADDR
CELLD_INTERNAL_ADDR
CELLD_ADVERTISE
CELLD_WATCH
CELLD_DURABILITY
runtime tuning
```

Do not copy node/fleet credentials into Worker vars.

Do not add them to `.env.example`.

---

# Health checks

Use:

```text
/.well-known/celld/health
```

Example:

```bash
curl -f http://127.0.0.1:8080/.well-known/celld/health
```

The health endpoint becomes unhealthy during:

- graceful drain,
- initial replacement/join readiness gating,
- unhealthy runtime conditions.

Use it for:

- load-balancer health,
- platform readiness,
- rolling-update gates,
- post-restart checks.

Do not use the private operator listener as a public health endpoint.

---

# Diagnostics

Use the same bucket environment/credentials as the fleet:

```bash
celld diagnose
```

By default, diagnostics can verify the bucket's conditional-write behavior.

Useful operator checks include:

```bash
celld --version
celld diagnose
celld cell list
```

The private internal listener also exposes operator state such as:

```bash
curl http://PRIVATE_NODE_ADDRESS:8081/state
```

Only use private operator endpoints from the trusted internal network.

---

# Application deployment

From this repository:

```bash
pnpm install
pnpm check
pnpm deploy -- --dry-run
pnpm deploy
```

The deployment process must inherit:

```text
CELLD_BUCKET
S3_ENDPOINT / region when applicable
provider credentials
```

The project's deploy wrapper:

1. loads the application environment,
2. selects only allowed Worker variables,
3. creates temporary `.wrangler.deploy.jsonc`,
4. invokes native `celld deploy`,
5. removes the temporary config.

The canonical `wrangler.jsonc` remains committed and secret-free.

---

## What Celld does during an application deploy

```text
source + assets
      |
      v
celld deploy
      |
      v
write modules/assets/manifest
      |
      v
update deployment pointer last
      |
      v
nodes poll pointer
      |
      v
nodes build replacement generation
      |
      v
new requests switch to replacement
```

Celld nodes currently poll the deployment pointer according to `CELLD_DEPLOY_POLL_S`.

A failed replacement build/adoption does not replace the generation already serving on that node.

Already-started requests finish on their original generation.

No node restart is required.

---

## Durable Objects and deployment transitions

During an application rollout, an adjacent application generation may briefly communicate with a Durable Object still running the previous generation.

Keep internal RPC/message contracts compatible across consecutive releases.

Resident objects eventually move to the new application generation.

Realtime clients should support reconnecting WebSockets because node/runtime/deployment transitions can close transport connections.

---

## Serialize deployments

Only one deployment writer should modify a fleet at one time.

Enforce a per-fleet lock in CI/CD or the deployment platform:

```text
production fleet
      |
      +-- one active pnpm deploy
```

Do not create a second application-level release database just for this.

---

# Application rollback

The boilerplate does not maintain a separate rollback service.

To return to a known-good application:

1. check out/build the known-good source revision,
2. provide its production Worker variables,
3. run `pnpm deploy`,
4. let the fleet adopt it normally.

A code rollback does not undo durable state already written by a newer version.

Treat persistent identifiers, Durable Object class names, migration tags, D1 identities, queue identities, and similar resources as schema.

---

# Graceful shutdown

Celld handles SIGTERM and SIGINT as graceful shutdown signals.

During shutdown it:

- marks the public health endpoint unhealthy,
- stops accepting new public work,
- finishes already accepted public requests,
- preserves/replicates durable state,
- hands ownership to peers where applicable,
- exits within its configured shutdown budget.

The current main shutdown control is:

```text
CELLD_SHUTDOWN_TOTAL_MS
```

Its current default is 40000 ms.

Your platform stop grace must be longer than this value.

For example, a 90-second container stop grace is a reasonable starting point with the current default.

If you increase `CELLD_SHUTDOWN_TOTAL_MS`, increase the platform stop grace too.

---

# Multi-node load-balancer drain

In a multi-node deployment, the preferred drain path is:

```text
SIGTERM node A
     |
     v
node A health -> 503
     |
     v
load balancer stops sending new requests
     |
     v
node A completes existing work + handoff
     |
     v
node A exits
```

A health-aware load balancer therefore does not require a separate custom drain API.

If your ingress only uses DNS and does not react to health checks, remove the node from DNS/ingress first and allow enough time for cached routing/active connections to clear before terminating it.

---

# Celld runtime upgrades

Before upgrading Celld itself:

1. read the exact Celld release notes,
2. determine whether the old and new releases can coexist,
3. choose rolling upgrade or stopped-fleet upgrade,
4. pause application deploys,
5. verify bucket and local-node backup/recovery posture,
6. confirm stop-grace configuration,
7. update the pinned image/binary only through the chosen procedure.

Do not assume every Celld release pair supports mixed-version operation.

---

## Rolling multi-node upgrade

Use a rolling update only when the release documentation says the two releases are compatible in a serving fleet.

Example:

```text
node A old   node B old   node C old
    |
    | replace A
    v
node A new   node B old   node C old
    |
    | wait A healthy
    | replace B
    v
node A new   node B new   node C old
    |
    | wait B healthy
    | replace C
    v
node A new   node B new   node C new
```

For each node:

1. verify the remaining fleet has enough capacity,
2. remove/drain the node through normal health-based shutdown,
3. send SIGTERM,
4. allow graceful handoff to finish,
5. replace the pinned Celld image/binary,
6. reuse that node's persistent `CELLD_WATCH`,
7. start the replacement,
8. wait for public health,
9. run diagnostics,
10. only then proceed to the next node.

Do not advance the rollout merely because the container is running.

Advance after readiness/health is established.

---

## Stopped-fleet upgrade

Use this when the Celld release notes say mixed versions cannot safely coexist.

Procedure:

```text
stop public traffic / maintenance mode
stop application deploy writers
        |
        v
gracefully stop ALL old nodes
        |
        v
wait until old leases are gone
        |
        v
backup bucket + local node state
        |
        v
prevent old images from restarting
        |
        v
update all Celld versions
        |
        v
start new fleet
        |
        v
wait healthy + diagnose
        |
        v
restore traffic
```

Steps:

1. pause application deployment,
2. stop or drain public traffic,
3. gracefully stop every old-version node,
4. verify old node leases are no longer live,
5. back up the fleet bucket,
6. preserve/back up every `CELLD_WATCH` volume,
7. ensure the old image cannot auto-restart,
8. update the Celld image/binary everywhere,
9. start the new nodes,
10. wait for readiness,
11. run fleet diagnostics,
12. restore public traffic.

Follower disks can contain acknowledged writes that are not yet in the bucket, so do not delete local node storage as part of an incompatible upgrade.

---

# Important operational environment variables

These are infrastructure settings, not application Worker vars.

| Variable | Purpose |
| --- | --- |
| `CELLD_BUCKET` | Fleet object-store bucket/container and optional prefix |
| `CELLD_ADDR` | Local bind for the public Worker listener |
| `CELLD_INTERNAL_ADDR` | Local bind for the private peer/operator listener |
| `CELLD_ADVERTISE` | Stable hostname/private address peers dial |
| `CELLD_WATCH` | Persistent local SQLite/replication work directory |
| `CELLD_DURABILITY` | `bucket` or `fleet` durability posture |
| `CELLD_NODE` | Optional explicit node-session ID; normally leave unset |

Common tuning/settings:

| Variable | Current default / role |
| --- | --- |
| `CELLD_DEPLOY_POLL_S` | Deployment pointer polling interval; currently 30 seconds |
| `CELLD_DEPLOY_MAX_AGE_S` | Maximum old-generation residency after adoption; currently 60 seconds |
| `CELLD_SHUTDOWN_TOTAL_MS` | Graceful process stop bound; currently 40000 ms |
| `CELLD_READY_FLEET_GATE_MS` | Initial fleet readiness gate; currently 120000 ms |
| `CELLD_OPERATION_DEADLINE_MS` | Normal operation deadline; currently 15000 ms |
| `CELLD_ACTIVATIONS` | Concurrent cold-cell activation limit |
| `CELLD_MAX_RESIDENT_CELLS` | Optional resident-cell cap |
| `CELLD_MAX_RSS_MB` | Memory-pressure threshold |
| `CELLD_IDLE_EVICT_S` | Optional idle-cell hibernation age |
| `CELLD_PLACEMENT_WEIGHT` | Relative ownership share; defaults from CPU capacity |
| `RUST_LOG` | Runtime logging filter |

Always consult `celld --help` for the exact version running in production.

---

# Deployment checklists

## Single-node first deployment

- [ ] Fleet bucket created
- [ ] Persistent `CELLD_WATCH` volume created
- [ ] `CELLD_ADDR=0.0.0.0:8080`
- [ ] `CELLD_INTERNAL_ADDR=0.0.0.0:8081`
- [ ] private `CELLD_ADVERTISE` configured
- [ ] `CELLD_DURABILITY=bucket`
- [ ] `CELLD_NODE` left unset
- [ ] port 8080 routed through ingress
- [ ] port 8081 private only
- [ ] Celld health successful
- [ ] `pnpm check`
- [ ] `pnpm deploy`
- [ ] REST request succeeds
- [ ] WebSocket/reconnect succeeds

## Multi-node first deployment

- [ ] Fleet bucket created
- [ ] Private cross-node network working
- [ ] Separate persistent `CELLD_WATCH` for every node
- [ ] all nodes bind public `0.0.0.0:8080`
- [ ] all nodes bind internal `0.0.0.0:8081`
- [ ] every node has a unique peer-reachable `CELLD_ADVERTISE`
- [ ] `CELLD_DURABILITY=fleet`
- [ ] `CELLD_NODE` left unset
- [ ] port 8081 is not public
- [ ] all nodes pass health/readiness
- [ ] fleet diagnostics succeed
- [ ] healthy nodes added to public ingress
- [ ] `pnpm deploy`
- [ ] REST request succeeds
- [ ] Durable Object writes succeed
- [ ] WebSocket/reconnect succeeds

## Before an application deploy

- [ ] correct Worker variables supplied
- [ ] correct fleet bucket credentials supplied
- [ ] only one active deployment writer
- [ ] `pnpm check` passes
- [ ] dry-run succeeds when appropriate
- [ ] adjacent release RPC/message contracts remain compatible

## Before a Celld runtime upgrade

- [ ] exact old/new release notes reviewed
- [ ] rolling vs stopped-fleet decision made
- [ ] new Celld version/digest pinned
- [ ] application deploys paused
- [ ] persistent node volumes confirmed
- [ ] bucket backup/recovery posture confirmed
- [ ] stop grace exceeds Celld shutdown bound
- [ ] surviving capacity confirmed for rolling maintenance

## After a Celld runtime upgrade

- [ ] intended `celld --version`
- [ ] public health healthy
- [ ] `celld diagnose` succeeds
- [ ] REST API succeeds
- [ ] Durable Object read/write succeeds
- [ ] WebSocket connection/reconnect succeeds
- [ ] logs contain no unexpected handoff/recovery errors

---

# Ownership boundary

The application repository owns:

```text
wrangler.jsonc
Worker / Hono / Durable Object code
frontend/static assets
application environment contract
application deployment wrapper
ARCHITECTURE.md
DEPLOY.md
```

Infrastructure owns:

```text
Celld image/version
CELLD_BUCKET
object-store credentials
CELLD_ADDR
CELLD_INTERNAL_ADDR
CELLD_ADVERTISE
CELLD_WATCH volume
CELLD_DURABILITY
private network / overlay
public ingress / TLS
health checking
stop grace
node count
runtime upgrades
deployment serialization
```

That separation keeps the boilerplate portable across Coolify, Docker Compose, Kubernetes, Nomad, systemd, and other deployment systems.

---

# Operational rule of thumb

## Single-node

> Bind both listeners to `0.0.0.0` inside the container, keep the internal listener private, use bucket durability, and accept a maintenance window when the Celld process itself is upgraded.

## Multi-node

> Bind both listeners to `0.0.0.0` inside each container, advertise a unique private peer-reachable address for each node, use fleet durability, and remove/replace one node at a time when the Celld release supports rolling compatibility.

## Application deployment

> Run `pnpm deploy` once per fleet. Do not deploy application code node-by-node.

## Runtime upgrade

> Check release compatibility first. Rolling update when explicitly compatible; stopped-fleet update when not.

## Node identity

> Leave `CELLD_NODE` unset unless an operator has a specific need to control the generated node-session ID.
