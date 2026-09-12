from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

try:
    from pymongo import DESCENDING, MongoClient
    from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
except ImportError:  # pragma: no cover - exercised only when dependency is missing.
    DESCENDING = None
    MongoClient = None
    PyMongoError = Exception
    ServerSelectionTimeoutError = Exception


DEFAULT_MONGODB_URI = "mongodb://localhost:27017"
DEFAULT_DATABASE = "hackcmu"
DEFAULT_COLLECTION = "experiences"


class ExperienceStoreError(RuntimeError):
    pass


class ExperienceStore:
    def __init__(
        self,
        uri: str | None = None,
        database_name: str | None = None,
        collection_name: str | None = None,
        timeout_ms: int = 1500,
    ) -> None:
        if MongoClient is None:
            raise ExperienceStoreError("pymongo is not installed. Run: python -m pip install pymongo")

        self.uri = uri or os.environ.get("MONGODB_URI", DEFAULT_MONGODB_URI)
        self.database_name = database_name or os.environ.get("MONGODB_DB", DEFAULT_DATABASE)
        self.collection_name = collection_name or os.environ.get("MONGODB_COLLECTION", DEFAULT_COLLECTION)
        self.client = MongoClient(self.uri, serverSelectionTimeoutMS=timeout_ms, appname="HackCMUContinentMap")
        self.collection = self.client[self.database_name][self.collection_name]

    def connect(self) -> None:
        try:
            self.client.admin.command("ping")
            self.collection.create_index([("created_at_utc", DESCENDING)])
            self.collection.create_index("category_id")
        except ServerSelectionTimeoutError as error:
            raise ExperienceStoreError(
                "MongoDB is not reachable. Start MongoDB locally or set MONGODB_URI to your MongoDB Atlas connection string."
            ) from error
        except PyMongoError as error:
            raise ExperienceStoreError(f"MongoDB setup failed: {error}") from error

    def save_experience(self, experience: dict[str, Any]) -> str:
        document = {
            **experience,
            "schema_version": 1,
            "created_at_utc": datetime.now(timezone.utc),
        }

        try:
            result = self.collection.insert_one(document)
        except PyMongoError as error:
            raise ExperienceStoreError(f"Could not save experience to MongoDB: {error}") from error

        if not result.acknowledged:
            raise ExperienceStoreError("MongoDB did not acknowledge the save. The entry was not confirmed.")

        return str(result.inserted_id)

    def list_recent_experiences(self, limit: int = 20) -> list[dict[str, Any]]:
        try:
            cursor = self.collection.find().sort("created_at_utc", DESCENDING).limit(limit)
            return [self.serialize_document(document) for document in cursor]
        except PyMongoError as error:
            raise ExperienceStoreError(f"Could not load experiences from MongoDB: {error}") from error

    @staticmethod
    def serialize_document(document: dict[str, Any]) -> dict[str, Any]:
        serialized = dict(document)
        serialized["_id"] = str(serialized["_id"])

        created_at = serialized.get("created_at_utc")
        if isinstance(created_at, datetime):
            serialized["created_at_utc"] = created_at.isoformat()

        return serialized
