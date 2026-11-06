import hashlib
import hmac
import os
import time
import uuid

from flask import current_app

from app.integrations.base import ProviderUnavailable


class ObjectStorage:
    def put(self, key, data, content_type):
        raise NotImplementedError

    def get(self, key):
        raise NotImplementedError

    def delete(self, key):
        raise NotImplementedError

    def signed_url(self, key, expires_seconds=None):
        raise NotImplementedError


class LocalObjectStorage(ObjectStorage):
    def _path(self, key):
        root = current_app.config["STORAGE_LOCAL_DIR"]
        safe_key = key.replace("..", "_").lstrip("/")
        path = os.path.join(root, safe_key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        return path

    def put(self, key, data, content_type):
        path = self._path(key)
        with open(path, "wb") as handle:
            handle.write(data)
        return {"key": key, "size": len(data), "content_type": content_type}

    def get(self, key):
        path = self._path(key)
        if not os.path.exists(path):
            raise ProviderUnavailable("Stored object not found")
        with open(path, "rb") as handle:
            return handle.read()

    def delete(self, key):
        path = self._path(key)
        if os.path.exists(path):
            os.remove(path)

    def signed_url(self, key, expires_seconds=None):
        expires_seconds = expires_seconds or current_app.config["STORAGE_SIGNED_URL_TTL_SECONDS"]
        expires = int(time.time()) + expires_seconds
        token = hmac.new(
            current_app.config["SECRET_KEY"].encode(),
            f"{key}:{expires}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return f"/api/v1/storage/{key}?expires={expires}&token={token}"

    def verify_url(self, key, expires, token):
        expected = hmac.new(
            current_app.config["SECRET_KEY"].encode(),
            f"{key}:{expires}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return int(expires) >= int(time.time()) and hmac.compare_digest(expected, token)


class S3ObjectStorage(ObjectStorage):
    def _client(self):
        try:
            import boto3
        except ImportError as exc:  # pragma: no cover
            raise ProviderUnavailable("boto3 is required for S3 storage") from exc
        return boto3.client("s3")

    def put(self, key, data, content_type):
        self._client().put_object(
            Bucket=current_app.config["STORAGE_BUCKET"],
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return {"key": key, "size": len(data), "content_type": content_type}

    def get(self, key):
        response = self._client().get_object(Bucket=current_app.config["STORAGE_BUCKET"], Key=key)
        return response["Body"].read()

    def delete(self, key):
        self._client().delete_object(Bucket=current_app.config["STORAGE_BUCKET"], Key=key)

    def signed_url(self, key, expires_seconds=None):
        expires_seconds = expires_seconds or current_app.config["STORAGE_SIGNED_URL_TTL_SECONDS"]
        return self._client().generate_presigned_url(
            "get_object",
            Params={"Bucket": current_app.config["STORAGE_BUCKET"], "Key": key},
            ExpiresIn=expires_seconds,
        )


def get_object_storage() -> ObjectStorage:
    if current_app.config.get("STORAGE_BACKEND") == "s3":
        return S3ObjectStorage()
    return LocalObjectStorage()


def build_storage_key(patient_id, file_name):
    extension = os.path.splitext(file_name)[1].lower()
    return f"patients/{patient_id}/{uuid.uuid4().hex}{extension}"
