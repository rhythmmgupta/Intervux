import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger(__name__)

# Adjust sqlite URL if needed
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def ensure_columns() -> None:
    """
    Add columns that were introduced after a database was first created.

    `Base.metadata.create_all` creates missing *tables* but never alters existing
    ones, so a database from an earlier release is missing the newer columns.
    This walks the declared models and issues a plain ADD COLUMN for anything
    absent, which both SQLite and PostgreSQL accept.

    ponytail: a 20-line stand-in for a migration tool. It only ever adds nullable
    columns and never drops, renames or backfills. The moment a change needs more
    than that (a NOT NULL default, a rename, a data migration), bring in Alembic
    instead of growing this.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all will build it in full
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                col_type = column.type.compile(engine.dialect)
                default = ""
                if column.default is not None and getattr(column.default, "is_scalar", False):
                    literal = column.default.arg
                    default = f" DEFAULT {literal!r}" if isinstance(literal, str) else f" DEFAULT {literal}"
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}{default}"))
                logger.info(f"Added missing column {table.name}.{column.name}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
