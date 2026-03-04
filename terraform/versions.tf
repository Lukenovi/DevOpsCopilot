terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.20"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.20"
    }
  }

  backend "gcs" {
    # Bucket name is injected via -backend-config during init
    # e.g. terraform init -backend-config="bucket=<YOUR_TF_STATE_BUCKET>"
    prefix = "devops-copilot/terraform/state"
  }
}
