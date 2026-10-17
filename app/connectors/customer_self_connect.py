from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class CustomerConnectManifest:
    """
    Provider-neutral descriptor for customer self-connect.

    A provider adapter must implement its own authorization exchange.
    ContractX must never accept or persist a customer's platform password.
    """
    source_type: str
    display_name: str
    authorization_method: str
    supports_scope_browse: bool
    supports_delta_sync: bool
    customer_admin_may_be_required: bool
    status: str = "adapter_required"


class CustomerSelfConnectAdapter:
    """
    Contract for real SaaS/CDE adapters.

    Provider-specific implementations should:
      1. generate an authorization URL or IT setup challenge,
      2. exchange the returned authorization grant,
      3. store secrets/tokens only in a secret manager,
      4. test the granted connection,
      5. browse permitted source scope,
      6. fetch content read-only,
      7. support delta sync where the provider allows it.
    """

    manifest: CustomerConnectManifest

    async def begin_authorization(
        self,
        *,
        tenant_id: str,
        project_id: str,
        source_id: str,
        redirect_uri: Optional[str] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError

    async def complete_authorization(
        self,
        *,
        source_id: str,
        callback_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        raise NotImplementedError
