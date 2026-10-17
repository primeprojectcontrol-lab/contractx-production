from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ApprovedModel:
    key: str
    provider: str
    model_id: str
    display_name: str
    input_cost_per_million_usd: float
    output_cost_per_million_usd: float
    customer_selectable: bool
    status: str

    def public_dict(self) -> dict:
        return asdict(self)


# ================================================================
# CONTRACTX GOVERNANCE RULE
# ================================================================
#
# Exactly ONE approved model per provider.
#
# OpenAI:
#   Active at launch.
#
# Anthropic:
#   Coming Soon until credentials + approved model configuration exist.
#
# Google Gemini:
#   Coming Soon until credentials + approved model configuration exist.
#
# Model IDs remain environment-overridable so provider model retirement
# does not require a code release.
# ================================================================

APPROVED_MODELS: Dict[str, ApprovedModel] = {
    "openai": ApprovedModel(
        key="openai",
        provider="openai",
        model_id=os.getenv(
            "CONTRACTX_OPENAI_MODEL",
            "gpt-4o-mini",
        ),
        display_name="OpenAI · GPT-4o mini",
        input_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_OPENAI_INPUT_USD_M",
                "0.15",
            )
        ),
        output_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_OPENAI_OUTPUT_USD_M",
                "0.60",
            )
        ),
        customer_selectable=True,
        status="active",
    ),
    "anthropic": ApprovedModel(
        key="anthropic",
        provider="anthropic",
        model_id=os.getenv(
            "CONTRACTX_ANTHROPIC_MODEL",
            "",
        ),
        display_name="Anthropic — Coming Soon",
        input_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_ANTHROPIC_INPUT_USD_M",
                "0",
            )
        ),
        output_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_ANTHROPIC_OUTPUT_USD_M",
                "0",
            )
        ),
        customer_selectable=False,
        status="coming_soon",
    ),
    "google": ApprovedModel(
        key="google",
        provider="google",
        model_id=os.getenv(
            "CONTRACTX_GOOGLE_MODEL",
            "",
        ),
        display_name="Google Gemini — Coming Soon",
        input_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_GOOGLE_INPUT_USD_M",
                "0",
            )
        ),
        output_cost_per_million_usd=float(
            os.getenv(
                "CONTRACTX_GOOGLE_OUTPUT_USD_M",
                "0",
            )
        ),
        customer_selectable=False,
        status="coming_soon",
    ),
}

# Backward-compatibility constant only.
# Governed ContractX requests must use the model explicitly selected in
# project_ai_settings. The AI gateway does not silently fall back to this value.
DEFAULT_MODEL_KEY = os.getenv(
    "CONTRACTX_DEFAULT_MODEL_KEY",
    "openai",
)


def get_model(
    key: Optional[str] = None,
    *,
    require_active: bool = True,
) -> ApprovedModel:
    resolved = key or DEFAULT_MODEL_KEY

    model = APPROVED_MODELS.get(resolved)

    if model is None:
        raise ValueError(
            f"Provider/model key '{resolved}' is not in the ContractX approved registry."
        )

    if require_active:
        if model.status != "active":
            raise ValueError(
                f"{model.display_name} is not yet available."
            )

        if not model.model_id:
            raise ValueError(
                f"Provider '{model.provider}' has no approved model configured."
            )

        if (
            model.input_cost_per_million_usd <= 0
            or model.output_cost_per_million_usd <= 0
        ):
            raise ValueError(
                f"Provider '{model.provider}' is missing governed pricing configuration."
            )

    return model


def list_models(
    *,
    include_coming_soon: bool = True,
) -> List[dict]:
    models = list(
        APPROVED_MODELS.values()
    )

    if not include_coming_soon:
        models = [
            model
            for model in models
            if model.status == "active"
        ]

    return [
        model.public_dict()
        for model in models
    ]
