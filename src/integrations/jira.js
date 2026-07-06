// src/integrations/jira.js
//
// Real Jira Cloud REST API (v3) client. Uses JQL search to pull risk-relevant
// issue data for a given project and computes the same risk metrics shown on
// the dashboard: open blockers, SLA breaches, unestimated stories, avg age of P1s.
//
// Zero external dependencies — uses Node's built-in global fetch (Node 18+).
//
// Auth: Jira Cloud uses HTTP Basic auth with your Atlassian account email +
// an API token (NOT your password). Generate a token at:
//   https://id.atlassian.com/manage-profile/security/api-tokens
//
// Required env vars (see .env.example):
//   JIRA_BASE_URL      e.g. https://your-domain.atlassian.net
//   JIRA_EMAIL         your Atlassian account email
//   JIRA_API_TOKEN     the API token generated above
//   JIRA_PROJECT_KEY   e.g. "GENAI" for a "GenAI Platform" project

function authHeader() {
  const { JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  const token = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
  return `Basic ${token}`;
}

function isConfigured() {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  return Boolean(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN);
}

// Runs a JQL search against /rest/api/3/search.
// docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
async function searchIssues(jql, fields) {
  const url = new URL("/rest/api/3/search", process.env.JIRA_BASE_URL);
  url.searchParams.set("jql", jql);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("maxResults", "100");

  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira search failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.issues || [];
}

function ageInDays(createdIso) {
  return (Date.now() - new Date(createdIso).getTime()) / (1000 * 60 * 60 * 24);
}

function toIssueSummary(issue) {
  return {
    key: issue.key,
    summary: issue.fields.summary,
    priority: issue.fields.priority ? issue.fields.priority.name : "Unknown",
    status: issue.fields.status ? issue.fields.status.name : "Unknown",
  };
}

/**
 * Fetches and computes risk signals for one Jira project.
 * Returns null if credentials aren't configured, so callers can fall back
 * to sample data without crashing.
 */
async function fetchJiraRiskSignals(projectKey = process.env.JIRA_PROJECT_KEY) {
  if (!isConfigured() || !projectKey) return null;

  const fields = ["summary", "priority", "status", "created", "resolutiondate"];

  const [blockers, breaches, unestimated, p1s] = await Promise.all([
    searchIssues(`project = ${projectKey} AND priority = Highest AND statusCategory != Done`, fields),
    searchIssues(`project = ${projectKey} AND labels = "sla-breach" AND resolved >= -7d`, fields),
    searchIssues(`project = ${projectKey} AND type = Story AND statusCategory != Done AND "Story Points" is EMPTY`, fields),
    searchIssues(`project = ${projectKey} AND priority = "P1" AND statusCategory != Done`, fields),
  ]);

  const avgAgeP1 = p1s.length
    ? p1s.reduce((sum, i) => sum + ageInDays(i.fields.created), 0) / p1s.length
    : 0;

  // Surface real ticket detail for the top blockers + SLA breaches so the
  // dashboard can show what's actually wrong, not just a count.
  const topIssues = [...blockers, ...breaches].slice(0, 5).map(toIssueSummary);

  return {
    source: "jira",
    project: projectKey,
    openBlockers: blockers.length,
    slaBreaches7d: breaches.length,
    unestimatedStories: unestimated.length,
    avgAgeP1Days: Math.round(avgAgeP1 * 10) / 10,
    topIssues,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchJiraRiskSignals };
