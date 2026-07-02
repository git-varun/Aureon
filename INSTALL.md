# Aureon — First-Time Setup Guide

## Prerequisites

- Docker and Docker Compose
- A `.env` file at the project root (copy from `.env.example`)
- Required env vars: `DATABASE_URL` (must be `postgresql://…`), `REDIS_URL`

## 1. Start infrastructure and the app

```bash
sudo docker compose up -d
```

This starts PostgreSQL, Redis, the FastAPI backend, and the React frontend.  
Alembic migrations run automatically on API startup — no manual `alembic upgrade` needed.

## 2. Bootstrap the first administrator

Run the bootstrap script once from the project root.  
It creates a user, an organization, and an OWNER membership. Safe to re-run (idempotent).

```bash
PYTHONPATH=backend python backend/scripts/bootstrap_admin.py \
    --email admin@example.com \
    --password "SecurePass123!" \
    --first-name Admin \
    --org-name "My Organization"
```

All args can be passed as environment variables instead:

| Env var | Default |
|---------|---------|
| `BOOTSTRAP_EMAIL` | *(required)* |
| `BOOTSTRAP_PASSWORD` | *(required, min 8 chars)* |
| `BOOTSTRAP_FIRST_NAME` | `Admin` |
| `BOOTSTRAP_LAST_NAME` | *(empty)* |
| `BOOTSTRAP_ORG_NAME` | `My Organization` |
| `BOOTSTRAP_ORG_SLUG` | auto-derived from org name |

The script prints a summary when done. No migrations are required — the schema is managed by Alembic and already supports users, organizations, memberships, and invitations.

## 3. Log in as administrator

Open the app (default: `http://localhost:3000`) and sign in with the email and password you used above.

## 4. Create an invitation

1. Go to **Settings → Invitations**.
2. Click **+ Invite**.
3. Enter the invitee's email address and select a role.
4. Click **Send invitation** — the invitation token is created immediately.
5. Click **Copy link** next to the new invitation row.

The copied link looks like:  
`http://localhost:3000/register?token=<token>`

## 5. User registers

Share the copied link with the invitee. They open it, fill in their name, email (must match the invitation), and a password, then submit. Their account is created and they are automatically added to your organization.

## 6. User logs in and completes onboarding

The invitee logs in with their new credentials and goes through the onboarding flow to configure their portfolio.

---

## That's it.

From zero to a fully onboarded user:

```
docker compose up          → app is running
bootstrap_admin.py         → first admin created
Settings → Invitations     → invitation link generated
/register?token=<token>    → invitee registers
login                      → invitee authenticated
onboarding                 → setup complete
```

No manual SQL. No database edits. No JWT manipulation.
