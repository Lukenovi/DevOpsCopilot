"""
Vertex AI Gemini service.

Uses the google-cloud-aiplatform SDK to call Gemini models with multi-turn
conversation context.  The system prompt is optimised for a DevOps copilot:
knowledgeable about CI/CD, Kubernetes, Terraform, observability, cloud
platforms and software delivery best-practices.
"""

from typing import Optional
import structlog
import vertexai
from vertexai.generative_models import (
    Content,
    GenerationConfig,
    GenerativeModel,
    HarmBlockThreshold,
    HarmCategory,
    Part,
)
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.models.schemas import Message, MessageRole

logger = structlog.get_logger()

SYSTEM_PROMPT = """You are DevOps Copilot, an expert AI assistant specialising in
DevOps engineering, platform engineering, and software delivery.

Your areas of deep expertise include:
• CI/CD pipelines (GitHub Actions, GitLab CI, Cloud Build, Jenkins, ArgoCD)
• Infrastructure as Code (Terraform, Pulumi, Ansible, Helm)
• Container orchestration (Kubernetes, GKE, EKS, AKS, Cloud Run)
• Cloud platforms (Google Cloud, AWS, Azure) with emphasis on GCP
• Observability (Cloud Monitoring, Prometheus, Grafana, OpenTelemetry, Loki)
• Security and compliance (IAM least-privilege, SAST/DAST, SBOM, supply-chain)
• GitOps workflows, blue-green and canary deployments
• Site Reliability Engineering (SLIs, SLOs, error budgets, incident response)

Guidelines:
1. Provide accurate, actionable answers with concrete examples and code snippets.
2. Always explain the "why" behind recommendations, not just the "what".
3. Highlight trade-offs when multiple valid approaches exist.
4. Flag security risks or anti-patterns if you spot them.
5. Ask clarifying questions when the user's intent is ambiguous.
6. Format code blocks with the correct language identifier.
7. Be concise but complete — avoid unnecessary filler text.
8. If you are unsure, say so clearly rather than guessing.
"""

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}


class VertexAIService:
    def __init__(self) -> None:
        vertexai.init(project=settings.gcp_project_id, location=settings.gcp_region)
        self._model = GenerativeModel(
            model_name=settings.vertex_model,
            system_instruction=SYSTEM_PROMPT,
        )
        self._generation_config = GenerationConfig(
            max_output_tokens=settings.vertex_max_output_tokens,
            temperature=settings.vertex_temperature,
            top_p=settings.vertex_top_p,
        )
        logger.info(
            "vertex_ai_initialised",
            model=settings.vertex_model,
            region=settings.gcp_region,
        )

    def _build_history(self, messages: list[Message]) -> list[Content]:
        """Convert stored messages into Vertex AI Content objects."""
        contents: list[Content] = []
        for msg in messages:
            role = "user" if msg.role == MessageRole.USER else "model"
            contents.append(Content(role=role, parts=[Part.from_text(msg.content)]))
        return contents

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def generate(
        self,
        user_message: str,
        history: Optional[list[Message]] = None,
        rag_context: Optional[str] = None,
    ) -> tuple[str, int]:
        """
        Generate a response from Gemini.

        Args:
            user_message: The raw user prompt.
            history:      Prior conversation turns.
            rag_context:  Pre-formatted internal knowledge chunks to inject
                          before the user message. When provided, the model
                          is instructed to ground its answer in this context.

        Returns:
            (response_text, total_token_count)
        """
        chat_history = self._build_history(history or [])
        chat_session = self._model.start_chat(history=chat_history)

        # Prepend retrieved context so the model grounds its answer
        if rag_context:
            prompt = (
                f"{rag_context}\n\n"
                "---\n"
                "Using the internal knowledge above where relevant, answer the "
                "following question. If the internal knowledge does not cover the "
                "topic, answer from your general expertise and say so clearly.\n\n"
                f"**User question:** {user_message}"
            )
        else:
            prompt = user_message

        response = await chat_session.send_message_async(
            content=prompt,
            generation_config=self._generation_config,
            safety_settings=SAFETY_SETTINGS,
        )

        text = response.text
        token_count: int = getattr(response.usage_metadata, "total_token_count", 0)

        logger.info("vertex_ai_response", tokens=token_count, rag_used=bool(rag_context))
        return text, token_count
