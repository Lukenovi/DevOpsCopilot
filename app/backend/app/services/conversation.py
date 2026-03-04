"""
Conversation persistence service using Firestore.

Data model
──────────
Collection: sessions
  Document: {session_id}
    Fields:
      user_id:    str
      created_at: timestamp
      updated_at: timestamp
    Sub-collection: messages
      Document: {message_id}
        role:       "user" | "assistant"
        content:    str
        created_at: timestamp
"""

from datetime import datetime, timezone
from typing import Optional
import uuid
import structlog
from google.cloud import firestore
from google.cloud.firestore_v1.async_client import AsyncClient

from app.config import settings
from app.models.schemas import Message, MessageRole

logger = structlog.get_logger()

# Maximum messages to load into context window per request (oldest trimmed first)
MAX_CONTEXT_MESSAGES = 20


class ConversationService:
    def __init__(self) -> None:
        self._db: AsyncClient = firestore.AsyncClient(
            project=settings.gcp_project_id,
            database=settings.firestore_db,
        )

    def _sessions_col(self):
        return self._db.collection("sessions")

    def _messages_col(self, session_id: str):
        return self._sessions_col().document(session_id).collection("messages")

    async def get_or_create_session(
        self, session_id: Optional[str], user_id: str
    ) -> tuple[str, list[Message]]:
        """
        Load an existing session or create a new one.
        Returns (session_id, list_of_messages).
        """
        if session_id:
            doc = await self._sessions_col().document(session_id).get()
            if doc.exists:
                history = await self.get_history(session_id)
                return session_id, history or []

        # Create new session
        new_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await self._sessions_col().document(new_id).set(
            {
                "user_id": user_id,
                "created_at": now,
                "updated_at": now,
            }
        )
        logger.info("session_created", session_id=new_id, user_id=user_id)
        return new_id, []

    async def get_history(self, session_id: str) -> Optional[list[Message]]:
        """Return up to MAX_CONTEXT_MESSAGES messages ordered by created_at."""
        doc = await self._sessions_col().document(session_id).get()
        if not doc.exists:
            return None

        query = (
            self._messages_col(session_id)
            .order_by("created_at", direction=firestore.Query.ASCENDING)
            .limit_to_last(MAX_CONTEXT_MESSAGES)
        )
        docs = await query.get()

        messages: list[Message] = []
        for d in docs:
            data = d.to_dict()
            messages.append(
                Message(
                    id=d.id,
                    role=MessageRole(data["role"]),
                    content=data["content"],
                    created_at=data["created_at"],
                )
            )
        return messages

    async def append_messages(
        self, session_id: str, user_id: str, messages: list[Message]
    ) -> None:
        """Persist a list of messages and update the session's updated_at timestamp."""
        batch = self._db.batch()
        col = self._messages_col(session_id)

        for msg in messages:
            ref = col.document(msg.id)
            batch.set(
                ref,
                {
                    "role": msg.role.value,
                    "content": msg.content,
                    "created_at": msg.created_at,
                },
            )

        # Update session metadata
        session_ref = self._sessions_col().document(session_id)
        batch.update(session_ref, {"updated_at": datetime.now(timezone.utc)})

        await batch.commit()

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session and all its messages. Returns False if not found."""
        doc_ref = self._sessions_col().document(session_id)
        doc = await doc_ref.get()
        if not doc.exists:
            return False

        # Delete sub-collection messages first
        messages_col = self._messages_col(session_id)
        async for page in messages_col.list_documents():
            await page.delete()

        await doc_ref.delete()
        logger.info("session_deleted", session_id=session_id)
        return True
