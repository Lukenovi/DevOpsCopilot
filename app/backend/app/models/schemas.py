from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: MessageRole
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None,
        description="Existing session ID. If omitted, a new session is created.",
    )
    message: str = Field(..., min_length=1, max_length=60000, description="User message. Accepts large inputs such as terraform plan output.")
    user_id: Optional[str] = Field(
        default="anonymous",
        description="Optional user identifier for conversation scoping.",
    )


class ChatResponse(BaseModel):
    session_id: str
    message: Message
    token_count: Optional[int] = None
    sources: list[str] = Field(
        default_factory=list,
        description="Source document names used to ground this response.",
    )


class SessionSummary(BaseModel):
    session_id: str
    user_id: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str


# ─── Knowledge Base / RAG schemas ────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Ingest a text document into the knowledge base."""
    source: str = Field(..., description="Unique document identifier (e.g. 'runbook-k8s.md').")
    title: str = Field(..., description="Human-readable document title.")
    content: str = Field(..., min_length=10, description="Full text content of the document.")
    metadata: dict = Field(
        default_factory=dict,
        description="Optional tags: category, author, team, etc.",
    )
    replace: bool = Field(
        default=True,
        description="If True, delete existing chunks for this source before ingesting.",
    )


class IngestResponse(BaseModel):
    source: str
    chunks_written: int
    message: str


class DeleteSourceResponse(BaseModel):
    source: str
    chunks_deleted: int


class KnowledgeChunk(BaseModel):
    chunk_id: str
    source: str
    title: str
    content: str


class DocumentContentResponse(BaseModel):
    source: str
    title: str
    content: str  # full reassembled markdown
    chunk_count: int


# ─── Terraform Plan schemas ──────────────────────────────────────────────────

class TerraformPlanRequest(BaseModel):
    """Raw terraform plan text output to parse."""
    plan_output: str = Field(..., min_length=10, description="Raw output of `terraform plan`.")


class TfResource(BaseModel):
    address: str
    type: str
    name: str
    action: str  # create | destroy | update | replace | read
    risks: list[str] = Field(default_factory=list)
    key_params: dict = Field(default_factory=dict)


class TerraformPlanResponse(BaseModel):
    summary: dict  # {add, change, destroy}
    resources: list[TfResource]
    total_changes: int
