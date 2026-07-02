function riskClass(r){return r==='crit'?'r-crit':r==='warn'?'r-warn':'r-safe';}
function riskLabel(r){return r==='crit'?'High':r==='warn'?'Elevated':'Low';}
function dialColor(score){return score>=80?'var(--safe)':score>=60?'var(--warn)':'var(--crit)';}

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
      : `${3} SAMPLE SIGNALS (no .env credentials found)`;

    document.getElementById('dial').style.setProperty('--score', data.programHealth);
    document.getElementById('dial').style.setProperty('--dial-color', dialColor(data.programHealth));
    document.getElementById('dial-num').textContent = data.programHealth;

    rows.innerHTML = '';
    data.workstreams.forEach(w=>{
      const tr = document.createElement('tr');
      const trendTxt = w.trend === null ? '—' : (w.trend > 0 ? '+' + w.trend : String(w.trend));
      const trendColor = w.trend === null ? 'var(--muted)' : (w.trend < 0 ? 'var(--crit)' : 'var(--build)');
      tr.innerHTML = `
        <td>${w.name}</td>
        <td><span class="risk-pill ${riskClass(w.jiraRisk)}"></span>${riskLabel(w.jiraRisk)}</td>
        <td class="mono">${w.pipelinePassRate === null ? '—' : w.pipelinePassRate + '%'}</td>
        <td class="mono">${w.buildHealth === null ? '—' : w.buildHealth + '%'}</td>
        <td class="mono">${w.score}</td>
        <td class="mono" style="color:${trendColor}">${trendTxt}</td>
      `;
      rows.appendChild(tr);
    });

    footer.textContent = data.liveConfigured
      ? 'LIVE — pulling real Jira/GitLab/build data per .env configuration.'
      : 'SAMPLE DATA — add Jira/GitLab/build credentials to .env to go live. See README.md.';
  }catch(err){
    statusBadge.classList.add('err');
    statusText.textContent = 'Signal fetch failed';
    rows.innerHTML = `<tr><td colspan="6" class="mono">Error: ${err.message}</td></tr>`;
  }
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
