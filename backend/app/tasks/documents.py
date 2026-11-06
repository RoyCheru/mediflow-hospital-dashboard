from app.tasks.celery_app import celery


@celery.task(name="app.tasks.documents.build_export")
def build_export(export_id):
    from app.analytics.models import ReportExport
    from app.analytics.service import build_export as run

    export = ReportExport.query.get(export_id)
    if export is None:
        return {"error": "export_not_found"}
    run(export)
    return {"export_id": str(export.id), "status": export.status.value}
