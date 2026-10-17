from __future__ import annotations

import json

from app.ai.model_service import (
    invoke_model_chat,
)
from app.engine3.engine3_service import (
    EvidenceBundle,
    evidence_bundle_to_context,
)


def generate_draft(
    *,
    system_instruction: str,
    bundle: EvidenceBundle,
    drafting_instruction: str,
) -> str:
    """
    Engine 3 AI drafting through the ContractX approved-model service.

    The existing Engine 3 router interface is preserved. The model itself is
    selected from the persistent project policy and approved registry.
    """

    context = evidence_bundle_to_context(
        bundle
    )

    user_content = (
        "EVIDENCE BUNDLE:\n"
        f"{json.dumps(context, indent=2, default=str)}\n\n"
        "DRAFTING INSTRUCTION:\n"
        f"{drafting_instruction}"
    )

    result = invoke_model_chat(
        tenant_id=bundle.tenant_id,
        project_id=bundle.project_id,
        capability="claims",
        messages=[
            {
                "role": "system",
                "content": system_instruction,
            },
            {
                "role": "user",
                "content": user_content,
            },
        ],
        temperature=0.15,
        requested_output_tokens=4000,
    )

    return result.text
