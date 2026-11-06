from html import escape


class DocumentRenderer:
    def invoice(self, invoice):
        lines = [
            f"<h1>MediFlow Invoice {escape(invoice.invoice_number)}</h1>",
            f"<p>Total: KES {invoice.total_minor / 100:.2f}</p>",
            "<table><tr><th>Description</th><th>Qty</th><th>Total</th></tr>",
        ]
        for line in invoice.lines:
            lines.append(
                "<tr>"
                f"<td>{escape(line.description)}</td>"
                f"<td>{line.quantity}</td>"
                f"<td>KES {line.line_total_minor / 100:.2f}</td>"
                "</tr>"
            )
        lines.append("</table>")
        return ("\n".join(lines)).encode()

    def receipt(self, transaction):
        html = (
            f"<h1>MediFlow Receipt</h1>"
            f"<p>Reference: {escape(str(transaction.reference or transaction.id))}</p>"
            f"<p>Amount: KES {transaction.amount_minor / 100:.2f}</p>"
            f"<p>Method: {escape(transaction.method.value)}</p>"
        )
        return html.encode()

    def referral_letter(self, visit, destination, reason):
        html = (
            "<h1>MediFlow Referral Letter</h1>"
            f"<p>To: {escape(destination)}</p>"
            f"<p>Reason: {escape(reason)}</p>"
            "<p>This letter was generated from the clinical visit record.</p>"
        )
        return html.encode()


def get_document_renderer() -> DocumentRenderer:
    return DocumentRenderer()
