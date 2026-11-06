from datetime import datetime, timezone

from app.common.models import NumberSequence
from app.extensions import db


def next_sequence_value(key: str, prefix: str = "", width: int = 6) -> str:
    """Reserve the next value for a human-readable number.

    The row lock makes the operation safe under concurrent PostgreSQL writers.
    Callers keep the surrounding transaction so the number and its use commit or
    roll back together.
    """
    sequence = (
        db.session.execute(
            db.select(NumberSequence).where(NumberSequence.key == key).with_for_update()
        )
        .scalars()
        .first()
    )
    if sequence is None:
        sequence = NumberSequence(key=key, prefix=prefix, current_value=0)
        db.session.add(sequence)
        db.session.flush()
    sequence.current_value += 1
    db.session.flush()
    suffix = str(sequence.current_value).zfill(width)
    if "{year}" in prefix:
        prefix = prefix.replace("{year}", str(datetime.now(timezone.utc).year))
    return f"{prefix}{suffix}"
