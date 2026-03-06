#!/usr/bin/env python3
"""
Batch document ingestion script for DevOps Copilot RAG.

Reads Markdown, text, or any plain-text files from a directory (or a single file)
and uploads them to the knowledge base via the ingest API endpoint.

Usage
─────
# Ingest all .md files in a directory
python scripts/ingest.py --dir ./docs --api-url https://your-backend.run.app --key YOUR_ADMIN_KEY

# Ingest a single file
python scripts/ingest.py --file runbook.md --api-url http://localhost:8000 --key YOUR_ADMIN_KEY

# Dry-run: chunk and print without uploading
python scripts/ingest.py --dir ./docs --dry-run

# Tag all documents with a category
python scripts/ingest.py --dir ./docs --category runbooks --team platform

# Delete a specific source before re-ingesting (default behaviour: --replace)
python scripts/ingest.py --file runbook.md --no-replace
"""

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("httpx is required: pip install httpx")
    sys.exit(1)

SUPPORTED_EXTENSIONS = {".md", ".txt", ".rst", ".adoc"}


def load_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def ingest_file(
    file_path: Path,
    api_url: str,
    admin_key: str,
    metadata: dict,
    replace: bool,
    dry_run: bool,
) -> None:
    source = file_path.name
    title = file_path.stem.replace("-", " ").replace("_", " ").title()
    content = load_file(file_path)

    print(f"  [{file_path.name}] {len(content)} chars")

    if dry_run:
        # Just report chunk count without uploading
        # Simple estimate: every ~800 chars = 1 chunk
        estimated_chunks = max(1, len(content) // 800)
        print(f"    → DRY RUN: ~{estimated_chunks} chunks (not uploaded)")
        return

    payload = {
        "source": source,
        "title": title,
        "content": content,
        "metadata": metadata,
        "replace": replace,
    }

    try:
        response = httpx.post(
            f"{api_url.rstrip('/')}/api/v1/documents",
            json=payload,
            headers={"x-admin-key": admin_key, "Content-Type": "application/json"},
            timeout=120.0,
        )
        response.raise_for_status()
        result = response.json()
        print(f"    → {result['chunks_written']} chunks ingested")
    except httpx.HTTPStatusError as e:
        print(f"    ERROR {e.response.status_code}: {e.response.text}")
    except httpx.RequestError as e:
        print(f"    CONNECTION ERROR: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest documents into DevOps Copilot knowledge base.")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--dir", type=Path, help="Directory to scan for documents.")
    source_group.add_argument("--file", type=Path, help="Single file to ingest.")

    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL.")
    parser.add_argument("--key", default="", help="Admin API key (X-Admin-Key header).")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be ingested without uploading.")
    parser.add_argument("--no-replace", dest="replace", action="store_false", help="Append chunks instead of replacing existing source.")
    parser.add_argument("--category", default="", help="Optional metadata category tag.")
    parser.add_argument("--team", default="", help="Optional metadata team tag.")
    parser.set_defaults(replace=True)

    args = parser.parse_args()

    metadata: dict = {}
    if args.category:
        metadata["category"] = args.category
    if args.team:
        metadata["team"] = args.team

    files: list[Path] = []
    if args.file:
        if not args.file.exists():
            print(f"File not found: {args.file}")
            sys.exit(1)
        files = [args.file]
    else:
        if not args.dir.is_dir():
            print(f"Directory not found: {args.dir}")
            sys.exit(1)
        files = [
            p for p in sorted(args.dir.rglob("*"))
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
        ]

    if not files:
        print("No supported files found.")
        sys.exit(0)

    mode = "DRY RUN — " if args.dry_run else ""
    print(f"\n{mode}Ingesting {len(files)} file(s) → {args.api_url}\n")

    for f in files:
        ingest_file(
            file_path=f,
            api_url=args.api_url,
            admin_key=args.key,
            metadata=metadata,
            replace=args.replace,
            dry_run=args.dry_run,
        )

    print("\nDone.")


if __name__ == "__main__":
    main()
