"""
Retrieval service — document embedding and vector search.

Uses:
  • Vertex AI text-embedding-004  (768-dim, best quality for English text)
  • Firestore native vector search (find_nearest on the 'knowledge_base' collection)

Data model — Firestore collection: knowledge_base
  Document fields:
    chunk_id    : str   — stable ID (hash of source + chunk index)
    source      : str   — file/URL name (e.g. "runbook-k8s-deploys.md")
    title       : str   — human-readable title
    content     : str   — raw text chunk
    embedding   : list[float] — 768-dim vector
    metadata    : dict  — arbitrary tags (category, author, etc.)
    created_at  : timestamp
"""

from __future__ import annotations

import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

import structlog
import vertexai
from google.cloud import firestore
from google.cloud.firestore_v1.async_client import AsyncClient
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector
from vertexai.language_models import TextEmbeddingInput, TextEmbeddingModel

from app.config import settings

logger = structlog.get_logger()

# Embedding model — text-embedding-004 outputs 768 dimensions
EMBEDDING_MODEL = "text-embedding-004"
EMBEDDING_DIMENSION = 768

# Retrieval config
TOP_K_RESULTS = 5          # chunks returned per query
CHUNK_SIZE = 800           # target characters per chunk
CHUNK_OVERLAP = 100        # overlap between consecutive chunks


class RetrievalService:
    def __init__(self) -> None:
        vertexai.init(project=settings.gcp_project_id, location=settings.gcp_region)
        self._embed_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL)
        # Async client — used for batch writes (ingest / delete)
        self._db: AsyncClient = firestore.AsyncClient(
            project=settings.gcp_project_id,
            database=settings.firestore_db,
        )
        # Sync client — used for vector search (AsyncVectorQuery.get() is not
        # implemented in google-cloud-firestore 2.16; sync path is stable)
        self._sync_db = firestore.Client(
            project=settings.gcp_project_id,
            database=settings.firestore_db,
        )
        logger.info("retrieval_service_initialised", model=EMBEDDING_MODEL)

    # ─── Embedding ────────────────────────────────────────────────────────────

    def _embed(self, texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        """
        Embed a batch of texts synchronously.
        task: RETRIEVAL_DOCUMENT for indexing, RETRIEVAL_QUERY for queries.
        """
        inputs = [TextEmbeddingInput(text=t, task_type=task) for t in texts]
        result = self._embed_model.get_embeddings(
            inputs,
            output_dimensionality=EMBEDDING_DIMENSION,
        )
        return [e.values for e in result]

    def embed_query(self, query: str) -> list[float]:
        """Embed a single user query for retrieval."""
        return self._embed([query], task="RETRIEVAL_QUERY")[0]

    # ─── Chunking ─────────────────────────────────────────────────────────────

    @staticmethod
    def chunk_text(
        text: str,
        source: str,
        title: str = "",
        metadata: Optional[dict] = None,
        chunk_size: int = CHUNK_SIZE,
        overlap: int = CHUNK_OVERLAP,
    ) -> list[dict]:
        """
        Split text into overlapping chunks suitable for embedding.
        Respects paragraph boundaries where possible.
        """
        # Normalise whitespace
        text = re.sub(r"\n{3,}", "\n\n", text.strip())
        paragraphs = text.split("\n\n")

        chunks: list[dict] = []
        current = ""

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(current) + len(para) + 2 <= chunk_size:
                current = (current + "\n\n" + para).strip()
            else:
                if current:
                    chunks.append(current)
                # If a single paragraph is larger than chunk_size, split it
                if len(para) > chunk_size:
                    for i in range(0, len(para), chunk_size - overlap):
                        chunks.append(para[i : i + chunk_size])
                else:
                    current = para

        if current:
            chunks.append(current)

        result = []
        for idx, chunk_content in enumerate(chunks):
            chunk_id = hashlib.sha256(
                f"{source}:{idx}:{chunk_content[:50]}".encode()
            ).hexdigest()[:16]
            result.append(
                {
                    "chunk_id": chunk_id,
                    "source": source,
                    "title": title or source,
                    "content": chunk_content,
                    "chunk_index": idx,
                    "metadata": metadata or {},
                }
            )
        return result

    # ─── Ingestion ────────────────────────────────────────────────────────────

    async def ingest_chunks(self, chunks: list[dict]) -> int:
        """
        Embed and store a list of chunks in Firestore.
        Returns the number of chunks written.
        """
        if not chunks:
            return 0

        texts = [c["content"] for c in chunks]
        loop = asyncio.get_running_loop()
        embeddings = await loop.run_in_executor(
            None, lambda: self._embed(texts, task="RETRIEVAL_DOCUMENT")
        )

        batch = self._db.batch()
        col = self._db.collection("knowledge_base")
        now = datetime.now(timezone.utc)

        for chunk, emb in zip(chunks, embeddings):
            ref = col.document(chunk["chunk_id"])
            batch.set(
                ref,
                {
                    **chunk,
                    "embedding": Vector(emb),
                    "created_at": now,
                },
            )

        await batch.commit()
        logger.info("chunks_ingested", count=len(chunks))
        return len(chunks)

    async def delete_source(self, source: str) -> int:
        """Delete all chunks belonging to a given source document."""
        col = self._db.collection("knowledge_base")
        query = col.where("source", "==", source)
        docs = await query.get()

        batch = self._db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        await batch.commit()

        logger.info("source_deleted", source=source, chunks=len(docs))
        return len(docs)

    # ─── Retrieval ────────────────────────────────────────────────────────────

    def _retrieve_sync(self, query: str, top_k: int) -> list[dict]:
        """
        Synchronous retrieval — embed query then run Firestore vector search.
        Runs in a thread pool via asyncio.to_thread to avoid blocking the loop.
        """
        query_vector = self.embed_query(query)

        col = self._sync_db.collection("knowledge_base")
        vector_query = col.find_nearest(
            vector_field="embedding",
            query_vector=Vector(query_vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=top_k,
        )

        docs = vector_query.get()
        results = []
        for doc in docs:
            data = doc.to_dict()
            results.append(
                {
                    "chunk_id": data.get("chunk_id", doc.id),
                    "source": data.get("source", ""),
                    "title": data.get("title", ""),
                    "content": data.get("content", ""),
                }
            )

        logger.info("retrieval_complete", query_len=len(query), results=len(results))
        return results

    async def retrieve(self, query: str, top_k: int = TOP_K_RESULTS) -> list[dict]:
        """
        Embed the query and return the top-k most relevant knowledge chunks.
        Each result dict contains: source, title, content, score.
        """
        return await asyncio.to_thread(self._retrieve_sync, query, top_k)

    @staticmethod
    def format_context(chunks: list[dict]) -> str:
        """Format retrieved chunks into a context block for the LLM prompt."""
        if not chunks:
            return ""
        lines = ["## Relevant internal knowledge\n"]
        for i, chunk in enumerate(chunks, 1):
            lines.append(f"### [{i}] {chunk['title']} (source: {chunk['source']})")
            lines.append(chunk["content"])
            lines.append("")
        return "\n".join(lines)

    def _get_source_chunks_sync(self, source: str) -> list[dict]:
        """Fetch all chunks for a source ordered by chunk_index (sync, runs in thread)."""
        col = self._sync_db.collection("knowledge_base")
        docs = col.where("source", "==", source).order_by("chunk_index").get()
        return [doc.to_dict() for doc in docs]

    async def get_chunks_by_source(self, source: str) -> list[dict]:
        """Return all stored chunks for a given source, ordered by chunk_index."""
        return await asyncio.to_thread(self._get_source_chunks_sync, source)
