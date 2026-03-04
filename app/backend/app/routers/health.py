from fastapi import APIRouter
from app.models.schemas import HealthResponse
from app.config import settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Liveness and readiness probe endpoint."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        environment=settings.environment,
    )
