provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ─── Enable required APIs ───────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "firestore.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "iam.googleapis.com",
    # TODO: re-enable when VPC networking is added back
    # "compute.googleapis.com",
    # "vpcaccess.googleapis.com",
    # "servicenetworking.googleapis.com",
  ])

  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# ─── Modules ─────────────────────────────────────────────────────────────────

# TODO: re-enable for production private networking
# module "networking" {
#   source     = "./modules/networking"
#   project_id = var.project_id
#   region     = var.region
#   env        = var.env
#
#   depends_on = [google_project_service.apis]
# }

module "artifact_registry" {
  source     = "./modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  depends_on = [google_project_service.apis]
}

module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id
  env        = var.env

  depends_on = [google_project_service.apis]
}

module "firestore" {
  source     = "./modules/firestore"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  depends_on = [google_project_service.apis]
}

# ─── Secret Manager — ADMIN_API_KEY ─────────────────────────────────────────
# The secret resource is created here; the value is set separately:
#   gcloud secrets versions add devops-copilot-admin-key-prod \
#     --data-file=- <<< "your-strong-random-key"
resource "google_secret_manager_secret" "admin_api_key" {
  project   = var.project_id
  secret_id = "devops-copilot-admin-key-${var.env}"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.apis]
}

module "cloud_run_backend" {
  source     = "./modules/cloud_run"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  service_name          = "devops-copilot-backend"
  container_image       = "${var.region}-docker.pkg.dev/${var.project_id}/${module.artifact_registry.repository_name}/backend:latest"
  service_account_email = module.iam.cloud_run_sa_email
  # TODO: set to false and add IAP/auth when VPC networking is added back
  allow_unauthenticated = true
  # TODO: re-enable when VPC networking is added back
  # vpc_connector_name    = module.networking.vpc_connector_name

  env_vars = {
    ENVIRONMENT     = var.env
    GCP_PROJECT_ID  = var.project_id
    GCP_REGION      = var.region
    VERTEX_MODEL    = var.vertex_model
    FIRESTORE_DB    = "(default)"
    FRONTEND_ORIGIN = var.frontend_origin
  }

  secret_env_vars = {
    ADMIN_API_KEY = {
      secret  = google_secret_manager_secret.admin_api_key.secret_id
      version = "latest"
    }
  }

  depends_on = [
    module.iam,
    module.artifact_registry,
    # module.networking,  # TODO: re-enable when VPC networking is added back
    module.firestore,
    google_secret_manager_secret.admin_api_key,
  ]
}

module "cloud_run_frontend" {
  source     = "./modules/cloud_run"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  service_name          = "devops-copilot-frontend"
  container_image       = "${var.region}-docker.pkg.dev/${var.project_id}/${module.artifact_registry.repository_name}/frontend:latest"
  service_account_email = module.iam.cloud_run_sa_email
  # TODO: re-enable when VPC networking is added back
  # vpc_connector_name    = module.networking.vpc_connector_name
  allow_unauthenticated = true

  env_vars = {}

  depends_on = [
    module.iam,
    module.artifact_registry,
    # module.networking,  # TODO: re-enable when VPC networking is added back
  ]
}
