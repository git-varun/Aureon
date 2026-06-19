from typing import Generator
import time
import re
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logger import logger
from app.core.observability.metrics import db_query_duration_seconds, db_connection_pool_usage

# Initialize database engine
engine = create_engine(settings.DATABASE_URL, echo=settings.DATABASE_ECHO)
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
        logger.debug("Database Session: Session opened.", extra={"category": "DATABASE", "event": "db.session.opened"})
        yield db
    finally:
        logger.debug("Database Session: Session closed.", extra={"category": "DATABASE", "event": "db.session.closed"})
        db.close()

# Helper to parse SQL metadata
def parse_sql_metadata(statement: str):
    statement_upper = statement.strip().upper()
    operation = statement_upper.split()[0] if statement_upper else "UNKNOWN"
    
    table = "UNKNOWN"
    if operation == "SELECT":
        match = re.search(r"FROM\s+([a-zA-Z_0-9\.\`\"\[\]]+)", statement_upper)
        if match:
            table = match.group(1)
    elif operation == "INSERT":
        match = re.search(r"INTO\s+([a-zA-Z_0-9\.\`\"\[\]]+)", statement_upper)
        if match:
            table = match.group(1)
    elif operation in ("UPDATE", "DELETE"):
        match = re.search(r"(?:UPDATE|FROM)\s+([a-zA-Z_0-9\.\`\"\[\]]+)", statement_upper)
        if match:
            table = match.group(1)

    # Clean characters like ` " [ ]
    for char in ('`', '"', '[', ']'):
        table = table.replace(char, '')
    
    # Strip schema suffix
    if "." in table:
        table = table.split(".")[-1]
        
    return operation, table

# ── Connection Pool Observers ──────────────────────────────────────────

@event.listens_for(engine, 'connect')
def db_on_connect(dbapi_connection, connection_record):
    logger.info("Database Connection Pool: New connection established with backend.", extra={"category": "DATABASE", "event": "db.connection.connected"})
    db_connection_pool_usage.inc(amount=1.0, pool_state="connected")

@event.listens_for(engine, 'checkout')
def db_on_checkout(dbapi_connection, connection_record, connection_proxy):
    logger.debug("Database Connection Pool: Connection checked out from pool.", extra={"category": "DATABASE", "event": "db.connection.checkout"})
    db_connection_pool_usage.inc(amount=1.0, pool_state="active")

@event.listens_for(engine, 'checkin')
def db_on_checkin(dbapi_connection, connection_record):
    logger.debug("Database Connection Pool: Connection checked in / returned to pool.", extra={"category": "DATABASE", "event": "db.connection.checkin"})
    db_connection_pool_usage.dec(amount=1.0, pool_state="active")

# ── Query Observability ────────────────────────────────────────────────

@event.listens_for(engine, 'before_cursor_execute')
def db_before_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info[id(cursor)] = time.perf_counter()

@event.listens_for(engine, 'after_cursor_execute')
def db_after_execute(conn, cursor, statement, parameters, context, executemany):
    start_time = conn.info.pop(id(cursor), None)
    if start_time is not None:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        
        # Parse query metadata
        operation, table = parse_sql_metadata(statement)
        
        # Record latency metrics
        db_query_duration_seconds.observe(duration_ms / 1000.0, operation=operation, table=table)

        # Truncate statement for safety/formatting
        stmt_repr = statement.replace("\n", " ").strip()
        if len(stmt_repr) > 200:
            stmt_repr = stmt_repr[:200] + "..."
            
        extra = {
            "category": "DATABASE",
            "event": "db.query.executed",
            "operation": operation,
            "table": table,
            "duration_ms": duration_ms
        }

        # Raw SQL text is only logged when settings.DEBUG is explicitly enabled
        if duration_ms > 100:
            from app.core.observability.slow_operations import check_slow_operation
            check_slow_operation("DB", duration_ms, details=extra)

        if settings.DEBUG:
            extra["sql"] = stmt_repr
            if duration_ms <= 100:
                logger.debug(f"[Database Query] Duration: {duration_ms}ms - Query: {stmt_repr}", extra=extra)
        else:
            if duration_ms <= 100:
                logger.info(f"[Database Query] Duration: {duration_ms}ms - Operation: {operation} on Table: {table}", extra=extra)

@event.listens_for(engine, 'handle_error')
def db_handle_error(exception_context):
    orig = exception_context.original_exception
    logger.error(f"Database error occurred: {orig.__class__.__name__} - {orig}", extra={"category": "DATABASE", "event": "db.error"})

# ── Transaction Observers ──────────────────────────────────────────────

@event.listens_for(SessionLocal, 'after_begin')
def db_transaction_begin(session, transaction, connection):
    logger.debug("Database Transaction: Transaction boundary opened (BEGIN).", extra={"category": "DATABASE", "event": "db.transaction.begin"})

@event.listens_for(SessionLocal, 'after_commit')
def db_transaction_commit(session):
    logger.debug("Database Transaction: Transaction successfully saved (COMMIT).", extra={"category": "DATABASE", "event": "db.transaction.commit"})

@event.listens_for(SessionLocal, 'after_rollback')
def db_transaction_rollback(session):
    logger.warning("Database Transaction: Transaction rolled back (ROLLBACK).", extra={"category": "DATABASE", "event": "db.transaction.rollback"})
