"""sprint_9a_2_architecture_recovery

Revision ID: 96527d56e0bd
Revises: e1e3012e8670
Create Date: 2026-06-16 00:40:59.842257

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '96527d56e0bd'
down_revision: Union[str, None] = 'e1e3012e8670'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    inspector = sa.inspect(bind)
    
    # Check if user_preferences exists
    pref_exists = 'user_preferences' in inspector.get_table_names(schema=schema_system)
    if not pref_exists:
        op.create_table(
            'user_preferences',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('user_id', sa.Uuid(), nullable=False),
            sa.Column('risk_profile', sa.String(), nullable=True),
            sa.Column('target_profit_pct', sa.Numeric(), nullable=True),
            sa.Column('monthly_saving', sa.Numeric(), nullable=True),
            sa.Column('working_area', sa.String(), nullable=True),
            sa.Column('swing_trading_enabled', sa.Boolean(), nullable=False, server_default='1'),
            sa.Column('bio', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['user_id'], [f'{schema_system}.users.id'] if schema_system else ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_system
        )
        op.create_index('idx_user_preferences_user_id', 'user_preferences', ['user_id'], unique=True, schema=schema_system)

    # Check if market_themes exists
    themes_exists = 'market_themes' in inspector.get_table_names(schema=schema_market)
    if not themes_exists:
        op.create_table(
            'market_themes',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('theme_id', sa.String(length=40), nullable=False),
            sa.Column('name', sa.String(length=80), nullable=False),
            sa.Column('desc', sa.String(), nullable=False),
            sa.Column('symbols', sa.JSON(), nullable=False),
            sa.Column('ret1m', sa.Numeric(), nullable=False, server_default='0'),
            sa.Column('owner_id', sa.Uuid(), nullable=True),
            sa.Column('forked_from', sa.String(length=40), nullable=True),
            sa.Column('inception_date', sa.String(length=20), nullable=True),
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['owner_id'], [f'{schema_system}.users.id'] if schema_system else ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            schema=schema_market
        )
        op.create_index('idx_market_themes_theme_id', 'market_themes', ['theme_id'], unique=True, schema=schema_market)
        op.create_index('idx_market_themes_owner_id', 'market_themes', ['owner_id'], schema=schema_market)

    # Check if theme_weights exists
    weights_exists = 'theme_weights' in inspector.get_table_names(schema=schema_market)
    if not weights_exists:
        op.create_table(
            'theme_weights',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('theme_id', sa.String(length=40), nullable=False),
            sa.Column('symbol', sa.String(length=40), nullable=False),
            sa.Column('weight', sa.Numeric(), nullable=False),
            sa.Column('effective_date', sa.String(length=20), nullable=False),
            sa.Column('mcap_at_set', sa.Numeric(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('theme_id', 'symbol', 'effective_date', name='uq_theme_weight_snapshot'),
            schema=schema_market
        )
        op.create_index('idx_theme_weight_theme_date', 'theme_weights', ['theme_id', 'effective_date'], schema=schema_market)

    # Data migration block
    connection = op.get_bind()
    users = connection.execute(
        sa.text(f"SELECT id, profile_picture FROM {schema_system}.users" if schema_system else "SELECT id, profile_picture FROM users")
    ).fetchall()
    
    import json
    import uuid
    from datetime import datetime, timezone
    
    for user_id, profile_pic in users:
        if not profile_pic or not isinstance(profile_pic, str):
            continue
        try:
            if profile_pic.strip().startswith('{'):
                data = json.loads(profile_pic)
                bio = data.get("bio")
                risk_profile = data.get("risk_profile", "moderate")
                working_area = data.get("working_area")
                target_profit_pct = data.get("target_profit_pct", 12.0)
                monthly_saving = data.get("monthly_saving", 25000.0)
                swing_trading_enabled = data.get("swing_trading_enabled", True)
                real_profile_picture = data.get("profile_picture")
                custom_themes = data.get("custom_themes", {})
                
                # Check if preference already exists
                pref_count = connection.execute(
                    sa.text(f"SELECT COUNT(*) FROM {schema_system}.user_preferences WHERE user_id = :uid" if schema_system else "SELECT COUNT(*) FROM user_preferences WHERE user_id = :uid"),
                    {"uid": user_id}
                ).scalar()
                
                if pref_count == 0:
                    pref_id = str(uuid.uuid4())
                    # Convert user_id to string if SQLite uses strings for UUIDs or bind as is
                    connection.execute(
                        sa.text(f"""
                            INSERT INTO {schema_system}.user_preferences (id, user_id, risk_profile, target_profit_pct, monthly_saving, working_area, swing_trading_enabled, bio, created_at, updated_at)
                            VALUES (:id, :user_id, :risk_profile, :target_profit_pct, :monthly_saving, :working_area, :swing_trading_enabled, :bio, :created_at, :updated_at)
                        """ if schema_system else """
                            INSERT INTO user_preferences (id, user_id, risk_profile, target_profit_pct, monthly_saving, working_area, swing_trading_enabled, bio, created_at, updated_at)
                            VALUES (:id, :user_id, :risk_profile, :target_profit_pct, :monthly_saving, :working_area, :swing_trading_enabled, :bio, :created_at, :updated_at)
                        """),
                        {
                            "id": pref_id,
                            "user_id": user_id,
                            "risk_profile": risk_profile,
                            "target_profit_pct": target_profit_pct,
                            "monthly_saving": monthly_saving,
                            "working_area": working_area,
                            "swing_trading_enabled": 1 if swing_trading_enabled else 0,
                            "bio": bio,
                            "created_at": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    )
                
                # Migrate custom themes
                for theme_key, theme_data in custom_themes.items():
                    theme_count = connection.execute(
                        sa.text(f"SELECT COUNT(*) FROM {schema_market}.market_themes WHERE theme_id = :tid" if schema_market else "SELECT COUNT(*) FROM market_themes WHERE theme_id = :tid"),
                        {"tid": theme_key}
                    ).scalar()
                    
                    if theme_count == 0:
                        theme_id_uuid = str(uuid.uuid4())
                        symbols_list = theme_data.get("symbols", [])
                        connection.execute(
                            sa.text(f"""
                                INSERT INTO {schema_market}.market_themes (id, theme_id, name, desc, symbols, ret1m, owner_id, forked_from, inception_date, is_public, created_at, updated_at)
                                VALUES (:id, :theme_id, :name, :desc, :symbols, :ret1m, :owner_id, :forked_from, :inception_date, :is_public, :created_at, :updated_at)
                            """ if schema_market else """
                                INSERT INTO market_themes (id, theme_id, name, desc, symbols, ret1m, owner_id, forked_from, inception_date, is_public, created_at, updated_at)
                                VALUES (:id, :theme_id, :name, :desc, :symbols, :ret1m, :owner_id, :forked_from, :inception_date, :is_public, :created_at, :updated_at)
                            """),
                            {
                                "id": theme_id_uuid,
                                "theme_id": theme_key,
                                "name": theme_data.get("name", "Custom Theme"),
                                "desc": theme_data.get("desc", ""),
                                "symbols": json.dumps(symbols_list),
                                "ret1m": theme_data.get("ret1m", 0.0),
                                "owner_id": user_id,
                                "forked_from": theme_data.get("forked_from"),
                                "inception_date": theme_data.get("inception_date"),
                                "is_public": 0,
                                "created_at": datetime.now(timezone.utc),
                                "updated_at": datetime.now(timezone.utc)
                            }
                        )
                        
                        weights_dict = theme_data.get("weights", {})
                        if not weights_dict and symbols_list:
                            w = round(1.0 / len(symbols_list), 4)
                            weights_dict = {s: w for s in symbols_list}
                            
                        effective_date = theme_data.get("inception_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
                        for sym, wt in weights_dict.items():
                            weight_id = str(uuid.uuid4())
                            connection.execute(
                                sa.text(f"""
                                    INSERT INTO {schema_market}.theme_weights (id, theme_id, symbol, weight, effective_date, created_at)
                                    VALUES (:id, :theme_id, :symbol, :weight, :effective_date, :created_at)
                                """ if schema_market else """
                                    INSERT INTO theme_weights (id, theme_id, symbol, weight, effective_date, created_at)
                                    VALUES (:id, :theme_id, :symbol, :weight, :effective_date, :created_at)
                                """),
                                {
                                    "id": weight_id,
                                    "theme_id": theme_key,
                                    "symbol": sym,
                                    "weight": wt,
                                    "effective_date": effective_date,
                                    "created_at": datetime.now(timezone.utc)
                                }
                            )
                
                # Update users table to clean up profile picture
                connection.execute(
                    sa.text(f"UPDATE {schema_system}.users SET profile_picture = :pic WHERE id = :uid" if schema_system else "UPDATE users SET profile_picture = :pic WHERE id = :uid"),
                    {"pic": real_profile_picture, "uid": user_id}
                )
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    schema_market = 'market' if bind.dialect.name != 'sqlite' else None
    schema_system = 'system' if bind.dialect.name != 'sqlite' else None
    inspector = sa.inspect(bind)
    
    if 'theme_weights' in inspector.get_table_names(schema=schema_market):
        op.drop_table('theme_weights', schema=schema_market)
    if 'market_themes' in inspector.get_table_names(schema=schema_market):
        op.drop_table('market_themes', schema=schema_market)
    if 'user_preferences' in inspector.get_table_names(schema=schema_system):
        op.drop_table('user_preferences', schema=schema_system)
