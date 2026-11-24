from app.extensions import db


def lock_row(model, row_id):
    """Take a row lock (SELECT ... FOR UPDATE) on one row until the transaction ends.

    Only the primary key is selected. Selecting the whole entity would also emit
    the model's eager-loaded LEFT OUTER JOINs, and Postgres refuses FOR UPDATE on
    the nullable side of an outer join (SQLite ignores row locks, so the test
    suite on SQLite cannot catch that).
    """
    db.session.execute(db.select(model.id).where(model.id == row_id).with_for_update())
