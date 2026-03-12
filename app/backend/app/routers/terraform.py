"""
Terraform Plan Parser — parses raw `terraform plan` text output into structured JSON.
Detects resource actions (create/update/destroy/replace) and flags risky changes.
"""

import re
from fastapi import APIRouter
from app.models.schemas import TerraformPlanRequest, TerraformPlanResponse, TfResource

router = APIRouter(tags=["terraform"])

# Risk keyword groups used to annotate resources
_IAM_KEYWORDS   = {"iam", "role", "policy", "binding", "member", "permission", "access_control", "acl"}
_DATA_KEYWORDS  = {"database", "sql", "bucket", "storage", "disk", "volume", "snapshot", "backup", "db"}
_NET_KEYWORDS   = {"firewall", "security_group", "route", "nat", "subnet", "vpc", "network_acl"}

# Attribute keys considered informative for AI review and visual display
_INTERESTING_KEYS: frozenset[str] = frozenset({
    "role", "member", "name", "project", "location", "region",
    "secret", "service", "service_account", "image", "runtime",
    "bucket", "topic", "dataset", "machine_type", "network", "subnetwork",
    "port", "version", "database", "instance", "cluster", "node_pool",
    "repository", "namespace", "container_name", "environment",
})

# Ordered patterns: (regex, action)
_PATTERNS: list[tuple[str, str]] = [
    (r"#\s+(\S+)\s+will be created",           "create"),
    (r"#\s+(\S+)\s+will be destroyed",          "destroy"),
    (r"#\s+(\S+)\s+will be updated in-place",   "update"),
    (r"#\s+(\S+)\s+must be replaced",           "replace"),
    (r"#\s+(\S+)\s+is tainted, so must be replaced", "replace"),
    (r"#\s+(\S+)\s+will be read during apply",  "read"),
    (r"#\s+(\S+)\s+will be created\s+\(new resource required\)", "replace"),
]


def _extract_params(block_text: str) -> dict[str, str]:
    """
    Extract interesting attribute values from a single Terraform resource block.
    Captures lines like:
      + role   = "roles/run.invoker"
      ~ image  = "old-image" -> "new-image"
    Skips computed / sensitive values and very long strings.
    """
    params: dict[str, str] = {}

    # Plain assignment: + key = "value"  or  ~ key = "value"
    for m in re.finditer(
        r'^\s+[+~]\s+([\w]+)\s+=\s+"([^"]{1,120})"',
        block_text, re.MULTILINE,
    ):
        key, val = m.group(1), m.group(2)
        if (
            key in _INTERESTING_KEYS
            and "(known after apply)" not in val
            and "(sensitive" not in val
        ):
            params[key] = val

    # Update assignment: ~ key = "old" -> "new"
    for m in re.finditer(
        r'^\s+~\s+([\w]+)\s+=\s+"[^"]*"\s+->\s+"([^"]{1,120})"',
        block_text, re.MULTILINE,
    ):
        key, val = m.group(1), m.group(2)
        if key in _INTERESTING_KEYS and "(known after apply)" not in val:
            params[key] = f"→ {val}"

    return params


def _detect_risks(resource_type: str, action: str) -> list[str]:
    """Return human-readable risk labels for a resource."""
    risks: list[str] = []
    rt = resource_type.lower()
    if action in ("destroy", "replace"):
        risks.append("💥 Destructive")
    if any(k in rt for k in _IAM_KEYWORDS):
        risks.append("🔐 IAM")
    if any(k in rt for k in _DATA_KEYWORDS):
        risks.append("💾 Data")
    if any(k in rt for k in _NET_KEYWORDS):
        risks.append("🌐 Network")
    return risks


def _parse_address(address: str) -> tuple[str, str]:
    """
    Split a Terraform resource address into (resource_type, resource_name).
    Handles module prefixes: module.vpc.google_compute_network.main → google_compute_network, main
    """
    parts = address.split(".")
    clean: list[str] = []
    i = 0
    while i < len(parts):
        if parts[i] == "module":
            i += 2  # skip 'module' and the module name
        else:
            clean = parts[i:]
            break
    if len(clean) >= 2:
        return clean[0], ".".join(clean[1:])
    return address, address


def isTerraformPlan(text: str) -> bool:
    """Return True if the text looks like terraform plan output."""
    return bool(
        re.search(r"Plan:\s+\d+ to add,\s+\d+ to change,\s+\d+ to destroy", text, re.IGNORECASE)
        or (
            re.search(r"Terraform will perform the following actions", text, re.IGNORECASE)
            and re.search(r"will be (created|destroyed|updated|replaced)", text, re.IGNORECASE)
        )
    )


def parse_terraform_plan(plan_text: str) -> dict:
    """
    Parse raw terraform plan output; returns summary + resource list.
    Each resource includes key attribute values extracted from its block.
    """
    # ── Step 1: collect all resource action positions ──────────────────────
    candidates: list[tuple[int, str, str]] = []  # (char_pos, address, action)
    for pattern, action in _PATTERNS:
        for match in re.finditer(pattern, plan_text, re.IGNORECASE):
            candidates.append((match.start(), match.group(1), action))

    # Sort by position; deduplicate by address (keep first occurrence per address)
    candidates.sort(key=lambda x: x[0])
    seen: set[str] = set()
    ordered: list[tuple[int, str, str]] = []
    for pos, addr, action in candidates:
        if addr not in seen:
            seen.add(addr)
            ordered.append((pos, addr, action))

    # ── Step 2: for each resource, extract its block text and parse params ─
    resources: list[dict] = []
    for idx, (pos, address, action) in enumerate(ordered):
        # Block ends just before the next resource header line
        next_pos = ordered[idx + 1][0] if idx + 1 < len(ordered) else len(plan_text)
        block_text = plan_text[pos:next_pos]
        resource_type, resource_name = _parse_address(address)
        resources.append({
            "address": address,
            "type": resource_type,
            "name": resource_name,
            "action": action,
            "risks": _detect_risks(resource_type, action),
            "key_params": _extract_params(block_text),
        })

    # ── Step 3: parse summary line ─────────────────────────────────────────
    summary_match = re.search(
        r"Plan:\s+(\d+) to add,\s+(\d+) to change,\s+(\d+) to destroy",
        plan_text, re.IGNORECASE,
    )
    if summary_match:
        summary = {
            "add":     int(summary_match.group(1)),
            "change":  int(summary_match.group(2)),
            "destroy": int(summary_match.group(3)),
        }
    else:
        summary = {
            "add":     sum(1 for r in resources if r["action"] == "create"),
            "change":  sum(1 for r in resources if r["action"] in ("update", "replace")),
            "destroy": sum(1 for r in resources if r["action"] == "destroy"),
        }

    return {"summary": summary, "resources": resources}


@router.post("/terraform/plan", response_model=TerraformPlanResponse)
async def parse_plan(request: TerraformPlanRequest) -> TerraformPlanResponse:
    """
    Parse raw `terraform plan` text output and return a structured breakdown
    of all resource changes with risk annotations.
    """
    result = parse_terraform_plan(request.plan_output)
    return TerraformPlanResponse(
        summary=result["summary"],
        resources=[TfResource(**r) for r in result["resources"]],
        total_changes=len(result["resources"]),
    )
