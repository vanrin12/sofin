# Deploying Sofin to AWS (single EC2 + docker-compose)

A cost-aware lift-and-shift: **one EC2 instance** runs the entire stack via
[`infra/docker-compose.prod.yml`](../docker-compose.prod.yml) — the five NestJS
services, both Next.js apps (`web`, `admin`), and self-hosted **Postgres**,
**RabbitMQ**, and a **Caddy** reverse proxy (TLS + hostname routing). Only Caddy
(80/443) is exposed; everything else talks over the private compose network.

```
                Internet
                   │  :80/:443
            ┌──────▼──────┐
            │    Caddy     │  api.* → gateway · app.* → web · admin.* → admin
            └──────┬──────┘
   gateway · auth-sso · lms · crm · notification · web · admin
                   │
            postgres · rabbitmq            (named volumes on the EBS root disk)
                         ── all on ONE EC2 host ──
```

The infrastructure (VPC, EC2, Elastic IP, security group, SSM role, bootstrap)
is defined with **AWS CDK (TypeScript)** in this directory.

## Prerequisites

- AWS CLI configured (`aws configure`) with credentials for the target account.
- Node.js 20+ (for the CDK CLI). The host itself needs nothing pre-installed —
  user-data installs Docker + Compose.
- One-time per account/region: `npx cdk bootstrap`.

## 1 · Provision the host

```bash
cd infra/cdk
npm install
npx cdk bootstrap            # first time only, per account/region
npx cdk deploy
```

Useful context overrides (`-c key=value`):

| Key | Default | Purpose |
|---|---|---|
| `instanceType` | `t3.large` | Size. `t3.large` (8 GB) builds images on-box comfortably; `t3.medium` works with the 4 GB swapfile but is slower. |
| `volumeSize` | `30` | Root EBS GB (holds Docker images + DB/broker volumes). |
| `sshCidr` | _(none)_ | Open `:22` to this CIDR, e.g. `-c sshCidr=1.2.3.4/32`. Omit to use SSM only. |
| `keyName` | _(none)_ | Existing EC2 key pair name (only if you set `sshCidr`). |
| `repoUrl` | public Sofin repo | Git repo cloned to `/opt/sofin` on boot. |

CDK prints outputs: **`PublicIp`** (Elastic IP), **`InstanceId`**, and
**`SsmConnect`** (a ready-to-run shell command).

## 2 · DNS

Point three A records at the **Elastic IP** from the outputs:

```
api.example.com    → <PublicIp>
app.example.com    → <PublicIp>
admin.example.com  → <PublicIp>
```

Caddy fetches Let's Encrypt certificates automatically once DNS resolves.

## 3 · Configure secrets & launch the stack

Connect to the host (no SSH key required):

```bash
aws ssm start-session --target <InstanceId>     # from the SsmConnect output
```

On the host:

```bash
cd /opt/sofin
git pull                                          # get the latest
cp infra/.env.prod.example infra/.env.prod
vi infra/.env.prod                                # set POSTGRES_PASSWORD, RABBITMQ_PASSWORD,
                                                  #   API_DOMAIN / APP_DOMAIN / ADMIN_DOMAIN
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

The image builds once and is shared by every app container. Each service runs
`prisma migrate deploy` on boot, so the databases are created/migrated
automatically.

## 4 · Verify

```bash
docker compose -f infra/docker-compose.prod.yml ps      # all healthy/up
curl -k https://api.example.com/health                  # gateway → 200
# browse https://app.example.com (user) and https://admin.example.com (admin)
```

## Operations

- **Logs:** `docker compose -f infra/docker-compose.prod.yml logs -f <service>`
- **Update/redeploy:** `git pull && docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build`
- **Migrations:** run automatically on each service's container start; create new
  ones in dev with `pnpm db:migrate:<svc>` and commit them.
- **Tear down infra:** `cd infra/cdk && npx cdk destroy` (deletes the instance,
  EIP, VPC — and the EBS volume, so **back up the DB first** if it matters).

## Notes & caveats

- **Self-hosted data:** Postgres and RabbitMQ run as containers with named
  volumes on the EBS root disk — fine for staging/demo. For production-grade
  durability, move Postgres to **RDS** and the broker to **Amazon MQ** (the
  compose env vars already point at hostnames, so it's a URL swap).
- **`NEXT_PUBLIC_*` is build-time:** if/when the frontends call the API, the
  public API URL is baked when the image builds — add it as a Docker build arg
  and rebuild on change. (The current pages are static, so nothing to set yet.)
- **Security:** only 80/443 are public; shell access is via SSM (no inbound SSH
  unless you set `sshCidr`). Secrets live only in `infra/.env.prod`, which is
  git-ignored.
- **Single host = no HA:** one instance, no autoscaling. Good for cost; step up
  to ECS/EKS when you need redundancy.
