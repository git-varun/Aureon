# Aureon — Operations Reference

## Administrator lifecycle

### Create the first admin (Day 0)
```bash
PYTHONPATH=backend python backend/scripts/bootstrap_admin.py \
    --email admin@example.com \
    --password "SecurePass123!" \
    --org-name "My Organization"
```
Creates: user → organization → OWNER membership. Idempotent.

### Promote an existing member to admin
An OWNER can change any member's role from **Settings → Members** (coming soon) or by calling the API directly:

```bash
# PUT /api/v1/memberships/{org_id}/users/{user_id}  body: {"role": "ADMIN"}
```

### Deactivate an account
Set `is_active = false` via the database (no UI yet). The user's sessions will still exist but every request will be rejected by the auth middleware on the next check.

---

## Invitation lifecycle

| Status | Meaning |
|--------|---------|
| `PENDING` | Token is valid and unused |
| `ACCEPTED` | Invitee registered successfully; token is consumed |
| `REVOKED` | Manually cancelled by OWNER/ADMIN |
| `EXPIRED` | Not consumed before `expires_at` (7 days from creation) |

### Create an invitation
Settings → Invitations → **+ Invite** → enter email + role → **Send invitation**  
Tokens expire in **7 days**. Creating a new invitation for the same email in the same org automatically revokes the previous one.

### Copy the invitation link
Click **Copy link** on any PENDING row. The link is:  
`https://<host>/register?token=<token>`

### Revoke an invitation
Click **Revoke** on any PENDING row. The token becomes immediately invalid.

### Invitation is expired
Create a new invitation for the same email — the old one is auto-revoked.

---

## Organization lifecycle

### Create an organization
Settings → Organizations → **+ New** → name + slug → **Create organization**  
The creator becomes OWNER automatically.

### Switch active organization
Settings → Organizations → **Switch** on any row.  
The active org is stored in `localStorage.active_org_id` and all API calls use it.

---

## User onboarding

1. User receives invitation link.
2. User opens `/register?token=<token>`.
3. User enters name, email (must match invitation), password, accepts ToS.
4. Account is created; invitation is consumed; user is added to the organization with the invited role.
5. User logs in and completes the onboarding wizard.

---

## Login / logout / session management

- Sessions last **30 days**.
- A user can log out of the current session from the app header.
- A user can invalidate **all sessions** via `POST /api/v1/auth/logout/all`.
- On 401, the frontend clears `access_token` from localStorage and fires `auth:logout`.

---

## Password reset

No automated reset flow currently. To reset a password:

```bash
# Using the API directly (user must know their current password):
# POST /api/v1/auth/me/password
# body: { "current_password": "...", "new_password": "..." }
```

Or update the `password_hash` column directly for emergency recovery:

```python
PYTHONPATH=backend python - <<'EOF'
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.domain.entities.system import User
db = SessionLocal()
user = db.query(User).filter_by(email="admin@example.com").first()
user.password_hash = hash_password("NewSecurePass123!")
db.commit()
db.close()
EOF
```

---

## API documentation

Start the API with `ENABLE_API_DOCS=true` to enable Swagger UI:

```bash
ENABLE_API_DOCS=true PYTHONPATH=backend uvicorn app.api.main:app --port 8001
```

Then open `http://localhost:8001/docs`.

Key endpoint groups:
- `POST /api/v1/auth/register` — register with invitation token
- `POST /api/v1/auth/login` — password login
- `GET  /api/v1/organizations` — list orgs for current user
- `POST /api/v1/organizations` — create organization
- `GET  /api/v1/invitations?org_id=` — list invitations (OWNER/ADMIN only)
- `POST /api/v1/invitations?org_id=` — create invitation (OWNER/ADMIN only)
- `DELETE /api/v1/invitations/{id}` — revoke invitation (OWNER/ADMIN only)
