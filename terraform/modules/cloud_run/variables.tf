variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
}

variable "env" {
  description = "Environment name."
  type        = string
}

variable "service_name" {
  description = "The name for the Cloud Run service."
  type        = string
}

variable "container_image" {
  description = "Full Docker image URI including tag."
  type        = string
}

variable "service_account_email" {
  description = "Service account email for the Cloud Run service."
  type        = string
}

variable "vpc_connector_name" {
  description = "VPC Access Connector name."
  type        = string
}

variable "allow_unauthenticated" {
  description = "Whether to allow unauthenticated (public) invocations."
  type        = bool
  default     = false
}

variable "env_vars" {
  description = "Environment variables to set on the container."
  type        = map(string)
  default     = {}
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 8080
}

variable "min_instances" {
  description = "Minimum number of Cloud Run instances (0 = scale-to-zero)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of Cloud Run instances."
  type        = number
  default     = 10
}

variable "cpu" {
  description = "CPU limit for each container instance."
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit for each container instance."
  type        = string
  default     = "512Mi"
}
