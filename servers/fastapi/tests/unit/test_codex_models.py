import re
from pathlib import Path

import pytest

from constants.llm import DEFAULT_CODEX_MODEL, SUPPORTED_CODEX_MODELS
from enums.llm_provider import LLMProvider
from utils import llm_provider


@pytest.mark.parametrize(
    "model",
    [
        "gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna",
        "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
        "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark",
    ],
)
def test_codex_model_is_selected_from_environment(monkeypatch, model):
    monkeypatch.setenv("LLM", "codex")
    monkeypatch.setenv("CODEX_MODEL", model)

    assert model in SUPPORTED_CODEX_MODELS
    assert llm_provider.get_model() == model


@pytest.mark.parametrize("model", [None, "", "gpt-6", "gpt-5.6", "gpt-5.2"])
def test_codex_unsupported_model_falls_back_to_lowest_gpt_5_6_model(
    monkeypatch, model
):
    monkeypatch.setattr(llm_provider, "get_llm_provider", lambda: LLMProvider.CODEX)
    monkeypatch.setattr(llm_provider, "get_codex_model_env", lambda: model)

    assert DEFAULT_CODEX_MODEL == "gpt-5.6-luna"
    assert model not in SUPPORTED_CODEX_MODELS
    assert llm_provider.get_model() == DEFAULT_CODEX_MODEL


def test_codex_catalog_and_default_match_frontend():
    # The services have independent build contexts; catch drift without adding
    # a runtime dependency on files outside either service.
    frontend = (
        Path(__file__).resolve().parents[3] / "nextjs/utils/codexModels.ts"
    ).read_text(encoding="utf-8")
    model_ids = re.findall(r'id: "([^"]+)"', frontend)

    assert len(model_ids) == len(set(model_ids))
    assert set(model_ids) == SUPPORTED_CODEX_MODELS
    assert f'DEFAULT_CODEX_MODEL = "{DEFAULT_CODEX_MODEL}"' in frontend


def test_codex_model_does_not_override_openai_model(monkeypatch):
    monkeypatch.setenv("LLM", "openai")
    monkeypatch.setenv("CODEX_MODEL", "gpt-6.1-sol")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1")

    assert llm_provider.get_model() == "gpt-4.1"


@pytest.mark.parametrize("status_code", [401, 403, 404, 429])
def test_codex_backend_access_errors_are_surfaced(monkeypatch, status_code):
    from llmai.shared.errors import BaseError
    from utils.llm_client_error_handler import handle_llm_client_exceptions

    monkeypatch.setenv("LLM", "codex")
    monkeypatch.setenv("CODEX_MODEL", "gpt-6.1-sol")
    message = "Access to the selected model is unavailable."

    result = handle_llm_client_exceptions(
        BaseError(status_code=status_code, message=message)
    )

    assert result.status_code == (401 if status_code in {401, 403} else status_code)
    assert message in result.detail
    if status_code in {401, 403}:
        assert result.headers == {"X-Presenton-Auth-Action": "codex-reauth"}
    assert llm_provider.get_model() == "gpt-6.1-sol"
