#!/usr/bin/env python3
"""Rewrite one function on a local PostgreSQL container, prove the rewrite landed, run a
shell command, restore. usage: sabotage-run.py <regprocedure> <old-file> <new-file> -- <command...>
The new text must contain /*sabotage*/; a break that did not land stops here."""
import os, subprocess, sys

# The container the local database runs in; never a hosted one.
CONTAINER = os.environ.get("RANZA_PG_CONTAINER", "ranza-amend-pg")

def psql(sql):
    r = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-U", "ranza", "-d",
                        "ranza", "-At", "-q", "-v", "ON_ERROR_STOP=1"],
                       input=sql, capture_output=True, text=True)
    if r.returncode: sys.exit("psql failed: " + r.stderr)
    return r.stdout

fn, old, new = sys.argv[1], open(sys.argv[2]).read(), open(sys.argv[3]).read()
command = sys.argv[sys.argv.index("--") + 1:]
original = psql(f"select pg_get_functiondef('{fn}'::regprocedure);")
if old not in original: sys.exit("BREAK DID NOT APPLY: text not found")
psql(original.replace(old, new, 1) + ";")
landed = psql(f"select position('/*sabotage*/' in pg_get_functiondef('{fn}'::regprocedure)) > 0;").strip()
print("--- altered:", "applied" if landed == "t" else "NOT APPLIED")
try:
    subprocess.run(command)
finally:
    psql(original + ";")
    restored = psql(f"select position('/*sabotage*/' in pg_get_functiondef('{fn}'::regprocedure)) > 0;").strip()
    print("--- restored:", restored == "f")
