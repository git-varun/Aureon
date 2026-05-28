"""Baseline schema + multi-method auth tables.

Revision: 0001
Creates: otp_codes, magic_tokens
Alters:  users.password_hash → nullable, users.google_id added
         (All other tables are managed by create_all at startup for now.)

Revision ID: 0001_baseline_and_auth_methods
Revises: None
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_baseline_and_auth_methods"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ── users: create on fresh DB, or alter on existing install ───────────
    if "users" not in existing_tables:
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("email", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("password_hash", sa.String(), nullable=True),
            sa.Column("first_name", sa.String(), nullable=True),
            sa.Column("last_name", sa.String(), nullable=True),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("profile_picture", sa.String(), nullable=True),
            sa.Column("bio", sa.Text(), nullable=True),
            sa.Column("google_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )
        op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
    else:
        user_cols = {c["name"] for c in inspector.get_columns("users")}
        if "google_id" not in user_cols:
            op.add_column("users", sa.Column("google_id", sa.String(), nullable=True))
            op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)
        if "password_hash" in user_cols:
            op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=True)

    # ── otp_codes ──────────────────────────────────────────────────────────
    if "otp_codes" not in existing_tables:
        op.create_table(
            "otp_codes",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("identifier", sa.String(), nullable=False, index=True),
            sa.Column("code_hash", sa.String(), nullable=False),
            sa.Column("purpose", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )

    # ── magic_tokens ───────────────────────────────────────────────────────
    if "magic_tokens" not in existing_tables:
        op.create_table(
            "magic_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("token", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("email", sa.String(), nullable=False, index=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )

    # ── tokens: ensure table exists (created by create_all on fresh installs) ──
    if "tokens" not in existing_tables:
        op.create_table(
            "tokens",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("user_id", sa.Integer(), nullable=False, index=True),
            sa.Column("token", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("token_type", sa.String(), server_default=sa.text("'refresh'")),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        )


def downgrade() -> None:
    op.drop_table("magic_tokens")
    op.drop_table("otp_codes")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_column("users", "google_id")
    op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=False)
