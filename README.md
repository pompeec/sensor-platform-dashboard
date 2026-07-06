# Program Signal Console

An AI-powered program dashboard for GenAI/LLM platform engineering: real Jira, GitLab, and build-system (GitHub Actions) integrations, a deterministic risk-scoring engine, and a Claude-generated executive narrative. Built as a working portfolio piece for AI-platform TPM roles that ask for exactly this ("AI dashboards," "intelligent integrations," "AI-enhanced workflows").

**Zero external npm dependencies.** Runs on Node's built-in `http` + global `fetch` (Node 18+) so it starts with nothing more than `node server.js` — no `npm install` required, no network access needed to get running.

## Quick start (sample data, no accounts needed)

```bash
cd sensor-platform-dashboard
cp .env.example .env      # leave everything blank — sample data will be used
npm start                 # → http://localhost:3000
npm test                  # runs the risk-engine unit tests
```

Open `http://localhost:3000`. You'll see 5 sample GenAI platform workstreams (RAG Retrieval Pipeline, Agent Orchestration Framework, Prompt & Guardrails Service, LLM Fine-Tuning Pipeline, Model Eval & Benchmarking) scored by the same engine that would score live data. Click **Generate Executive Summary** — this calls `/api/report`, which calls the real Anthropic API. Without an `ANTHROPIC_API_KEY` it returns a clear message instead of fabricating output.

## Architecture

```
server.js                  Node http server: serves the dashboard + 2 JSON endpoints
├─ /api/signals             aggregated, scored workstream data
└─ /api/report               AI executive narrative (real Anthropic API call)

src/integrations/
├─ jira.js                  Jira Cloud REST v3 — JQL search, real API shape
├─ gitlab.js                GitLab REST v4 — merge requests + pipelines
└─ build.js                 GitHub Actions REST — workflow run history
                             (Jenkins swap-in documented in the file header)

src/riskEngine.js           pure scoring functions — no I/O, unit tested
src/aiReport.js              Claude API call for the executive narrative

data/sample/*.json          fallback data, shaped exactly like the live
                             integration output, so the UI and scoring
                             logic behave identically whether data is
                             live or sample

public/                      dashboard frontend (fetches /api/* directly)
test/riskEngine.test.js      npm test — proves the scoring math is correct
```

Every integration module (`jira.js`, `gitlab.js`, `build.js`) checks whether its credentials are present in `process.env`. If not, it returns `null` and the server falls back to the matching sample file — so the app never crashes for missing credentials, and you can wire sources one at a time.

## Going live: wiring instructions

Fill in as many of these as you have access to. Each is independent — you can go live on Jira only, GitLab only, all three, or none.

### 1. Anthropic (AI narrative)
1. Go to https://console.anthropic.com/settings/keys and create a key.
2. Set `ANTHROPIC_API_KEY` in `.env`.

### 2. Jira Cloud
1. Generate an API token: https://id.atlassian.com/manage-profile/security/api-tokens
2. Set in `.env`:
   - `JIRA_BASE_URL` — e.g. `https://your-domain.atlassian.net`
   - `JIRA_EMAIL` — your Atlassian account email
   - `JIRA_API_TOKEN` — the token from step 1
   - `JIRA_PROJECT_KEY` — the project key to score (e.g. `GENAI`)
3. Note: the SLA-breach query assumes a `sla-breach` label applied by your Jira automation rules or SLA add-on, and the "unestimated" query assumes the default Story Points field. Both are one-line JQL edits in `src/integrations/jira.js` if your instance differs.

### 3. GitLab
1. Create a Personal Access Token with `read_api` scope: https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html
2. Set in `.env`:
   - `GITLAB_BASE_URL` — e.g. `https://gitlab.com` or your self-hosted URL
   - `GITLAB_TOKEN` — the token from step 1
   - `GITLAB_PROJECT_ID` — numeric project ID (visible on the project's Settings → General page) or URL-encoded path

### 4. Build system (GitHub Actions by default)
1. Create a fine-grained PAT with `Actions: Read-only` on the target repo: https://github.com/settings/tokens
2. Set in `.env`:
   - `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`
3. **Using Jenkins instead?** Set `BUILD_PROVIDER=jenkins` and implement the Jenkins branch — the exact endpoint, auth pattern, and field mapping are documented in the header comment of `src/integrations/build.js`. It's a ~15-line swap.

### Scoring more than one live workstream
Out of the box, one live project/repo (whichever you configure) is scored as workstream #1, labeled `(LIVE)`, alongside 4 sample workstreams so the dashboard still shows a full portfolio. To score multiple real workstreams at once, replace the single `fetchJiraRiskSignals()` / `fetchGitlabSignals()` / `fetchBuildSignals()` calls in `buildWorkstreams()` (server.js) with a loop over a list of project keys / project IDs / repos — each integration function already accepts an explicit argument for exactly this.

## Design notes

- **Risk scoring is deterministic and testable** (`src/riskEngine.js`, `test/riskEngine.test.js`) — not an LLM call, so it's fast, free, and auditable. The LLM is used only where judgment/narrative synthesis actually adds value: turning numbers into an executive-readable paragraph.
- **Sample data matches live data shape exactly** — the frontend, risk engine, and API layer don't know or care whether a number came from a real Jira query or `data/sample/jira-sample.json`. This is what makes "runs now, goes live later" possible without a rewrite.
- **No framework dependencies** — easy to read end-to-end in an interview, easy to drop into any Node environment without an install step.
