"""Counts tenant transactions per phase from one container's Postgres log.

Phases are cut at the EVMARK statements the harness writes into the same log,
so they are ordered by Postgres itself rather than by comparing clocks. A
tenant transaction is one `select app.set_request_context(...)` executed by
ranza_app: withOrganizationContext() opens every one of them that way.
"""
import json
import re
import subprocess
import sys

container, label, out = sys.argv[1], sys.argv[2], sys.argv[3]
log = subprocess.run(["docker", "logs", container], capture_output=True, text=True)
raw_lines = (log.stdout + log.stderr).splitlines()

# A statement's text continues on unprefixed lines; fold them into the entry
# they belong to so the classifier sees the whole query.
lines = []
for raw in raw_lines:
    if re.match(r"^\S+ \S+ UTC \[", raw) or not lines:
        lines.append(raw)
    else:
        lines[-1] += " " + raw.strip()

LINE = re.compile(r"^(\S+ \S+) UTC \[(\d+)\] (\S*) LOG:  (.*)$")
MARK = re.compile(r"EVMARK (\S+) run(\d+) (\S+)'")


def classify(sql):
    s = " ".join(sql.split())
    if "unnest(" in s and "can_use_capability" in s:
        return "shell: every destination's capability, batched (listEntitledPropertiesByCapability)"
    if "has_organization_permission" in s or "permitted" in s.lower():
        return "a permission check first: permittedProperties, or the audit read opening with its gate"
    if "can_use_capability" in s and "from public.properties" in s and "order by organization.name" in s:
        return "one capability's entitled Properties (listEntitledProperties)"
    if "audit.records" in s or "from audit" in s:
        return "audit log read"
    if "organization_id\" as \"organizationId\"" in s.replace(" ", "") or "property.organization_id as" in s:
        return "audit log read (gate)"
    if "folio" in s:
        return "folios read"
    if "membership" in s:
        return "People screen read (roster or roles)"
    if "role.key" in s or "staff_roles" in s:
        return "staff roles read"
    return s[:90]


runs = {}
current = None
last_app_stmt = {}  # pid -> waiting for the statement after set_request_context
for raw in lines:
    m = LINE.match(raw)
    if not m:
        continue
    ts, pid, who, msg = m.groups()
    mk = MARK.search(msg)
    if mk and mk.group(1) == label:
        run, name = mk.group(2), mk.group(3)
        phases = runs.setdefault(run, [])
        if name != "start":
            current["name"] = name
            phases.append(current)
        current = {"name": None, "tenantTx": 0, "kinds": {}, "authQueries": 0, "appDbMs": 0.0, "authDbMs": 0.0}
        continue
    if current is None:
        continue
    user = who.split("@")[0]
    if msg.startswith("duration:"):
        ms = float(msg.split()[1])
        if user == "ranza_app":
            current["appDbMs"] += ms
        elif user == "ranza_auth":
            current["authDbMs"] += ms
        continue
    if user == "ranza_app" and msg.startswith("execute"):
        if "set_request_context" in msg:
            current["tenantTx"] += 1
            last_app_stmt[pid] = current
        elif pid in last_app_stmt:
            phase = last_app_stmt.pop(pid)
            kind = classify(msg.split(":", 1)[1])
            phase["kinds"][kind] = phase["kinds"].get(kind, 0) + 1
    elif user == "ranza_auth" and msg.startswith("execute"):
        current["authQueries"] += 1

for phases in runs.values():
    for p in phases:
        p["appDbMs"] = round(p["appDbMs"])
        p["authDbMs"] = round(p["authDbMs"])
json.dump(runs, open(out, "w"), indent=2)
for run, phases in sorted(runs.items()):
    print(f"{label} run{run}")
    for p in phases:
        print(f"  {p['name']:32} tenantTx={p['tenantTx']:2}  authQueries={p['authQueries']:2}  kinds={p['kinds']}")
