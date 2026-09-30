#!/usr/bin/env python3
"""Break one boundary on a local PostgreSQL container, print what changed, run a suite,
list what went red, restore. usage: sabotage.py <suite.sql> <breaks.json>

Each break is {"label", "fn"?: regprocedure, "old"?, "new"?, "sql"?, "undo"?, "print"?}.
A function break rewrites the function's definition text; it refuses to run
when `old` is not in the body, so a break that did not apply never reads green.
"""
import json, os, subprocess, sys

# The container the local database runs in; never a hosted one.
CONTAINER = os.environ.get("RANZA_PG_CONTAINER", "ranza-amend-pg")

def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-U", "ranza",
                        "-d", "ranza", "-At", "-q", "-v", "ON_ERROR_STOP=1"],
                       input=sql, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr

suite = open(sys.argv[1]).read()
for b in json.load(open(sys.argv[2])):
    print(f"=== {b['label']}")
    if "fn" in b:
        _, original = psql(f"select pg_get_functiondef('{b['fn']}'::regprocedure);")
        if b["old"] not in original:
            print("BREAK DID NOT APPLY: text not found"); sys.exit(1)
        code, out = psql(original.replace(b["old"], b["new"], 1) + ";")
        undo = original + ";"
    else:
        code, out = psql(b["sql"])
        undo = b["undo"]
    if code:
        print("BREAK FAILED:", out); sys.exit(1)
    if "fn" in b:
        _, now = psql(f"select pg_get_functiondef('{b['fn']}'::regprocedure);")
        print("--- altered:", "applied" if "/*sabotage*/" in now else "NOT APPLIED", "|", b["new"].strip()[:120])
    elif "print" in b:
        print("--- altered:", psql(b["print"])[1].strip()[:300])
    _, result = psql(suite)
    red = [l for l in result.splitlines() if l.startswith("not ok") or "ERROR" in l]
    print("--- red:" if red else "--- NOTHING WENT RED")
    for l in red[:8]: print("   ", l)
    code, out = psql(undo)
    if code: print("RESTORE FAILED:", out); sys.exit(1)
