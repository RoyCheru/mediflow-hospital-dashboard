from flask import current_app, request


def pagination_args():
    try:
        page = max(int(request.args.get("page", 1)), 1)
    except (TypeError, ValueError):
        page = 1
    requested_size = request.args.get("page_size", request.args.get("per_page"))
    try:
        per_page = int(requested_size or current_app.config["DEFAULT_PAGE_SIZE"])
    except (TypeError, ValueError):
        per_page = current_app.config["DEFAULT_PAGE_SIZE"]
    per_page = max(1, min(per_page, current_app.config["MAX_PAGE_SIZE"]))
    return page, per_page


def paginated(query, serializer):
    page, per_page = pagination_args()
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return {
        "items": [serializer(item) for item in pagination.items],
        "meta": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "page_size": pagination.per_page,
            "total": pagination.total,
            "pages": pagination.pages,
        },
    }
