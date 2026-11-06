from app.common.enums import ConsentChannel, NotificationChannel
from app.extensions import db
from app.notifications.models import Notification
from app.notifications.service import dispatch


def _notification(patient_id, template_key="booking_confirmation"):
    item = Notification(
        patient_id=patient_id,
        channel=NotificationChannel.WHATSAPP,
        template_key=template_key,
        recipient_address="0700000005",
        payload={"patient_name": "Pam", "doctor_name": "Dan", "scheduled_start": "soon"},
    )
    db.session.add(item)
    db.session.commit()
    return item


def test_dispatch_respects_consent(app, ids):
    item = _notification(ids["patient_id"])
    item = dispatch(item.id)
    assert item.status.value == "SENT"
    assert item.attempts == 1


def test_dispatch_cancels_without_consent(app, ids):
    from app.patients.models import ConsentRecord

    db.session.add(
        ConsentRecord(
            patient_id=ids["patient_id"],
            channel=ConsentChannel.WHATSAPP,
            granted=False,
            capture_source="TEST",
        )
    )
    db.session.commit()
    item = _notification(ids["patient_id"])
    item = dispatch(item.id)
    assert item.status.value == "CANCELLED"


def test_admin_can_update_template(client, tokens):
    templates = client.get("/api/v1/admin/notification-templates", headers=auth(tokens["admin"]))
    assert templates.status_code == 200
    template = templates.get_json()["data"]["items"][0]
    response = client.patch(
        f"/api/v1/admin/notification-templates/{template['id']}",
        json={"body": "Updated body for {patient_name}"},
        headers=auth(tokens["admin"]),
    )
    assert response.status_code == 200
    assert response.get_json()["data"]["version"] == template["version"] + 1


from tests.helpers import auth  # noqa: E402
