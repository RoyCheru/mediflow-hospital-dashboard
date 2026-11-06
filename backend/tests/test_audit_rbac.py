import pytest

from tests.helpers import auth


def test_audit_log_is_filterable_and_protected(client, tokens):
    response = client.get(
        "/api/v1/admin/audit-events?action=auth.login",
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["meta"]["total"] >= 1

    denied = client.get("/api/v1/admin/audit-events", headers=auth(tokens["reception"]))
    assert denied.status_code == 403


def test_audit_rows_are_append_only(app):
    from app.audit.models import AuditLog
    from app.extensions import db

    item = AuditLog.query.first()
    if item is None:
        from app.common.audit import record_audit

        record_audit("test.event", "test", None)
        db.session.commit()
        item = AuditLog.query.first()
    item.action = "tampered"
    with pytest.raises(ValueError):
        db.session.commit()
    db.session.rollback()


def test_cashier_cannot_register_patient(client, tokens):
    response = client.post(
        "/api/v1/patients",
        json={
            "first_name": "No",
            "last_name": "Access",
            "date_of_birth": "1990-01-01",
            "phone": "0799999999",
        },
        headers=auth(tokens["cashier"]),
    )
    assert response.status_code == 403


def test_patient_cannot_read_audit_or_users(client, tokens):
    assert (
        client.get("/api/v1/admin/audit-events", headers=auth(tokens["patient"])).status_code == 403
    )
    assert client.get("/api/v1/admin/users", headers=auth(tokens["patient"])).status_code == 403
