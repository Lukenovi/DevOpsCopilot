# DevOps Copilot

An AI-powered DevOps assistant chatbot, fully hosted on **Google Cloud**, backed by **Vertex AI Gemini**, built with **Next.js + FastAPI**, managed with **Terraform**, and deployed via **GitHub Actions**.

---

## Architecture

```
User Browser
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Run — Frontend (Next.js)                      │
│  • Dark-theme chat UI                               │
│  • Markdown + syntax-highlighted code blocks        │
│  • Session management (create / continue / clear)  │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS (Cloud Run service-to-service)
                    ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Run — Backend (FastAPI + Python)              │
│  • POST /api/v1/chat                                │
│  • GET  /api/v1/sessions/{id}                       │
│  • DELETE /api/v1/sessions/{id}                     │
│  • /health                                          │
└──────────┬──────────────────┬───────────────────────┘
           │                  │
           ▼                  ▼
    Vertex AI Gemini     Firestore (Native)
    (europe-west1)       Conversation history
```

**Key GCP services used:**

| Service | Purpose |
|---|---|
| Cloud Run | Serverless hosting for frontend & backend |
| Vertex AI (Gemini) | LLM inference |
| Firestore | Conversation persistence |
| Artifact Registry | Private Docker image storage |
| Secret Manager | Runtime secrets |
| VPC Access Connector | Private networking |
| Cloud Monitoring | Observability |

---

## Project Structure

```
DevOpsCopilot/
├── app/
│   ├── backend/              # FastAPI Python API
│   │   ├── app/
│   │   │   ├── routers/      # HTTP route handlers
│   │   │   ├── services/     # Vertex AI + Firestore clients
│   │   │   ├── models/       # Pydantic schemas
│   │   │   └── config.py     # Settings (env vars)
│   │   ├── main.py
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── frontend/             # Next.js 14 web app
│       ├── src/
│       │   ├── app/          # App Router pages
│       │   ├── components/   # Chat, Message, Input
│       │   ├── hooks/        # useChat state hook
│       │   └── lib/          # API client
│       └── Dockerfile
├── terraform/                # IaC — single environment
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── modules/
│       ├── artifact_registry/
│       ├── cloud_run/
│       ├── firestore/
│       ├── iam/
│       └── networking/
└── .github/
    └── workflows/
        ├── infra.yml         # Infra pipeline (Terraform)
        └── app.yml           # App pipeline (Build + Deploy)
```

---

## Getting Started

### Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI authenticated
- Terraform ≥ 1.7
- Node.js 20 + npm
- Python 3.12

### 1. Bootstrap GCP resources

Run these commands once with your `gcloud` CLI to create the Terraform state bucket, the CI service account, and its JSON key.

```bash
# Replace these two values throughout
export PROJECT_ID=YOUR_PROJECT_ID
export REGION=europe-west1

# Enable required GCP APIs
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  --project=${PROJECT_ID}

# Create the CI/CD service account
gcloud iam service-accounts create terraform-sa \
  --display-name="Terraform CI Service Account" \
  --project=${PROJECT_ID}

# Grant the roles Terraform needs
for role in \
  roles/editor \
  roles/iam.roleAdmin \
  roles/iam.serviceAccountAdmin \
  roles/storage.admin; do
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:terraform-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="${role}"
done

# Generate the JSON key — this file becomes the GCP_SA_KEY secret
gcloud iam service-accounts keys create gcp-sa-key.json \
  --iam-account=terraform-sa@${PROJECT_ID}.iam.gserviceaccount.com

# Print the key so you can copy it into GitHub Secrets
cat gcp-sa-key.json
```

> **Security:** `gcp-sa-key.json` is already listed in `.gitignore`. Never commit it. Delete the local file once you have added it to GitHub Secrets.
> ```bash
> rm gcp-sa-key.json
> ```

### 2. Configure GitHub Secrets

Go to **Repository → Settings → Secrets and variables → Actions → New repository secret** and add each of the following:

| Secret | Value | When to add |
|---|---|---|
| `GCP_SA_KEY` | Full JSON contents of `gcp-sa-key.json` generated above | Before first run |
| `GCP_PROJECT_ID` | Your GCP project ID (e.g. `my-project-123`) | Before first run |
| `GCP_REGION` | `europe-west1` | Before first run |
| `TF_STATE_BUCKET` | Name of your existing GCS bucket for Terraform state | Before first run |
| `AR_REPOSITORY` | Artifact Registry repo ID — from Terraform output `artifact_registry_url` (e.g. `devops-copilot-prod`) | After first `terraform apply` |
| `BACKEND_URL` | Full HTTPS URL of the Cloud Run backend — from Terraform output `backend_url` | After first `terraform apply` |

> **Tip:** `AR_REPOSITORY` and `BACKEND_URL` are only known after the infra pipeline runs for the first time. Add `GCP_SA_KEY`, `GCP_PROJECT_ID`, `GCP_REGION`, and `TF_STATE_BUCKET` first, trigger the infra pipeline, then fill in the remaining two secrets.

### 3. Deploy infrastructure

Push a change to `terraform/` on `main`, or trigger manually via GitHub Actions:

```
GitHub Actions → Infrastructure — Terraform → Run workflow → apply
```

### 4. Deploy the application

Push a change to `app/` on `main`, or trigger the app workflow manually.

### 5. Run locally

```bash
# Backend
cd app/backend
cp .env.example .env       # Fill in your GCP project
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd app/frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

---

## Best Practices for AI Chatbot Assistants

### 1. System Prompt Engineering

The system prompt is the single most impactful knob in a production AI assistant:

- **Be explicit about persona and scope** — define who the assistant is and what it will/won't answer. Ambiguity leads to off-topic or unsafe responses.
- **Use structured instructions** — numbered rules or bullet points are parsed more reliably than prose paragraphs.
- **Specify output format** — tell the model to use code blocks with language identifiers, tables, or a specific structure where needed.
- **Set a refusal policy** — instruct the model how to handle out-of-scope or ambiguous questions rather than guessing.
- **Iterate empirically** — treat your system prompt as code: version it, test it with a regression suite of example conversations.

### 2. Multi-Turn Conversation Management

- **Limit context window loading** — loading the full history for every request becomes expensive. Keep a configurable `MAX_CONTEXT_MESSAGES` window (this project uses 20) and trim the oldest messages.
- **Session isolation** — scope sessions to a `user_id` and `session_id`. Never let messages from one user bleed into another's context.
- **Summarisation for long threads** — for extended conversations, periodically summarise earlier turns into a compact "memory" block rather than dropping messages entirely.
- **Persist history externally** — Firestore provides durable, queryable storage that survives container restarts and scales horizontally.

### 3. Reliability & Latency

- **Use retry logic with exponential back-off** — Vertex AI can return transient errors. The `tenacity` library in this project retries up to 3 times before surfacing errors.
- **Set sensible generation limits** — low temperature (0.1–0.3) reduces hallucinations for factual DevOps questions. Cap `max_output_tokens` to avoid runaway billing.
- **Stream responses for long outputs** — streaming (server-sent events) dramatically improves perceived latency. The Vertex AI SDK supports `send_message_async` with streaming; wire it to a `StreamingResponse` in FastAPI when token counts are high.
- **Cache static answers** — if the same query (e.g. "How do I create a VPC in GCP?") is asked frequently, cache embeddings or exact-match responses in Firestore/Redis.

### 4. Security

- **Service account key stored as a GitHub Secret** — the `GCP_SA_KEY` secret is encrypted at rest by GitHub and never exposed in logs. Rotate the key periodically with `gcloud iam service-accounts keys create` and delete the old key version. Cloud Run itself uses the metadata server (no key files inside containers).
- **Principle of least privilege** — the Cloud Run service account has only the four roles it needs: `aiplatform.user`, `datastore.user`, `secretmanager.secretAccessor`, `run.invoker`.
- **CORS locked to known origins** — in production, `FRONTEND_ORIGIN` restricts cross-origin requests to your frontend URL only.
- **Input validation** — Pydantic enforces `max_length=4000` on user messages to prevent prompt injection via excessively long inputs.
- **Rate limiting** — add Cloud Armor or an API Gateway in front of Cloud Run to enforce per-user rate limits and protect against abuse.
- **Output sanitisation** — always render AI output as markdown (never `dangerouslySetInnerHTML`) and strip executable content.
- **Secret Manager at runtime** — never bake API keys into Docker images or environment variables in plain text. Pull secrets from Secret Manager on startup.

### 5. Observability

- **Structured logging** — use `structlog` (this project) or Cloud Logging's JSON format. Include `session_id`, `user_id`, and `token_count` in every log entry.
- **Token cost tracking** — log `usage_metadata.total_token_count` per request. Set budget alerts in GCP Billing.
- **Latency metrics** — track p50/p95/p99 of AI response time as a custom Cloud Monitoring metric. Consider an SLO of p95 < 10s.
- **Error rate alerting** — alert when the 5xx rate on the `/api/v1/chat` endpoint exceeds 1% over 5 minutes.
- **Tracing** — add OpenTelemetry to correlate a single user request across the frontend → backend → Vertex AI hops.

### 6. Cost Optimisation

- **Scale to zero** — `min_instance_count = 0` on Cloud Run means you pay nothing when idle.
- **Choose Gemini Flash for speed and cost** — `gemini-2.0-flash-001` is ~10× cheaper than `gemini-1.5-pro` for straightforward DevOps Q&A. Use Pro only when reasoning depth is essential.
- **Trim context aggressively** — every token in the history window is billed. Trim to what is actually needed.
- **Spot/preemptible VMs** — for batch inference or evaluation jobs, use spot VMs via Vertex AI batch prediction.

### 7. Extensibility

- **Tool calling / function calling** — extend the assistant with tools: run a `terraform validate` via Cloud Build triggered by the chat, query a Prometheus endpoint, or look up a JIRA ticket. Gemini supports function calling natively.
- **RAG (Retrieval-Augmented Generation)** — index your internal runbooks, architecture decisions, and incident post-mortems into Vertex AI Vector Search or Cloud Firestore. Retrieve the top-k relevant docs and prepend them to the prompt. This makes the assistant aware of your specific systems.
- **Authentication** — the frontend is ready for an auth layer. Wire in Identity-Aware Proxy (IAP) for SSO with Google Workspace, or add a login route using NextAuth.js with a GCP OAuth provider.
- **Feedback loop** — add 👍/👎 buttons per message. Store feedback in Firestore and use it to fine-tune the system prompt or build an evaluation dataset.

---

## Deployment Flow Summary

```
git push main
      │
      ├── terraform/** changed? ──► infra.yml
      │                              ├── terraform plan  (always)
      │                              └── terraform apply (main only)
      │
      └── app/** changed? ────────► app.yml
                                     ├── docker build (backend + frontend)
                                     ├── trivy vulnerability scan
                                     ├── docker push → Artifact Registry
                                     └── gcloud run services update
                                          ├── devops-copilot-backend
                                          └── devops-copilot-frontend
```
