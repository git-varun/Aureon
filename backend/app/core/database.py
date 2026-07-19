from typing import Any, Generator
import re
import time
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import logger


def _parse_sql_metadata(statement: str) -> tuple[str, str]:
    statement_upper = statement.strip().upper()
    operation = statement_upper.split()[0] if statement_upper else "SQL"
    table = "?"
    if operation in ("SELECT", "DELETE"):
        match = re.search(r"FROM\s+([a-zA-Z_0-9.\"\[\]`]+)", statement_upper)
    elif operation == "INSERT":
        match = re.search(r"INTO\s+([a-zA-Z_0-9.\"\[\]`]+)", statement_upper)
    elif operation == "UPDATE":
        match = re.search(r"UPDATE\s+([a-zA-Z_0-9.\"\[\]`]+)", statement_upper)
    else:
        match = None
    if match:
        table = match.group(1).strip("`\"[]").split(".")[-1]
    return operation, table

# Initialize database engine
_connect_args: dict[str, Any] = {}
if "psycopg" in settings.DATABASE_URL:
    _connect_args["prepare_threshold"] = None
    # All backend timestamps are UTC. Without this, the Postgres session timezone defaults to
    # the server's local zone, so naive TIMESTAMP WITHOUT TIME ZONE columns get silently
    # converted on write/read — timezone conversion belongs only in presentation, never here.
    _connect_args["options"] = "-c timezone=utc"

engine = create_engine(settings.DATABASE_URL, echo=settings.DATABASE_ECHO, connect_args=_connect_args)
if engine.dialect.name == 'sqlite':
    engine = engine.execution_options(schema_translate_map={
        'system': None, 'market': None, 'portfolio': None, 'evaluation': None,
        'recommendation': None, 'watchlist': None, 'config': None,
        'notification': None, 'news': None, 'ai': None
    })

# Configure transaction boundary mapping
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        logger.debug("Database Session: Session opened.", component="DB")
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        logger.debug("Database Session: Session closed.", component="DB")
        db.close()

# ── Connection Pool Observers ──────────────────────────────────────────

@event.listens_for(engine, 'connect')
def db_on_connect(dbapi_connection, connection_record):
    logger.debug("New connection established", component="DB")

@event.listens_for(engine, 'checkout')
def db_on_checkout(dbapi_connection, connection_record, connection_proxy):
    logger.debug("Connection checked out", component="DB")

@event.listens_for(engine, 'checkin')
def db_on_checkin(dbapi_connection, connection_record):
    logger.debug("Connection checked in", component="DB")

# ── Query Observability ────────────────────────────────────────────────
# Just whether the query happened and how long it took — not the SQL/params.

@event.listens_for(engine, 'before_cursor_execute')
def db_before_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info[id(cursor)] = time.perf_counter()

@event.listens_for(engine, 'after_cursor_execute')
def db_after_execute(conn, cursor, statement, parameters, context, executemany):
    start_time = conn.info.pop(id(cursor), None)
    duration_ms = int((time.perf_counter() - start_time) * 1000) if start_time is not None else None
    operation, table = _parse_sql_metadata(statement)
    logger.debug(f"{operation} {table}", component="DB", status="OK", duration_ms=duration_ms)

@event.listens_for(engine, 'handle_error')
def db_handle_error(exception_context):
    orig = exception_context.original_exception
    operation, table = _parse_sql_metadata(exception_context.statement or "")
    logger.error(f"{operation} {table} - {orig}", component="DB", status="FAIL")

# ── Transaction Observers ──────────────────────────────────────────────

@event.listens_for(SessionLocal, 'after_begin')
def db_transaction_begin(session, transaction, connection):
    logger.debug("Transaction BEGIN", component="DB")

@event.listens_for(SessionLocal, 'after_commit')
def db_transaction_commit(session):
    logger.debug("Transaction COMMIT", component="DB")

@event.listens_for(SessionLocal, 'after_rollback')
def db_transaction_rollback(session):
    logger.warning("Transaction ROLLBACK", component="DB", status="FAIL")
