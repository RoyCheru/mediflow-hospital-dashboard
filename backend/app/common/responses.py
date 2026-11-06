from flask import jsonify


def ok(data=None, status=200):
    return jsonify({"data": data}), status


def created(data=None):
    return ok(data, 201)


def no_content():
    return "", 204
