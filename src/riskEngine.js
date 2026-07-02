// src/riskEngine.js
//
// Pure function(s) that combine Jira + GitLab + build signals into a single
// 0-100 program health score and per-workstream risk classification.
// No network calls here — this is intentionally deterministic and unit-testable.

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Computes an overall 0-100 health score from combined signals.
 * Weighting: build health and pipeline pass rate matter most (they're
 * leading indicators of shippability); Jira signals matter for near-term risk.
 */
function computeProgramHealth({ jira, gitlab, build }) {
  let score = 100;

  if (jira) {
    score -= jira.openBlockers * 4;
    score -= jira.slaBreaches7d * 5;
    score -= Math.min(jira.unestimatedStories * 0.5, 10);
    score -= clamp(jira.avgAgeP1Days - 2, 0, 10) * 2;
  }
  if (gitlab) {
    if (gitlab.pipelinePassRate !== null) score -= (100 - gitlab.pipelinePassRate) * 0.3;
    score -= clamp(gitlab.avgReviewHours - 12, 0, 48) * 0.3;
  }
  if (build) {
    if (build.nightlyHealthPct !== null) score -= (100 - build.nightlyHealthPct) * 0.4;
    if (build.flakyRatePct !== null) score -= build.flakyRatePct * 0.5;
  }

  return Math.round(clamp(score, 0, 100));
}

function classify(score) {
  if (score >= 80) return "safe";
  if (score >= 60) return "warn";
  return "crit";
}

/**
 * Scores a list of workstreams, each carrying its own jira/gitlab/build slice.
 * Shape: [{ name, jira, gitlab, build, previousScore? }]
 */
function scoreWorkstreams(workstreams) {
  return workstreams.map((w) => {
    const score = computeProgramHealth({ jira: w.jira, gitlab: w.gitlab, build: w.build });
    const trend = typeof w.previousScore === "number" ? score - w.previousScore : null;
    return {
      name: w.name,
      score,
      risk: classify(score),
      jiraRisk: w.jira ? classify(100 - w.jira.openBlockers * 15 - w.jira.slaBreaches7d * 20) : "warn",
      pipelinePassRate: w.gitlab ? w.gitlab.pipelinePassRate : null,
      buildHealth: w.build ? w.build.nightlyHealthPct : null,
      trend,
    };
  });
}

module.exports = { computeProgramHealth, classify, scoreWorkstreams };
