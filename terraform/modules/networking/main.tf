# Custom VPC for all services
resource "google_compute_network" "vpc" {
  project                 = var.project_id
  name                    = "devops-copilot-vpc-${var.env}"
  auto_create_subnetworks = false
  description             = "VPC for DevOps Copilot (${var.env})"
}

# Subnet for Cloud Run services
resource "google_compute_subnetwork" "subnet" {
  project       = var.project_id
  name          = "devops-copilot-subnet-${var.env}"
  network       = google_compute_network.vpc.self_link
  region        = var.region
  ip_cidr_range = "10.10.0.0/24"

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# Serverless VPC Access Connector — lets Cloud Run reach internal resources
resource "google_vpc_access_connector" "connector" {
  provider = google-beta
  project  = var.project_id
  name     = "copilot-connector-${var.env}"
  region   = var.region

  subnet {
    name = google_compute_subnetwork.subnet.name
  }

  machine_type  = "e2-micro"
  min_instances = 2
  max_instances = 10

  depends_on = [google_compute_subnetwork.subnet]
}

# Allow internal HTTP traffic (backend ↔ Firestore, Vertex AI via Private Google Access)
resource "google_compute_firewall" "allow_internal" {
  project = var.project_id
  name    = "devops-copilot-allow-internal-${var.env}"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["443", "8080"]
  }

  source_ranges = ["10.10.0.0/24"]
  description   = "Allow internal traffic within the VPC subnet."
}
