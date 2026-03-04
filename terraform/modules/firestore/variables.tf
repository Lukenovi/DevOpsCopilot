variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "Firestore location (must be a valid multi-region or region)."
  type        = string
}

variable "env" {
  description = "Environment name."
  type        = string
}
