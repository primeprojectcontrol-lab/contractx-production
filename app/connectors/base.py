from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Optional


class ConnectorError(RuntimeError):
    """Base error raised by ContractX connector adapters."""


class AuthorizationRequired(ConnectorError):
    """Raised when a connector requires customer/provider authorization."""


@dataclass
class ConnectorItem:
    id: str
    name: str
    kind: str
    web_url: Optional[str] = None
    size: Optional[int] = None
    mime_type: Optional[str] = None
    parent_path: Optional[str] = None
    etag: Optional[str] = None
    last_modified_at: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
