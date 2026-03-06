variable "project_id" {
  description = "The GCP project ID where all resources will be deployed."
  type        = string
}

variable "region" {
  description = "The GCP region for all resources. EU-based region recommended."
  type        = string
  default     = "europe-west1"
}

variable "env" {
  description = "Deployment environment identifier (e.g. prod)."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["prod", "staging", "dev"], var.env)
    error_message = "env must be one of: prod, staging, dev."
  }
}

variable "vertex_model" {
  description = "Vertex AI Gemini model to use for inference."
  type        = string
  default     = "gemini-2.0-flash-001"
}

variable "frontend_origin" {
  description = "Allowed CORS origin for the backend (the frontend Cloud Run URL). Set to '*' initially, update after first deploy."
  type        = string
  default     = "*"
}
