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

# Vector index on knowledge_base collection for RAG semantic search.
# Dimension 768 matches text-embedding-004 output.
resource "google_firestore_index" "knowledge_base_vector" {
  provider   = google-beta
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection  = "knowledge_base"
  query_scope = "COLLECTION"

  fields {
    field_path = "embedding"
    vector_config {
      dimension = 768
      flat {}
    }
  }

  depends_on = [google_firestore_database.default]
}

# Composite index: knowledge_base query by source ordered by created_at
resource "google_firestore_index" "knowledge_base_by_source" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "knowledge_base"

  fields {
    field_path = "source"
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
