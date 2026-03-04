output "vpc_name" {
  description = "The name of the VPC network."
  value       = google_compute_network.vpc.name
}

output "subnet_name" {
  description = "The name of the VPC subnet."
  value       = google_compute_subnetwork.subnet.name
}

output "vpc_connector_name" {
  description = "The full resource name of the Serverless VPC Access Connector."
  value       = google_vpc_access_connector.connector.name
}
