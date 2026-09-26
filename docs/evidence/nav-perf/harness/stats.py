"""Summarises the timing runs: every click, both builds, no clicks dropped."""
import glob
import json
import os
import statistics
import sys

DATA = sys.argv[1]
STALL_MS = 1500  # a click this slow is reported as a stall, never silently dropped


def load(label):
    runs = []
    for f in sorted(glob.glob(os.path.join(DATA, f"timing-{label}-run*.json"))):
        runs.append(json.load(open(f)))
    return runs


def median(values):
    return round(statistics.median(values)) if values else None


def pct(values, q):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(q * len(ordered)))])


def summary(label):
    runs = load(label)
    clicks = [c for r in runs for c in r["clicks"]]
    measured = [c for c in clicks if not c.get("stalled")]
    stalls = [c for c in measured if c["dataMs"] > STALL_MS]
    calm = [c for c in measured if c["dataMs"] <= STALL_MS]
    return {
        "label": label,
        "runs": [{"run": r["run"], "at": r["at"], "loadAtStart": r["loadAtStart"], "loadAtEnd": r["loadAtEnd"]} for r in runs],
        "clicks": len(clicks),
        "unmeasured": len(clicks) - len(measured),
        "reruns": sum(1 for c in clicks if c.get("rerunOf")),
        "newDocuments": sum(1 for c in measured if c["newDocument"]),
        "documentRequests": sum(c["documentRequests"] for c in measured),
        "skeletonSeen": sum(1 for c in measured if c["skeletonSeen"]),
        "feedback": {"median": median([c["feedbackMs"] for c in measured]), "p90": pct([c["feedbackMs"] for c in measured], 0.9)},
        "data": {"median": median([c["dataMs"] for c in measured]), "p90": pct([c["dataMs"] for c in measured], 0.9)},
        "dataCalm": {"n": len(calm), "median": median([c["dataMs"] for c in calm]), "min": min((c["dataMs"] for c in calm), default=None), "max": max((c["dataMs"] for c in calm), default=None)},
        "feedbackCalm": {"median": median([c["feedbackMs"] for c in calm])},
        "firstByte": {"median": median([c["firstByteMs"] for c in measured if c.get("firstByteMs") is not None]), "missing": sum(1 for c in measured if c.get("firstByteMs") is None)},
        "stalls": {"n": len(stalls), "ms": sorted(c["dataMs"] for c in stalls)},
        "perSegment": {
            seg: {
                "n": len(xs),
                "feedbackMedian": median([c["feedbackMs"] for c in xs]),
                "dataMedian": median([c["dataMs"] for c in xs]),
                "calmDataMedian": median([c["dataMs"] for c in xs if c["dataMs"] <= STALL_MS]),
            }
            for seg in ["finance", "people", "audit-log", "analytics", "today"]
            for xs in [[c for c in measured if c["segment"] == seg]]
        },
        "rows": [
            {"run": r["run"], "round": c["round"], **{k: c.get(k) for k in ["segment", "href", "url", "newDocument", "documentRequests", "navigationEntryType", "firstByteMs", "firstByteKind", "feedbackMs", "dataMs", "skeletonSeen"]}, "rerun": bool(c.get("rerunOf")), "rerunOfDataMs": (c.get("rerunOf") or {}).get("dataMs"), "rerunOfStalled": (c.get("rerunOf") or {}).get("stalled", False)}
            for r in runs
            for c in r["clicks"]
        ],
    }


out = {label: summary(label) for label in ["after", "before"]}
json.dump(out, open(os.path.join(DATA, "timing-summary.json"), "w"), indent=2)
for label, s in out.items():
    print(label, {k: v for k, v in s.items() if k not in ("rows", "perSegment")})
    for seg, v in s["perSegment"].items():
        print("   ", seg.ljust(10), v)
