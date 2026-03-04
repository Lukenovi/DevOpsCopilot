output "cloud_run_sa_email" {
  description = "Service account email for Cloud Run services."
  value       = google_service_account.cloud_run.email
}

output "cloud_run_sa_id" {
  description = "Service account unique ID."
  value       = google_service_account.cloud_run.unique_id
}
