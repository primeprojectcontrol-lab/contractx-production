from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Optional


@dataclass
class MicrosoftTokenRecord:
    access_token: str
    refresh_token: Optional[str]
    expires_at: float
    scope: str = ""
    token_type: str = "Bearer"


class InMemoryTokenStore:
    """
    Development token store for ContractX Microsoft connectors.

    IMPORTANT:
    - Tokens are server-side only.
    - They are never written to data_sources or returned to the browser.
    - Tokens are lost when the backend restarts.

    Production:
    Replace this implementation with a secret manager / encrypted token vault
    without changing the connector interface.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._tokens: dict[str, MicrosoftTokenRecord] = {}

    def set(
        self,
        source_id: str,
        *,
        access_token: str,
        refresh_token: Optional[str],
        expires_in: int,
        scope: str = "",
        token_type: str = "Bearer",
    ) -> None:
        safe_expires_in = max(int(expires_in or 3600), 60)

        with self._lock:
            self._tokens[str(source_id)] = MicrosoftTokenRecord(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=time.time() + safe_expires_in,
                scope=scope,
                token_type=token_type,
            )

    def get(
        self,
        source_id: str,
    ) -> Optional[MicrosoftTokenRecord]:
        with self._lock:
            return self._tokens.get(str(source_id))

    def delete(
        self,
        source_id: str,
    ) -> None:
        with self._lock:
            self._tokens.pop(str(source_id), None)

    def has_access_token(
        self,
        source_id: str,
    ) -> bool:
        record = self.get(source_id)
        return bool(record and record.access_token)

    def is_expiring(
        self,
        source_id: str,
        *,
        skew_seconds: int = 120,
    ) -> bool:
        record = self.get(source_id)

        if not record:
            return True

        return record.expires_at <= (time.time() + skew_seconds)


token_store = InMemoryTokenStore()
