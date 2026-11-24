PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT = 50
TOP = 800
LINE_HEIGHT = 14
LINES_PER_PAGE = 50


def _escape(value: str) -> str:
    text = str(value).encode("latin-1", "replace").decode("latin-1")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _content_stream(lines) -> bytes:
    commands = ["BT", f"/F1 10 Tf {LEFT} {TOP} Td {LINE_HEIGHT} TL"]
    for line in lines:
        commands.append(f"({_escape(line)}) Tj T*")
    commands.append("ET")
    return ("\n".join(commands) + "\n").encode("latin-1")


def build_pdf(lines) -> bytes:
    """Build a valid, dependency-free PDF from plain text lines."""
    normalized = [str(line) for line in lines] or [""]
    pages = [
        normalized[index : index + LINES_PER_PAGE]
        for index in range(0, len(normalized), LINES_PER_PAGE)
    ]
    if not pages:
        pages = [[""]]

    page_count = len(pages)
    font_object = 3
    page_object_start = 4
    content_object_start = page_object_start + page_count

    objects = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    kids = " ".join(f"{page_object_start + index} 0 R" for index in range(page_count))
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode("latin-1"))
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    for index, _page_lines in enumerate(pages):
        content_number = content_object_start + index
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 {font_object} 0 R >> >> "
                f"/Contents {content_number} 0 R >>"
            ).encode("latin-1")
        )

    for page_lines in pages:
        stream = _content_stream(page_lines)
        objects.append(
            b"<< /Length "
            + str(len(stream)).encode("ascii")
            + b" >>\nstream\n"
            + stream
            + b"endstream"
        )

    header = b"%PDF-1.4\n"
    body = bytearray()
    offsets = [0]
    for number, content in enumerate(objects, start=1):
        offsets.append(len(header) + len(body))
        body.extend(f"{number} 0 obj\n".encode("ascii"))
        body.extend(content)
        body.extend(b"\nendobj\n")
    xref_offset = len(header) + len(body)
    xref = [f"xref\n0 {len(objects) + 1}\n", "0000000000 65535 f \n"]
    xref.extend(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n"
    )
    return header + bytes(body) + "".join(xref).encode("ascii") + trailer.encode("ascii")
