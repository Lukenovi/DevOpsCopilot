# Firestore (Native mode) database — stores conversation history
resource "google_firestore_database" "default" {
  provider    = google-beta
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Prevent accidental deletion of conversation data
  deletion_policy = "DELETE"
}

# Composite index: sessions query by user_id ordered by created_at
resource "google_firestore_index" "sessions_by_user" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "sessions"

  fields {
    field_path = "user_id"
    order      = "ASCENDING"
  }

  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }

  fields {
    field_path = "__name__"
    order      = "DESCENDING"
  }

  depends_on = [google_firestore_database.default]
}
