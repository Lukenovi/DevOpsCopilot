resource "google_cloud_run_v2_service" "service" {
  project  = var.project_id
  name     = var.service_name
  location = var.region
  # When VPC connector is disabled (empty string), use ALL_TRAFFIC so services
  # can reach each other over public endpoints. When VPC is enabled, restrict
  # the backend to internal load balancer traffic only.
  ingress = var.vpc_connector_name == "" ? "INGRESS_TRAFFIC_ALL" : (var.allow_unauthenticated ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER")

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # TODO: re-enable for production private networking
    # vpc_access {
    #   connector = "projects/${var.project_id}/locations/${var.region}/connectors/${var.vpc_connector_name}"
    #   egress    = "ALL_TRAFFIC"
    # }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      ports {
        name           = "http1"
        container_port = var.container_port
      }

      startup_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 5
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = var.container_port
        }
        initial_delay_seconds = 15
        timeout_seconds       = 3
        period_seconds        = 30
        failure_threshold     = 3
      }
    }

    labels = {
      environment = var.env
      managed-by  = "terraform"
    }
  }

  labels = {
    environment = var.env
    managed-by  = "terraform"
  }

  lifecycle {
    # Image tag is managed by the app deployment pipeline, not Terraform
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# Allow unauthenticated access for public-facing services (frontend)
resource "google_cloud_run_v2_service_iam_member" "public_invoke" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
