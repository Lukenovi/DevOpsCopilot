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
│  • Source-badge overlay on RAG-grounded answers     │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS (Cloud Run service-to-service)
                    ▼
┌─────────────────────────────────────────────────────┐
│  Cloud Run — Backend (FastAPI + Python)              │
│  • POST /api/v1/chat          ← conversation + RAG  │
│  • GET  /api/v1/sessions/{id}                       │
│  • DELETE /api/v1/sessions/{id}                     │
│  • POST /api/v1/documents     ← ingest (admin)      │
│  • DELETE /api/v1/documents/{source} (admin)        │
│  • GET  /api/v1/documents/search  (admin)           │
│  • /health                                          │
└──────────┬─────────────┬────────────────────────────┘
           │             │
           │    ┌────────▼──────────────────────────┐
           │    │  Retrieval Service (RAG)           │
           │    │  1. Embed query (text-embedding-004│
           │    │  2. find_nearest in Firestore      │
           │    │  3. Prepend context to prompt      │
           │    └────────┬──────────────────────────┘
           │             │
           ▼             ▼
    Vertex AI        Firestore (Native mode)
    • Gemini flash   • Conversation history
    • Embeddings     • Knowledge base (vector index)
    (europe-west1)
```

### RAG flow

```
User question
      │
      ▼
  embed query (text-embedding-004, 768-dim)
      │
      ▼
  Firestore find_nearest  ─────► top-5 knowledge chunks
      │                               (COSINE distance)
      ▼
  build RAG context block
      │
      ▼
  Gemini prompt = [system] + [RAG context] + [chat history] + [question]
      │
      ▼
  Answer + source list ─────► frontend source badges
```

**Key GCP services used:**

| Service | Purpose |
|---|---|
| Cloud Run | Serverless hosting for frontend & backend |
| Vertex AI — Gemini `gemini-2.0-flash-001` | LLM inference |
| Vertex AI — `text-embedding-004` | Document + query embedding (768-dim) |
| Firestore (Native mode) | Conversation history + knowledge base vector index |
| Secret Manager | Runtime secrets (incl. `ADMIN_API_KEY`) |
| Artifact Registry | Private Docker image storage |
| VPC Access Connector | Private networking |
| Cloud Monitoring | Observability |

---

## Project Structure

```
DevOpsCopilot/
├── app/
│   ├── backend/              # FastAPI Python API
│   │   ├── app/
│   │   │   ├── routers/
│   │   │   │   ├── chat.py       # Chat + RAG pipeline
│   │   │   │   ├── documents.py  # Knowledge-base admin API
│   │   │   │   └── health.py
│   │   │   ├── services/
│   │   │   │   ├── vertex_ai.py     # Gemini (LLM)
│   │   │   │   ├── retrieval.py     # Embedding + vector search
│   │   │   │   └── conversation.py  # Firestore session store
│   │   │   ├── models/          # Pydantic schemas
│   │   │   └── config.py        # Settings (env vars)
│   │   ├── main.py
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   └── frontend/             # Next.js 14 web app
│       ├── src/
│       │   ├── app/          # App Router pages
│       │   ├── components/   # Chat, ChatMessage (+ source badges), ChatInput
│       │   ├── hooks/        # useChat state hook
│       │   └── lib/          # API client
│       └── Dockerfile
├── scripts/
│   └── ingest.py             # CLI tool — batch-ingest docs into knowledge base
├── terraform/                # IaC — single environment
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── modules/
│       ├── artifact_registry/
│       ├── cloud_run/
│       ├── firestore/        # Firestore DB + vector index
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

**Secret** — go to **Secrets** tab:

| Secret | Value | When to add |
|---|---|---|
| `GCP_SA_KEY` | Full JSON contents of `gcp-sa-key.json` generated above | Before first run |

**Variables** — go to **Variables** tab:

| Variable | Value | When to add |
|---|---|---|
| `GCP_PROJECT_ID` | Your GCP project ID (e.g. `my-project-123`) | Before first run |
| `GCP_REGION` | `europe-west1` | Before first run |
| `TF_STATE_BUCKET` | Name of your existing GCS bucket for Terraform state | Before first run |
| `AR_REPOSITORY` | Artifact Registry repo ID — from Terraform output `artifact_registry_url` (e.g. `devops-copilot-prod`) | After first `terraform apply` |
| `BACKEND_URL` | Full HTTPS URL of the Cloud Run backend — from Terraform output `backend_url` | After first `terraform apply` |

> **Tip:** `AR_REPOSITORY` and `BACKEND_URL` are only known after the infra pipeline runs for the first time. Add the first three variables and the secret, trigger the infra pipeline, then fill in the remaining two variables.

> **Note:** `ADMIN_API_KEY` does **not** go into GitHub — it is stored directly in Secret Manager after `terraform apply` (see step 5 below).

### 3. Deploy infrastructure

Trigger manually via GitHub Actions:

```
GitHub Actions → Infrastructure — Terraform → Run workflow → action: apply
```

### 4. Deploy the application

Trigger manually via GitHub Actions:

```
GitHub Actions → Application — Build & Deploy → Run workflow
```

---

## Knowledge Base (RAG)

The backend uses **Retrieval-Augmented Generation**: every chat message is first used to retrieve the most relevant internal knowledge chunks, which are injected into the Gemini prompt before answering. The frontend displays which source documents contributed to each answer.

### 5. Set the Admin API Key in Secret Manager

Terraform creates the `devops-copilot-admin-key-prod` secret but leaves it empty — you must populate it with a strong random value after `terraform apply`:

```powershell
# Generate a random key and store it in Secret Manager
$key = [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })) 
$key | gcloud secrets versions add devops-copilot-admin-key-prod --data-file=- --project=YOUR_PROJECT_ID

# Print it so you can use it with the ingest script
Write-Host "ADMIN_API_KEY: $key"
```

Keep this key somewhere safe — you'll need it every time you call the documents API.

### 6. Ingest your internal documents

Install the ingest script's dependency, then point it at a folder of markdown / text files:

```powershell
pip install httpx

python scripts/ingest.py `
  --dir ./docs `
  --api-url https://<your-backend-url> `
  --key <ADMIN_API_KEY>
```

**Supported file types:** `.md`, `.txt`, `.rst`, `.adoc`

**Flags:**

| Flag | Default | Description |
|---|---|---|
| `--dir` | *(required)* | Directory to scan recursively |
| `--api-url` | *(required)* | Full URL of the Cloud Run backend |
| `--key` | *(required)* | Value of `ADMIN_API_KEY` |
| `--category` | `general` | Tag all docs in this run with a category |
| `--team` | `""` | Tag all docs with a team name |
| `--no-replace` | *(off)* | Skip ingestion if source already exists |
| `--dry-run` | *(off)* | Parse + chunk without calling the API |

### Documents API reference

All endpoints require the `X-Admin-Key: <ADMIN_API_KEY>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/documents` | Ingest or replace a document by source name |
| `DELETE` | `/api/v1/documents/{source}` | Delete all chunks for a source |
| `GET` | `/api/v1/documents/search?q=…&top_k=5` | Test retrieval without going through chat |

#### Ingest example

```bash
curl -X POST https://<backend-url>/api/v1/documents \
  -H "X-Admin-Key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "runbooks/deploy.md",
    "content": "# Deploy Runbook\n\nSteps to deploy ...",
    "metadata": {"team": "platform", "category": "runbooks"},
    "replace_existing": true
  }'
```

#### Search / smoke-test example

```bash
curl "https://<backend-url>/api/v1/documents/search?q=how+to+deploy&top_k=3" \
  -H "X-Admin-Key: <ADMIN_API_KEY>"
```

---

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
- **RAG (Retrieval-Augmented Generation)** — ✅ **Already implemented.** Internal runbooks, architecture decisions, and incident post-mortems are indexed as vector embeddings in Firestore (`knowledge_base` collection). Every chat request retrieves the top-5 relevant chunks via `find_nearest` (COSINE) and prepends them to the Gemini prompt. The frontend displays source badges per answer. Use `scripts/ingest.py` or the `/api/v1/documents` API to manage the knowledge base.
- **Authentication** — the frontend is ready for an auth layer. Wire in Identity-Aware Proxy (IAP) for SSO with Google Workspace, or add a login route using NextAuth.js with a GCP OAuth provider.
- **Feedback loop** — add 👍/👎 buttons per message. Store feedback in Firestore and use it to fine-tune the system prompt or build an evaluation dataset.

---

## Deployment Flow Summary

Both pipelines are **manual only** — nothing runs automatically on commit.

```
GitHub Actions → Infrastructure — Terraform → Run workflow
      │
      └── action = plan  ──► terraform plan (comment in GH Actions log)
      └── action = apply ──► terraform plan → terraform apply
      └── action = destroy ► terraform destroy

GitHub Actions → Application — Build & Deploy → Run workflow
      │
      ├── docker build (backend + frontend)
      ├── trivy vulnerability scan
      ├── docker push → Artifact Registry
      └── gcloud run services update
           ├── devops-copilot-backend
           └── devops-copilot-frontend
```
