"""The demo seed produces billing data the app itself could have produced."""

import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db


@pytest.fixture()
def seeded_app():
    application = create_app(TestConfig)
    with application.app_context():
        db.drop_all()
        db.create_all()
        result = application.test_cli_runner().invoke(args=["seed"])
        assert result.exit_code == 0, result.output
        yield application
        db.session.rollback()
        db.session.remove()
        db.drop_all()


def test_seeded_claims_match_their_outcomes(seeded_app):
    from app.billing.models import InvoiceAllocation
    from app.claims.models import Claim
    from app.common.enums import AllocationPayer, AllocationStatus, ClaimStatus

    claims = Claim.query.all()
    assert {claim.status for claim in claims} >= {
        ClaimStatus.SUBMITTED,
        ClaimStatus.APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.PAID,
    }
    for claim in claims:
        sha = InvoiceAllocation.query.get(claim.allocation_id)
        active = [a for a in claim.invoice.allocations if a.status != AllocationStatus.VOIDED]
        patient_share = sum(a.amount_minor for a in active if a.payer == AllocationPayer.PATIENT)
        if claim.status == ClaimStatus.REJECTED:
            # SHA will not pay: the share is released and the patient owes the balance.
            assert sha.status == AllocationStatus.VOIDED
            assert patient_share == claim.invoice.balance_minor > 0
        elif claim.status == ClaimStatus.PAID:
            assert sha.status == AllocationStatus.PAID
        else:
            # Submitted, under review or approved: SHA has not paid yet.
            assert sha.status == AllocationStatus.PENDING


def test_seeded_invoices_agree_with_their_transactions(seeded_app):
    from app.billing.models import Invoice, Transaction
    from app.common.enums import InvoiceStatus, TransactionStatus

    for invoice in Invoice.query.filter(Invoice.status != InvoiceStatus.DRAFT).all():
        paid = sum(
            t.amount_minor
            for t in Transaction.query.filter_by(invoice_id=invoice.id)
            if t.status == TransactionStatus.SUCCESS
        )
        assert invoice.amount_paid_minor == paid, invoice.invoice_number
        assert invoice.balance_minor == invoice.total_minor - paid, invoice.invoice_number


def test_seeded_pending_void_targets_an_unpaid_invoice(seeded_app):
    from app.billing.models import VoidRequest
    from app.common.enums import VoidRequestStatus

    pending = VoidRequest.query.filter_by(status=VoidRequestStatus.PENDING).all()
    assert pending
    for request in pending:
        assert request.invoice.amount_paid_minor == 0
