from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.ai.model_registry import ApprovedModel


@dataclass
class ProviderResponse:
    text: str
    input_tokens: int
    output_tokens: int


def _openai_call(
    *,
    model: ApprovedModel,
    messages: List[
        Dict[str, str]
    ],
    temperature: float,
    max_output_tokens: int,
    response_format: Optional[
        Dict[str, Any]
    ],
) -> ProviderResponse:
    api_key = os.getenv(
        "OPENAI_API_KEY",
        "",
    )

    if not api_key:
        raise RuntimeError(
            "OpenAI provider is not configured."
        )

    from openai import OpenAI

    client = OpenAI(
        api_key=
            api_key,
        timeout=
            60.0,
    )

    kwargs: Dict[
        str,
        Any,
    ] = {
        "model":
            model.model_id,
        "messages":
            messages,
        "temperature":
            temperature,
        "max_completion_tokens":
            max_output_tokens,
    }

    if response_format:
        kwargs[
            "response_format"
        ] = response_format

    response = (
        client
        .chat
        .completions
        .create(
            **kwargs
        )
    )

    text = (
        response
        .choices[0]
        .message
        .content
        or ""
    ).strip()

    usage = getattr(
        response,
        "usage",
        None,
    )

    input_tokens = int(
        getattr(
            usage,
            "prompt_tokens",
            0,
        )
        or getattr(
            usage,
            "input_tokens",
            0,
        )
        or 0
    )

    output_tokens = int(
        getattr(
            usage,
            "completion_tokens",
            0,
        )
        or getattr(
            usage,
            "output_tokens",
            0,
        )
        or 0
    )

    return ProviderResponse(
        text=
            text,
        input_tokens=
            input_tokens,
        output_tokens=
            output_tokens,
    )


def invoke_provider(
    *,
    model: ApprovedModel,
    messages: List[
        Dict[str, str]
    ],
    temperature: float,
    max_output_tokens: int,
    response_format: Optional[
        Dict[str, Any]
    ] = None,
) -> ProviderResponse:
    if model.provider == "openai":
        return _openai_call(
            model=
                model,
            messages=
                messages,
            temperature=
                temperature,
            max_output_tokens=
                max_output_tokens,
            response_format=
                response_format,
        )

    if model.provider == "anthropic":
        raise RuntimeError(
            "Anthropic integration is Coming Soon."
        )

    if model.provider == "google":
        raise RuntimeError(
            "Google Gemini integration is Coming Soon."
        )

    raise RuntimeError(
        f"Unsupported AI provider '{model.provider}'."
    )
