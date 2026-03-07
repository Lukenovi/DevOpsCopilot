"""
Documents / Knowledge Base API.

These endpoints are for ingesting and managing internal knowledge.
Protect them with an API key or restrict access to internal traffic only — 
they should not be publicly callable by end users.
"""

import structlog
from fastapi import APIRouter, Header, HTTPException, status

from app.config import settings
from app.models.schemas import (
    DeleteSourceResponse,
    DocumentContentResponse,
    IngestRequest,
    IngestResponse,
    KnowledgeChunk,
)
from app.services.retrieval import RetrievalService

logger = structlog.get_logger()
router = APIRouter(tags=["knowledge"])

retrieval_service = RetrievalService()


def _check_admin_key(x_admin_key: str | None) -> None:
    """Simple static API-key guard for admin endpoints."""
    if not settings.admin_api_key:
        return  # No key configured — open (dev mode)
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key.")


@router.post(
    "/documents",
    response_model=IngestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def ingest_document(
    body: IngestRequest,
    x_admin_key: str | None = Header(default=None),
) -> IngestResponse:
    """
    Ingest a document into the knowledge base.

    The text is chunked, embedded with text-embedding-004, and stored
    in Firestore for vector retrieval at chat time.
    """
    _check_admin_key(x_admin_key)

    if body.replace:
        deleted = await retrieval_service.delete_source(body.source)
        if deleted:
            logger.info("existing_source_replaced", source=body.source, deleted=deleted)

    chunks = RetrievalService.chunk_text(
        text=body.content,
        source=body.source,
        title=body.title,
        metadata=body.metadata,
    )

    count = await retrieval_service.ingest_chunks(chunks)

    return IngestResponse(
        source=body.source,
        chunks_written=count,
        message=f"Successfully ingested {count} chunks from '{body.source}'.",
    )


@router.delete(
    "/documents/{source:path}",
    response_model=DeleteSourceResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_document(
    source: str,
    x_admin_key: str | None = Header(default=None),
) -> DeleteSourceResponse:
    """Delete all knowledge base chunks for a given source."""
    _check_admin_key(x_admin_key)
    deleted = await retrieval_service.delete_source(source)
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"No chunks found for source '{source}'.")
    return DeleteSourceResponse(source=source, chunks_deleted=deleted)


@router.get(
    "/documents/search",
    response_model=list[KnowledgeChunk],
)
async def search_knowledge(
    q: str,
    top_k: int = 5,
    x_admin_key: str | None = Header(default=None),
) -> list[KnowledgeChunk]:
    """Test the retrieval pipeline — returns the top-k chunks for a query."""
    _check_admin_key(x_admin_key)
    chunks = await retrieval_service.retrieve(q, top_k=top_k)
    return [KnowledgeChunk(**c) for c in chunks]


@router.get(
    "/documents/{source:path}",
    response_model=DocumentContentResponse,
)
async def get_document(source: str) -> DocumentContentResponse:
    """
    Fetch the full content of a knowledge document by its source ID.
    Chunks are reassembled in order. No auth required (read-only public content).
    """
    chunks = await retrieval_service.get_chunks_by_source(source)
    if not chunks:
        raise HTTPException(status_code=404, detail=f"No document found for source '{source}'.")

    title = chunks[0].get("title", source)
    full_content = "\n\n".join(c.get("content", "") for c in chunks)

    return DocumentContentResponse(
        source=source,
        title=title,
        content=full_content,
        chunk_count=len(chunks),
    )
