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
    """Parse raw terraform plan output; returns summary + resource list."""
    seen: set[str] = set()
    resources: list[dict] = []

    for pattern, action in _PATTERNS:
        for match in re.finditer(pattern, plan_text, re.IGNORECASE):
            address = match.group(1)
            if address in seen:
                continue
            seen.add(address)
            resource_type, resource_name = _parse_address(address)
            resources.append({
                "address": address,
                "type": resource_type,
                "name": resource_name,
                "action": action,
                "risks": _detect_risks(resource_type, action),
            })

    # Try to read summary line from the plan output
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
