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
    message: str = Field(..., min_length=1, max_length=4000, description="User message.")
    user_id: Optional[str] = Field(
        default="anonymous",
        description="Optional user identifier for conversation scoping.",
    )


class ChatResponse(BaseModel):
    session_id: str
    message: Message
    token_count: Optional[int] = None


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
