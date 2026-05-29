"""Pluggable text-embedding providers.

Default provider is ``fastembed`` running BAAI/bge-small-en-v1.5 (384-dim,
~130 MB ONNX model, CPU-only). The model is lazily loaded on first call so
Django startup and tests stay fast. Swap providers via
``settings.EMBEDDING_PROVIDER`` ("fastembed" | "noop").
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Sequence

from django.conf import settings

logger = logging.getLogger(__name__)


class EmbeddingProvider:
    """Abstract provider interface."""

    name: str = ""
    dim: int = 0

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        raise NotImplementedError


class NoopProvider(EmbeddingProvider):
    """Returns zero vectors. Used in tests / when fastembed is unavailable."""

    name = "noop"

    def __init__(self, dim: int):
        self.dim = dim

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [[0.0] * self.dim for _ in texts]


class FastEmbedProvider(EmbeddingProvider):
    """fastembed-backed provider. Lazy-loads the ONNX model on first use."""

    name = "fastembed"

    def __init__(self, model_name: str, dim: int):
        self.model_name = model_name
        self.dim = dim
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            from fastembed import TextEmbedding

            logger.info("Loading fastembed model %s (first call may download ~130MB)", self.model_name)
            self._model = TextEmbedding(model_name=self.model_name)
        return self._model

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure_model()
        # fastembed returns a generator of numpy arrays.
        return [vec.tolist() for vec in model.embed(list(texts))]


_provider: EmbeddingProvider | None = None


def get_provider() -> EmbeddingProvider:
    """Return the configured singleton embedding provider."""
    global _provider
    if _provider is not None:
        return _provider

    name = getattr(settings, "EMBEDDING_PROVIDER", "fastembed")
    model_name = getattr(settings, "EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
    dim = getattr(settings, "EMBEDDING_DIM", 384)

    if name == "noop":
        _provider = NoopProvider(dim=dim)
    else:
        try:
            _provider = FastEmbedProvider(model_name=model_name, dim=dim)
        except Exception as exc:  # pragma: no cover - import-time safety
            logger.warning("FastEmbed unavailable (%s); falling back to noop", exc)
            _provider = NoopProvider(dim=dim)
    return _provider


def event_text(event) -> str:
    """Build the canonical text used to embed an Event."""
    parts: Iterable[str] = (
        event.title or "",
        event.description or "",
        event.organisation.name if event.organisation_id else "",
        event.location.name if getattr(event, "location_id", None) else "",
        " ".join(c.name for c in event.categories.all()) if event.pk else "",
    )
    return " \n".join(p for p in parts if p).strip()


def organisation_text(org) -> str:
    parts: Iterable[str] = (org.name or "", org.description or "", org.website or "")
    return " \n".join(p for p in parts if p).strip()
