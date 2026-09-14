"""One-time, exact-tip LightGuide cleanup after successful main integration CI."""
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = "V-Vekaria/LightGuide-v2"
SELECTED = "d6110136934b3b78456a90b570d58ce00885145c"
PLAN = json.loads(r'''[{"name":"codex/offline-mobile-app","sha":"d6110136934b3b78456a90b570d58ce00885145c","tag":"archive/2026-09-14/codex/offline-mobile-app","merged":true},{"name":"docs/professional-product-stack","sha":"2b11c43ff3021c88b3ce12e83f4bde86e3b6ed46","tag":"archive/2026-09-14/docs/professional-product-stack","merged":true},{"name":"docs/v1-architecture-freeze","sha":"30fc99698fa1c1afed4f97bb067a7a1f9ead20fa","tag":"archive/2026-09-14/docs/v1-architecture-freeze","merged":false},{"name":"experiment/phase-0-ar-positioning","sha":"5bc532b0d1bfd94f8f554867eec94e7403d1a7ce","tag":"archive/2026-09-14/experiment/phase-0-ar-positioning","merged":false},{"name":"feat/companion-app","sha":"85a43f69f75d7af60ad687870bf54d0d07380edf","tag":"archive/2026-09-14/feat/companion-app","merged":true},{"name":"feat/offline-app-delivery","sha":"7184b71aa9e6d97138021cc44a34a0a05573b6f7","tag":"archive/2026-09-14/feat/offline-app-delivery","merged":false}]''')

def retire(api, head):
    if api("GET", "")["default_branch"] != "main":
        raise RuntimeError("Default branch changed; stop.")
    def main_unchanged():
        if api("GET", "/git/ref/heads/main")["object"]["sha"] != head:
            raise RuntimeError("Main moved after the tested revision; stop.")
    main_unchanged()
    comparison = api("GET", "/compare/" + SELECTED + "..." + head)
    if comparison["status"] not in ("ahead", "identical"):
        raise RuntimeError("Selected Codex source is not integrated.")
    rows = []
    # Preflight every branch before making any write.
    for item in PLAN:
        name, sha, tag = item["name"], item["sha"], item["tag"]
        if name == "main" or not tag.startswith("archive/2026-09-14/"):
            raise RuntimeError("Invalid cleanup allowlist.")
        ref = api("GET", "/git/ref/heads/" + quote(name, safe="/"), missing=True)
        backup = api("GET", "/git/ref/tags/" + quote(tag, safe="/"), missing=True)
        if backup is not None and backup["object"]["sha"] != sha:
            raise RuntimeError("Recovery tag mismatch for " + name)
        if ref is None:
            if backup is None:
                raise RuntimeError("Branch absent without recovery tag: " + name)
            rows.append((item, False, True))
            continue
        if ref["object"]["sha"] != sha:
            raise RuntimeError("Branch moved; preserve it: " + name)
        branch = api("GET", "/branches/" + quote(name, safe=""))
        if branch.get("protected", True):
            raise RuntimeError("Protected branch; preserve it: " + name)
        if item["merged"]:
            check = api("GET", "/compare/" + sha + "..." + head)
            if check["status"] not in ("ahead", "identical"):
                raise RuntimeError("Expected merged branch is not contained: " + name)
        rows.append((item, True, backup is not None))
    # Establish and verify ALL recovery tags before deleting ANY branch.
    for item, exists, backed_up in rows:
        main_unchanged()
        if not backed_up:
            api("POST", "/git/refs", {"ref": "refs/tags/" + item["tag"], "sha": item["sha"]})
        tag = api("GET", "/git/ref/tags/" + quote(item["tag"], safe="/"))
        if tag["object"]["sha"] != item["sha"]:
            raise RuntimeError("Recovery verification failed.")
    results = []
    for item, exists, backed_up in rows:
        main_unchanged()
        name = item["name"]
        if exists:
            current = api("GET", "/git/ref/heads/" + quote(name, safe="/"))
            if current["object"]["sha"] != item["sha"]:
                raise RuntimeError("Branch moved during cleanup; preserve it: " + name)
            if api("GET", "/branches/" + quote(name, safe="")).get("protected", True):
                raise RuntimeError("Branch protection changed; preserve it.")
            api("DELETE", "/git/refs/heads/" + quote(name, safe="/"))
            if api("GET", "/git/ref/heads/" + quote(name, safe="/"), missing=True) is not None:
                raise RuntimeError("Deletion not confirmed: " + name)
        results.append({"branch": name, "sha": item["sha"], "recovery_tag": item["tag"], "status": "deleted" if exists else "already_absent"})
    return results

def main():
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise RuntimeError("Wrong repository.")
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    run = event.get("workflow_run", {})
    if (run.get("event") != "push" or run.get("head_branch") != "main"
        or run.get("conclusion") != "success"
        or run.get("head_repository", {}).get("full_name") != REPO):
        raise RuntimeError("Only a successful same-repository main push is eligible.")
    token = os.environ["GH_TOKEN"]
    def api(method, path, body=None, missing=False):
        data = None if body is None else json.dumps(body).encode()
        request = Request("https://api.github.com/repos/" + REPO + path, data=data,
            method=method, headers={"Authorization": "Bearer " + token,
                "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as error:
            if missing and error.code == 404:
                return None
            raise RuntimeError(method + " " + path + " returned HTTP " + str(error.code)) from None
    verified = api("GET", "/actions/runs/" + str(run["id"]))
    if (verified["head_sha"] != run["head_sha"] or verified["conclusion"] != "success"
        or verified["event"] != "push" or verified["head_branch"] != "main"):
        raise RuntimeError("Run metadata changed.")
    workflow = api("GET", "/actions/workflows/" + str(verified["workflow_id"]))
    if workflow["path"] != ".github/workflows/codex-application.yml":
        raise RuntimeError("Unexpected workflow.")
    jobs = api("GET", "/actions/runs/" + str(run["id"]) + "/jobs?per_page=100")
    if jobs["total_count"] > len(jobs["jobs"]):
        raise RuntimeError("Incomplete job evidence.")
    by_name = {j["name"]: j["conclusion"] for j in jobs["jobs"]}
    if any(by_name.get(n) != "success" for n in ("software", "android", "android-smoke", "positioning")):
        raise RuntimeError("Required integration job did not pass.")
    results = retire(api, run["head_sha"])
    print(json.dumps(results, indent=2))
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("# LightGuide branch cleanup\n\n")
        for row in results:
            summary.write("- " + row["branch"] + ": " + row["status"] + "; recovery " + row["recovery_tag"] + "\n")

if __name__ == "__main__":
    main()
