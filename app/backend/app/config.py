from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # GCP
    gcp_project_id: str = Field(..., alias="GCP_PROJECT_ID")
    gcp_region: str = Field(default="europe-west1", alias="GCP_REGION")

    # Vertex AI
    vertex_model: str = Field(default="gemini-2.0-flash-001", alias="VERTEX_MODEL")
    vertex_max_output_tokens: int = Field(default=2048, alias="VERTEX_MAX_OUTPUT_TOKENS")
    vertex_temperature: float = Field(default=0.2, alias="VERTEX_TEMPERATURE")
    vertex_top_p: float = Field(default=0.95, alias="VERTEX_TOP_P")

    # Firestore
    firestore_db: str = Field(default="(default)", alias="FIRESTORE_DB")

    # App
    environment: str = Field(default="prod", alias="ENVIRONMENT")
    frontend_origin: str = Field(default="*", alias="FRONTEND_ORIGIN")

    @property
    def allowed_origins(self) -> list[str]:
        if self.environment == "prod":
            return [self.frontend_origin]
        return ["*"]


settings = Settings()
