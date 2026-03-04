output "database_name" {
  description = "The Firestore database name."
  value       = google_firestore_database.default.name
}
