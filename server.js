// server.js
//
// Aggregates Jira + GitLab + build signals (live if credentials are set in
// .env, sample data otherwise), scores workstreams, and serves both the
// JSON API and the static dashboard that consumes it.
//
// Zero external dependencies — built on Node's http/fs/path only.
// Run:  npm start   →  http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

loadDotEnv(path.join(__dirname, ".env"));

const { fetchJiraRiskSignals } = require("./src/integrations/jira");
const { fetchGitlabSignals } = require("./src/integrations/gitlab");
const { fetchBuildSignals } = require("./src/integrations/build");
const { scoreWorkstreams } = require("./src/riskEngine");
const { generateExecutiveNarrative } = require("./src/aiReport");

const PORT = process.env.PORT || 3000;

// --- tiny .env loader (no dotenv dependency) ---
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const sample = {
  jira: JSON.parse(fs.readFileSync(path.join(__dirname, "data/sample/jira-sample.json"))),
  gitlab: JSON.parse(fs.readFileSync(path.join(__dirname, "data/sample/gitlab-sample.json"))),
  build: JSON.parse(fs.readFileSync(path.join(__dirname, "data/sample/build-sample.json"))),
};

/**
 * Builds the workstream list. If live credentials are configured for a
 * single project/repo, that project is scored as one live workstream and
 * the rest of the sample portfolio fills in around it (clearly labeled).
 * To score multiple live workstreams, loop this with a list of
 * project keys / project IDs / repos from your own config — see README.
 */
async function buildWorkstreams() {
  const [liveJira, liveGitlab, liveBuild] = await Promise.all([
    fetchJiraRiskSignals().catch((err) => ({ error: err.message })),
    fetchGitlabSignals().catch((err) => ({ error: err.message })),
    fetchBuildSignals().catch((err) => ({ error: err.message })),
  ]);

  const liveConfigured = [liveJira, liveGitlab, liveBuild].some((s) => s && !s.error);

  const names = Object.keys(sample.jira);
  const workstreams = names.map((name, idx) => {
    const isLiveSlot = liveConfigured && idx === 0;
    return {
      name: isLiveSlot ? `${name} (LIVE)` : name,
      jira: isLiveSlot && liveJira && !liveJira.error ? liveJira : sample.jira[name],
      gitlab: isLiveSlot && liveGitlab && !liveGitlab.error ? liveGitlab : sample.gitlab[name],
      build: isLiveSlot && liveBuild && !liveBuild.error ? liveBuild : sample.build[name],
    };
  });

  return { workstreams, liveConfigured };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, "public", filePath);
  if (!filePath.startsWith(path.join(__dirname, "public"))) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/signals") {
      const { workstreams, liveConfigured } = await buildWorkstreams();
      const scored = scoreWorkstreams(workstreams);
      const programHealth = Math.round(scored.reduce((s, w) => s + w.score, 0) / scored.length);
      return sendJson(res, 200, { liveConfigured, programHealth, workstreams: scored, fetchedAt: new Date().toISOString() });
    }

    if (req.url === "/api/report") {
      const { workstreams } = await buildWorkstreams();
      const scored = scoreWorkstreams(workstreams);
      const { narrative, toolCalls } = await generateExecutiveNarrative(scored);
      return sendJson(res, 200, { narrative, toolCalls });
    }

    return serveStatic(req, res);
  } catch (err) {
    return sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Program Signal Console running at http://localhost:${PORT}`);
});
