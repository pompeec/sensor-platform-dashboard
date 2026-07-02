// src/integrations/build.js
//
// Real build/CI system client. Implemented against the GitHub Actions REST API
// (most common build backend), with notes on swapping in Jenkins.
//
// Zero external dependencies — uses Node's built-in global fetch.
//
// GitHub Actions docs: https://docs.github.com/en/rest/actions/workflow-runs
// Auth: a GitHub fine-grained PAT with "Actions: Read-only" on the target repo.
//   https://github.com/settings/tokens
//
// Required env vars:
//   BUILD_PROVIDER   "github" (default) or "jenkins"
//   GITHUB_TOKEN     PAT with Actions read access
//   GITHUB_OWNER     e.g. "your-org"
//   GITHUB_REPO      e.g. "sensor-fusion-sdk"
//
// Jenkins alternative (if BUILD_PROVIDER=jenkins):
//   JENKINS_BASE_URL, JENKINS_USER, JENKINS_API_TOKEN, JENKINS_JOB_NAME
//   Swap fetchBuildSignals() below for a fetch() call to
//   `${JENKINS_BASE_URL}/job/${JENKINS_JOB_NAME}/api/json?tree=builds[result,timestamp,duration]`
//   using a Basic auth header built from JENKINS_USER:JENKINS_API_TOKEN, then
//   map `result` values (SUCCESS/FAILURE/UNSTABLE) the same way `conclusion` is mapped below.

async function fetchBuildSignals() {
  const provider = process.env.BUILD_PROVIDER || "github";
  if (provider !== "github") return null; // Jenkins branch left as an integration point — see header.

  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return null;

  // docs: https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
  const url = new URL(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs`);
  url.searchParams.set("per_page", "50");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub Actions request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();

  const runs = data.workflow_runs || [];
  const nightly = runs.filter((r) => r.name && /nightly|scheduled/i.test(r.name));
  const pool = nightly.length ? nightly : runs;

  const completed = pool.filter((r) => r.status === "completed");
  const passed = completed.filter((r) => r.conclusion === "success");
  const nightlyHealthPct = completed.length ? Math.round((passed.length / completed.length) * 1000) / 10 : null;

  const failedRuns = completed.filter((r) => r.conclusion !== "success");
  const flakyRatePct = completed.length ? Math.round((failedRuns.length / completed.length) * 1000) / 10 : null;

  return {
    source: "build",
    provider: "github-actions",
    repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    nightlyHealthPct,
    flakyRatePct,
    runsInspected: completed.length,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchBuildSignals };
