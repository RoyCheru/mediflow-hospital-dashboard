from app.integrations.pdf import build_pdf


class DocumentRenderer:
    def invoice(self, invoice):
        patient = getattr(invoice, "patient", None)
        patient_name = (
            " ".join(part for part in (patient.first_name, patient.last_name) if part)
            if patient is not None
            else "Patient"
        )
        lines = [
            "MediFlow",
            "INVOICE",
            "",
            f"Invoice number: {invoice.invoice_number or 'Draft'}",
            f"Patient: {patient_name}",
            f"Status: {invoice.status.value}",
            f"Currency: {invoice.currency}",
            "",
            "Description                                  Qty      Unit          Total",
            "-" * 78,
        ]
        for line in invoice.lines:
            lines.append(
                f"{line.description[:43]:43} {line.quantity:>4} "
                f"{(line.unit_price_minor / 100):>12.2f} {(line.line_total_minor / 100):>12.2f}"
            )
        lines.extend(
            [
                "-" * 78,
                f"Subtotal: KES {invoice.subtotal_minor / 100:.2f}",
                f"Discount: KES {invoice.discount_minor / 100:.2f}",
                f"Total: KES {invoice.total_minor / 100:.2f}",
                f"Paid: KES {invoice.amount_paid_minor / 100:.2f}",
                f"Balance: KES {invoice.balance_minor / 100:.2f}",
                "",
                "Thank you for choosing MediFlow.",
            ]
        )
        return build_pdf(lines)

    def receipt(self, transaction):
        invoice = getattr(transaction, "invoice", None)
        patient = getattr(invoice, "patient", None) if invoice is not None else None
        patient_name = (
            " ".join(part for part in (patient.first_name, patient.last_name) if part)
            if patient is not None
            else "Patient"
        )
        lines = [
            "MediFlow",
            "PAYMENT RECEIPT",
            "",
            f"Receipt reference: {transaction.reference or transaction.id}",
            f"Invoice: {getattr(invoice, 'invoice_number', None) or '—'}",
            f"Patient: {patient_name}",
            f"Amount: KES {transaction.amount_minor / 100:.2f}",
            f"Method: {transaction.method.value}",
            f"Status: {transaction.status.value}",
            f"Paid at: {transaction.paid_at.isoformat() if transaction.paid_at else '—'}",
            "",
            "This receipt was generated from the persisted payment record.",
        ]
        return build_pdf(lines)

    def referral_letter(self, visit, destination, reason):
        patient = getattr(visit, "patient", None)
        patient_name = (
            " ".join(part for part in (patient.first_name, patient.last_name) if part)
            if patient is not None
            else "Patient"
        )
        lines = [
            "MediFlow",
            "REFERRAL LETTER",
            "",
            f"Patient: {patient_name}",
            f"Patient number: {getattr(patient, 'patient_number', None) or '—'}",
            f"To: {destination}",
            f"Reason: {reason}",
            "",
            "This letter was generated from the clinical visit record.",
        ]
        return build_pdf(lines)


def get_document_renderer() -> DocumentRenderer:
    return DocumentRenderer()
