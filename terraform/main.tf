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
    "compute.googleapis.com",
    "vpcaccess.googleapis.com",
    "servicenetworking.googleapis.com",
  ])

  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# ─── Modules ─────────────────────────────────────────────────────────────────
module "networking" {
  source     = "./modules/networking"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  depends_on = [google_project_service.apis]
}

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

module "cloud_run_backend" {
  source     = "./modules/cloud_run"
  project_id = var.project_id
  region     = var.region
  env        = var.env

  service_name          = "devops-copilot-backend"
  container_image       = "${var.region}-docker.pkg.dev/${var.project_id}/${module.artifact_registry.repository_name}/backend:latest"
  service_account_email = module.iam.cloud_run_sa_email
  vpc_connector_name    = module.networking.vpc_connector_name

  env_vars = {
    ENVIRONMENT       = var.env
    GCP_PROJECT_ID    = var.project_id
    GCP_REGION        = var.region
    VERTEX_MODEL      = var.vertex_model
    FIRESTORE_DB      = "(default)"
    FRONTEND_ORIGIN   = module.cloud_run_frontend.service_url
  }

  depends_on = [
    module.iam,
    module.artifact_registry,
    module.networking,
    module.firestore,
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
  vpc_connector_name    = module.networking.vpc_connector_name
  allow_unauthenticated = true

  env_vars = {
    NEXT_PUBLIC_API_URL = module.cloud_run_backend.service_url
  }

  depends_on = [
    module.iam,
    module.artifact_registry,
    module.networking,
  ]
}
