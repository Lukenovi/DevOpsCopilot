import structlog
from fastapi import APIRouter, HTTPException, status

from app.models.schemas import ChatRequest, ChatResponse, Message, MessageRole, SessionSummary
from app.services.conversation import ConversationService
from app.services.retrieval import RetrievalService
from app.services.vertex_ai import VertexAIService

logger = structlog.get_logger()
router = APIRouter(tags=["chat"])

vertex_service = VertexAIService()
conversation_service = ConversationService()
retrieval_service = RetrievalService()


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Send a message to the DevOps Copilot and receive an AI response.
    Conversation history is maintained per session_id.
    Responses are grounded in internal knowledge when relevant chunks exist.
    """
    log = logger.bind(user_id=request.user_id, session_id=request.session_id)

    try:
        # Load or create session
        session_id, history = await conversation_service.get_or_create_session(
            session_id=request.session_id,
            user_id=request.user_id or "anonymous",
        )
        log = log.bind(session_id=session_id)

        # Retrieve relevant internal knowledge chunks
        chunks = await retrieval_service.retrieve(request.message)
        rag_context = retrieval_service.format_context(chunks) if chunks else None
        sources = list({c["source"] for c in chunks}) if chunks else []

        # Generate response, grounded in retrieved context
        response_text, token_count = await vertex_service.generate(
            user_message=request.message,
            history=history,
            rag_context=rag_context,
        )

        # Persist both turns
        user_msg = Message(role=MessageRole.USER, content=request.message)
        assistant_msg = Message(role=MessageRole.ASSISTANT, content=response_text)

        await conversation_service.append_messages(
            session_id=session_id,
            user_id=request.user_id or "anonymous",
            messages=[user_msg, assistant_msg],
        )

        log.info("chat_response_sent", tokens=token_count, sources=sources)
        return ChatResponse(
            session_id=session_id,
            message=assistant_msg,
            token_count=token_count,
            sources=sources,
        )

    except Exception as exc:
        log.error("chat_error", error=repr(exc), error_type=type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while processing your request.",
        ) from exc


@router.get("/sessions/{session_id}", response_model=list[Message])
async def get_session_history(session_id: str) -> list[Message]:
    """Retrieve the full message history for a session."""
    history = await conversation_service.get_history(session_id)
    if history is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return history


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str) -> None:
    """Delete a session and its conversation history."""
    deleted = await conversation_service.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found.")
