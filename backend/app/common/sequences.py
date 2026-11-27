from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from app.common.models import NumberSequence
from app.extensions import db


def next_sequence_value(key: str, prefix: str = "", width: int = 6) -> str:
    """Reserve the next value for a human-readable number.

    The row lock makes the operation safe under concurrent PostgreSQL writers.
    Callers keep the surrounding transaction so the number and its use commit or
    roll back together.
    """
    sequence = _locked(key)
    if sequence is None:
        # First use: create the counter in a savepoint. A concurrent first use may
        # win the race (unique key); then lock the row it created instead.
        try:
            with db.session.begin_nested():
                db.session.add(NumberSequence(key=key, prefix=prefix, current_value=0))
        except IntegrityError:
            pass
        sequence = _locked(key)
    sequence.current_value += 1
    db.session.flush()
    suffix = str(sequence.current_value).zfill(width)
    if "{year}" in prefix:
        prefix = prefix.replace("{year}", str(datetime.now(timezone.utc).year))
    return f"{prefix}{suffix}"


def _locked(key):
    return (
        db.session.execute(
            db.select(NumberSequence)
            .where(NumberSequence.key == key)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        .scalars()
        .first()
    )
