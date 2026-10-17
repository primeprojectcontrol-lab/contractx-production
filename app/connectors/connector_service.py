from __future__ import annotations

from typing import Any

from .base import ConnectorError
from .local_cde import LocalCDEConnector
from .microsoft_graph import MicrosoftGraphConnector


class ConnectorService:
    """
    ContractX connector registry.

    Active adapters:
    - Local CDE Test
      DB source_type = private_server
      configuration.connector_mode = local_simulator

    - Microsoft OneDrive
      source_type = onedrive

    - Microsoft SharePoint
      source_type = sharepoint
    """

    @staticmethod
    def for_source(
        source: dict[str, Any],
    ):
        source_type = str(
            source.get("source_type")
            or ""
        ).lower()

        source_id = str(
            source.get("id")
            or ""
        )

        configuration = (
            source.get("configuration")
            or {}
        )

        if not isinstance(
            configuration,
            dict,
        ):
            configuration = {}

        connector_mode = str(
            configuration.get(
                "connector_mode"
            )
            or ""
        ).lower()

        # DB-safe Local CDE mapping.
        if (
            source_type == "private_server"
            and connector_mode
            == "local_simulator"
        ):
            return LocalCDEConnector(
                source_id=source_id,
            )

        # Backward compatibility only.
        if source_type == "local_cde":
            return LocalCDEConnector(
                source_id=source_id,
            )

        if source_type in {
            "onedrive",
            "sharepoint",
        }:
            return MicrosoftGraphConnector(
                source_id=source_id,
                source_type=source_type,
            )

        raise ConnectorError(
            "The customer-managed connector adapter for "
            f"'{source_type}' is not enabled yet."
        )
