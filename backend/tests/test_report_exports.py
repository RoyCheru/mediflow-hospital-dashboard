"""Report exports: built on request, downloadable, readable, validated."""

import csv
import io

import pytest

from tests.helpers import auth, create_invoice_flow

REPORTS = ["revenue", "claims_aging", "no_shows", "doctor_workload", "daily_cash"]


def _export(client, tokens, report_key, fmt, parameters=None):
    return client.post(
        "/api/v1/reports/exports",
        json={"report_key": report_key, "format": fmt, "parameters": parameters or {}},
        headers=auth(tokens["admin"]),
    )


@pytest.mark.parametrize("report_key", REPORTS)
@pytest.mark.parametrize("fmt", ["CSV", "PDF"])
def test_every_report_exports_and_downloads(client, tokens, ids, report_key, fmt):
    create_invoice_flow(client, tokens, ids)  # some visits, invoices and a workload row
    response = _export(client, tokens, report_key, fmt, {"start_date": "2020-01-01"})
    assert response.status_code == 201, response.get_json()
    data = response.get_json()["data"]
    assert data["status"] == "COMPLETED", data

    download = client.get(
        f"/api/v1/reports/exports/{data['id']}/download", headers=auth(tokens["admin"])
    )
    assert download.status_code == 200
    body = download.data
    if fmt == "PDF":
        assert body.startswith(b"%PDF")
        return
    text = body.decode()
    # Nested values are tables, never Python reprs like "[{'key': ...}]".
    assert "[{" not in text and "{'" not in text and "[]" not in text
    rows = list(csv.reader(io.StringIO(text)))
    assert rows and rows[0]


def test_doctor_workload_csv_lists_one_row_per_doctor(client, tokens, ids):
    create_invoice_flow(client, tokens, ids)
    # The helper books its appointment in 2030, so the range must reach it.
    data = _export(
        client,
        tokens,
        "doctor_workload",
        "CSV",
        {"start_date": "2020-01-01", "end_date": "2031-01-01"},
    ).get_json()["data"]
    text = client.get(
        f"/api/v1/reports/exports/{data['id']}/download", headers=auth(tokens["admin"])
    ).data.decode()
    rows = list(csv.reader(io.StringIO(text)))
    header_index = rows.index(["doctors"]) + 1
    assert "doctor_id" in rows[header_index]
    assert len(rows) > header_index + 1  # at least one doctor row


def test_daily_cash_export_uses_the_selected_day(client, tokens):
    data = _export(
        client, tokens, "daily_cash", "CSV", {"start_date": "2026-01-01", "end_date": "2026-01-05"}
    ).get_json()["data"]
    text = client.get(
        f"/api/v1/reports/exports/{data['id']}/download", headers=auth(tokens["admin"])
    ).data.decode()
    assert "business_date,2026-01-05" in text


def test_export_rejects_unknown_format_and_bad_dates(client, tokens):
    bad_format = _export(client, tokens, "revenue", "XLSX")
    assert bad_format.status_code == 400
    assert "format" in bad_format.get_json()["error"]["details"]
    bad_date = _export(client, tokens, "revenue", "CSV", {"start_date": "01/11/2026"})
    assert bad_date.status_code == 400
    assert _export(client, tokens, "not_a_report", "CSV").status_code == 400


def test_async_mode_falls_back_to_inline_when_the_broker_is_down(client, tokens, app):
    app.config["REPORT_EXPORTS_ASYNC"] = True
    app.config["CELERY_BROKER_URL"] = "redis://127.0.0.1:1/0"  # nothing listens here
    response = _export(client, tokens, "no_shows", "CSV")
    assert response.status_code == 201
    assert response.get_json()["data"]["status"] == "COMPLETED"
