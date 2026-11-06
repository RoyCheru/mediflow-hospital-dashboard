from uuid import uuid4

from app.common.base import BaseModel, TimestampMixin
from app.common.enums import ExportStatus, ReportFormat
from app.extensions import db


class ReportExport(BaseModel, TimestampMixin):
    __tablename__ = "report_exports"

    report_key = db.Column(db.String(80), nullable=False, index=True)
    parameters = db.Column(db.JSON, nullable=False, default=dict)
    report_format = db.Column(db.Enum(ReportFormat, native_enum=False, length=8), nullable=False)
    status = db.Column(
        db.Enum(ExportStatus, native_enum=False, length=16),
        nullable=False,
        default=ExportStatus.QUEUED,
        index=True,
    )
    storage_key = db.Column(db.String(512), nullable=True)
    requested_by_id = db.Column(
        db.Uuid(as_uuid=True), db.ForeignKey("users.id"), nullable=False, index=True
    )
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    error_message = db.Column(db.Text, nullable=True)

    def __init__(self, **kwargs):
        kwargs.setdefault("id", uuid4())
        super().__init__(**kwargs)
