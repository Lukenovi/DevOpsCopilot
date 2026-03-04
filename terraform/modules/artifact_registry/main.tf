resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = "devops-copilot-${var.env}"
  description   = "Docker images for DevOps Copilot (${var.env})"
  format        = "DOCKER"

  labels = {
    environment = var.env
    managed-by  = "terraform"
  }
}
