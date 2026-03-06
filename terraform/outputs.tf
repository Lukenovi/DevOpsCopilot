output "frontend_url" {
  description = "Public URL of the DevOps Copilot web application."
  value       = module.cloud_run_frontend.service_url
}

output "backend_url" {
  description = "Internal URL of the DevOps Copilot backend API."
  value       = module.cloud_run_backend.service_url
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL for Docker images."
  value       = module.artifact_registry.repository_url
}

output "cloud_run_service_account" {
  description = "Service account email used by Cloud Run services."
  value       = module.iam.cloud_run_sa_email
}

# TODO: re-enable when VPC networking is added back
# output "vpc_connector" {
#   description = "VPC Access Connector name for private networking."
#   value       = module.networking.vpc_connector_name
# }

output "admin_api_key_secret" {
  description = "Secret Manager secret ID for the admin API key. Set its value with: gcloud secrets versions add <SECRET_ID> --data-file=-"
  value       = google_secret_manager_secret.admin_api_key.secret_id
}
