// src/integrations/gitlab.js
//
// Real GitLab REST API (v4) client. Pulls open merge requests and recent
// pipeline results for a project, and computes review-time / pass-rate signals.
//
// Zero external dependencies — uses Node's built-in global fetch.
//
// Auth: GitLab Personal Access Token with `read_api` scope.
//   https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html
//
// Required env vars:
//   GITLAB_BASE_URL     e.g. https://gitlab.com  (or your self-hosted instance URL)
//   GITLAB_TOKEN        personal access token with read_api scope
//   GITLAB_PROJECT_ID   numeric project ID or URL-encoded path (e.g. "group%2Fsensor-fusion-sdk")

function isConfigured() {
  const { GITLAB_BASE_URL, GITLAB_TOKEN } = process.env;
  return Boolean(GITLAB_BASE_URL && GITLAB_TOKEN);
}

function hoursBetween(a, b) {
  return Math.abs(new Date(b) - new Date(a)) / (1000 * 60 * 60);
}

async function apiGet(pathname, params) {
  const base = process.env.GITLAB_BASE_URL.replace(/\/$/, "") + "/api/v4";
  const url = new URL(base + pathname);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, { headers: { "PRIVATE-TOKEN": process.env.GITLAB_TOKEN } });
  if (!res.ok) throw new Error(`GitLab request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Fetches and computes delivery signals for one GitLab project.
 * Returns null if credentials aren't configured.
 */
async function fetchGitlabSignals(projectId = process.env.GITLAB_PROJECT_ID) {
  if (!isConfigured() || !projectId) return null;

  const encodedId = encodeURIComponent(projectId);

  // docs: https://docs.gitlab.com/ee/api/merge_requests.html
  const openMRs = await apiGet(`/projects/${encodedId}/merge_requests`, { state: "opened", per_page: 100 });

  const avgReviewHours = openMRs.length
    ? openMRs.reduce((sum, mr) => sum + hoursBetween(mr.created_at, mr.updated_at), 0) / openMRs.length
    : 0;

  // docs: https://docs.gitlab.com/ee/api/pipelines.html
  const pipelines = await apiGet(`/projects/${encodedId}/pipelines`, { per_page: 50, order_by: "id", sort: "desc" });

  const finished = pipelines.filter((p) => ["success", "failed"].includes(p.status));
  const passRate = finished.length
    ? finished.filter((p) => p.status === "success").length / finished.length
    : null;

  return {
    source: "gitlab",
    project: projectId,
    openMRs: openMRs.length,
    avgReviewHours: Math.round(avgReviewHours * 10) / 10,
    pipelinePassRate: passRate === null ? null : Math.round(passRate * 1000) / 10,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchGitlabSignals };
