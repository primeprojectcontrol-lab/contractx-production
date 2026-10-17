from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional


@dataclass
class ExternalDocument:
    external_id: str
    name: str
    path: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    modified_at: Optional[str] = None
    version: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BaseDataConnector(ABC):
    """
    ContractX connector contract.

    Implementations must never expose provider credentials in API responses or
    project_documents metadata. Secrets belong in a dedicated secret manager.
    """

    source_type: str

    @abstractmethod
    def test_connection(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def list_documents(
        self,
        path: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 100,
    ) -> dict:
        raise NotImplementedError

    @abstractmethod
    def get_metadata(self, external_id: str) -> ExternalDocument:
        raise NotImplementedError

    @abstractmethod
    def fetch_content(self, external_id: str) -> bytes:
        raise NotImplementedError

    def sync_changes(self, cursor: Optional[str] = None) -> dict:
        return {
            "supported": False,
            "cursor": cursor,
            "changes": [],
        }
