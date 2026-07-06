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
  const scored = workstreams.map((w) => {
    const score = computeProgramHealth({ jira: w.jira, gitlab: w.gitlab, build: w.build });
    const trend = typeof w.previousScore === "number" ? score - w.previousScore : null;
    return {
      name: w.name,
      score,
      risk: classify(score),
      jiraRisk: w.jira ? classify(100 - w.jira.openBlockers * 15 - w.jira.slaBreaches7d * 20) : "warn",
      // Raw Jira defect signal — surfaced so the dashboard can show real numbers,
      // not just a Low/Elevated/High label.
      jiraDetail: w.jira
        ? {
            openBlockers: w.jira.openBlockers,
            slaBreaches7d: w.jira.slaBreaches7d,
            unestimatedStories: w.jira.unestimatedStories,
            avgAgeP1Days: w.jira.avgAgeP1Days,
            topIssues: w.jira.topIssues || [],
          }
        : null,
      pipelinePassRate: w.gitlab ? w.gitlab.pipelinePassRate : null,
      openMRs: w.gitlab ? w.gitlab.openMRs : null,
      avgReviewHours: w.gitlab ? w.gitlab.avgReviewHours : null,
      buildHealth: w.build ? w.build.nightlyHealthPct : null,
      flakyRatePct: w.build ? w.build.flakyRatePct : null,
      trend,
    };
  });

  // Worst risk first — the whole point of a risk table is surfacing what
  // needs attention without making the reader scan for it.
  const order = { crit: 0, warn: 1, safe: 2 };
  return scored.sort((a, b) => order[a.risk] - order[b.risk] || a.score - b.score);
}

module.exports = { computeProgramHealth, classify, scoreWorkstreams };
