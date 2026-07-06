function riskClass(r){return r==='crit'?'r-crit':r==='warn'?'r-warn':'r-safe';}
function riskLabel(r){return r==='crit'?'High':r==='warn'?'Elevated':'Low';}
function dialColor(score){return score>=80?'var(--safe)':score>=60?'var(--warn)':'var(--crit)';}

function priorityClass(p){
  if (!p) return '';
  const s = p.toLowerCase();
  if (s.includes('highest') || s === 'p0' || s === 'p1') return 'prio-crit';
  if (s.includes('high')) return 'prio-warn';
  return 'prio-normal';
}

async function loadSignals(){
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  const rows = document.getElementById('program-rows');
  const footer = document.getElementById('footer-note');

  try{
    const res = await fetch('/api/signals');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    statusBadge.classList.remove('err');
    statusText.textContent = data.liveConfigured
      ? 'LIVE SIGNAL CONNECTED'
      : 'SAMPLE SIGNALS (no .env credentials found)';

    document.getElementById('dial').style.setProperty('--score', data.programHealth);
    document.getElementById('dial').style.setProperty('--dial-color', dialColor(data.programHealth));
    document.getElementById('dial-num').textContent = data.programHealth;

    rows.innerHTML = '';
    data.workstreams.forEach((w, idx)=>{
      const tr = document.createElement('tr');
      tr.className = `row-${w.risk} clickable-row`;
      const trendTxt = w.trend === null ? '—' : (w.trend > 0 ? '+' + w.trend : String(w.trend));
      const trendColor = w.trend === null ? 'var(--muted)' : (w.trend < 0 ? 'var(--crit)' : 'var(--build)');
      const blockers = w.jiraDetail ? w.jiraDetail.openBlockers : '—';
      const slaBreaches = w.jiraDetail ? w.jiraDetail.slaBreaches7d : '—';
      const hasIssues = w.jiraDetail && w.jiraDetail.topIssues && w.jiraDetail.topIssues.length > 0;
      const detailId = `detail-${idx}`;

      tr.innerHTML = `
        <td class="expand-cell">${hasIssues ? '<span class="chevron">&#9656;</span>' : ''}</td>
        <td><span class="risk-pill ${riskClass(w.risk)}"></span>${w.name}</td>
        <td class="mono ${blockers > 0 ? 'stat-flag' : ''}">${blockers}</td>
        <td class="mono ${slaBreaches > 0 ? 'stat-flag' : ''}">${slaBreaches}</td>
        <td class="mono">${w.pipelinePassRate === null ? '—' : w.pipelinePassRate + '%'}</td>
        <td class="mono">${w.buildHealth === null ? '—' : w.buildHealth + '%'}</td>
        <td class="mono score-cell risk-${w.risk}">${w.score}</td>
        <td class="mono" style="color:${trendColor}">${trendTxt}</td>
      `;
      if (hasIssues) {
        tr.addEventListener('click', () => toggleDetail(detailId, tr));
      }
      rows.appendChild(tr);

      if (hasIssues) {
        const detailRow = document.createElement('tr');
        detailRow.id = detailId;
        detailRow.className = 'detail-row hidden';
        const issuesHtml = w.jiraDetail.topIssues.map(i => `
          <div class="ticket">
            <span class="ticket-key">${i.key}</span>
            <span class="ticket-prio ${priorityClass(i.priority)}">${i.priority}</span>
            <span class="ticket-status">${i.status}</span>
            <div class="ticket-summary">${i.summary}</div>
          </div>
        `).join('');
        detailRow.innerHTML = `<td colspan="8"><div class="ticket-list">${issuesHtml}</div></td>`;
        rows.appendChild(detailRow);
      }
    });

    footer.textContent = data.liveConfigured
      ? 'LIVE — pulling real Jira/GitLab/build data per .env configuration.'
      : 'SAMPLE DATA — add Jira/GitLab/build credentials to .env to go live. See README.md.';
  }catch(err){
    statusBadge.classList.add('err');
    statusText.textContent = 'Signal fetch failed';
    rows.innerHTML = `<tr><td colspan="8" class="mono">Error: ${err.message}</td></tr>`;
  }
}

function toggleDetail(detailId, headerRow){
  const row = document.getElementById(detailId);
  const chevron = headerRow.querySelector('.chevron');
  const isHidden = row.classList.contains('hidden');
  row.classList.toggle('hidden');
  if (chevron) chevron.innerHTML = isHidden ? '&#9662;' : '&#9656;';
}

async function generateNarrative(){
  const btn = document.getElementById('gen-btn');
  const out = document.getElementById('narrative-out');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  out.innerHTML = '<span class="placeholder">Calling /api/report…</span>';
  try{
    const res = await fetch('/api/report');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    out.textContent = data.narrative;
  }catch(err){
    out.innerHTML = `<span class="placeholder">Error: ${err.message}</span>`;
  }finally{
    btn.disabled = false;
    btn.textContent = 'Generate Executive Summary';
  }
}

loadSignals();
