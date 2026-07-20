/* ============================================================
   Waste Detection Dashboard — Frontend JS
   localStorage history + stats + theme + live camera + charts
   ============================================================ */

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const dropzoneContent = document.getElementById("dropzoneContent");
const dropzonePreview = document.getElementById("dropzonePreview");
const previewImg = document.getElementById("previewImg");
const changeImageBtn = document.getElementById("changeImageBtn");
const submitBtn = document.getElementById("submitBtn");
const flash = document.getElementById("flash");
const form = document.getElementById("uploadForm");
const historyToggle = document.getElementById("historyToggle");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const liveVideo = document.getElementById('liveVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const liveModelSelect = document.getElementById('liveModelSelect');
const modelSelect = document.getElementById('modelSelect');

const statEls = {};
["floating_waste", "water_hyacinth", "Total"].forEach(k => {
  const el = document.getElementById("stat-" + k);
  if (el) statEls[k] = el;
});

const LS_KEY = "wasteDetectHistory";
const THEME_KEY = "wastageDetectTheme";
let liveStream = null;
let liveInterval = null;
let liveFrameCount = 0;
let liveLastFpsTime = Date.now();

function setActiveNav() {
  const links = document.querySelectorAll('.nav-link');
  if (!links || links.length === 0) return;
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  links.forEach(a => {
    try {
      const url = new URL(a.href);
      const path = url.pathname.replace(/\/$/, '') || '/';
      a.classList.toggle('active', path === current);
    } catch (e) {
      // ignore invalid URLs
    }
  });
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  const lightMode = saved === 'light';
  document.documentElement.setAttribute('data-theme', lightMode ? 'light' : 'dark');
  document.body.classList.toggle('light-mode', lightMode);
  document.body.setAttribute('data-theme', lightMode ? 'light' : 'dark');
  const button = document.getElementById('themeToggle');
  if (button) {
    button.textContent = lightMode ? '🌞' : '🌙';
    button.setAttribute('aria-pressed', lightMode ? 'true' : 'false');
  }
  return lightMode;
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme') || 'dark';
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  const isLight = nextTheme === 'light';
  
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.body.classList.toggle('light-mode', isLight);
  document.body.setAttribute('data-theme', nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
  
  const button = document.getElementById('themeToggle');
  if (button) {
    button.textContent = isLight ? '🌞' : '🌙';
    button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  }
  return isLight;
}

function showFlash(msg) {
  if (!flash) {
    console.warn(msg);
    return;
  }
  flash.textContent = msg;
  flash.style.display = 'block';
  setTimeout(() => { flash.style.display = 'none'; }, 4000);
}

function disableSubmitUI() {
  const s1 = document.getElementById('submitBtn');
  const s2 = document.getElementById('submitBtnInline');
  [s1, s2].forEach(b => {
    if (b) {
      b.disabled = true;
      b.classList.add('disabled');
    }
  });
  const bt = s1 ? s1.querySelector('.btn-text') : null;
  const bl = s1 ? s1.querySelector('.btn-loading') : null;
  if (bt) bt.style.display = 'none';
  if (bl) bl.style.display = 'inline-flex';
}

function enableSubmitUI() {
  const s1 = document.getElementById('submitBtn');
  const s2 = document.getElementById('submitBtnInline');
  [s1, s2].forEach(b => {
    if (b) {
      b.disabled = false;
      b.classList.remove('disabled');
    }
  });
  const bt = s1 ? s1.querySelector('.btn-text') : null;
  const bl = s1 ? s1.querySelector('.btn-loading') : null;
  if (bt) bt.style.display = 'inline-flex';
  if (bl) bl.style.display = 'none';
}

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    dropzoneContent.style.display = 'none';
    dropzonePreview.style.display = 'block';
    if (submitBtn) submitBtn.disabled = false;
  };
  reader.readAsDataURL(file);
}

function resetDropzone() {
  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (dropzoneContent) dropzoneContent.style.display = 'block';
  if (dropzonePreview) dropzonePreview.style.display = 'none';
  if (submitBtn) submitBtn.disabled = true;
}

if (dropzone && fileInput) {
  dropzone.addEventListener('click', () => fileInput.click());
}

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) showPreview(file);
  });
}

if (changeImageBtn) {
  changeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetDropzone();
  });
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fileInput && (!fileInput.files || fileInput.files.length === 0)) {
      showFlash('Please select an image to upload.');
      return;
    }

    disableSubmitUI();
    const action = form.getAttribute('action') || '/predict';
    const method = (form.getAttribute('method') || 'POST').toUpperCase();
    const fd = new FormData(form);
    if (modelSelect) fd.set('model', modelSelect.value);

    try {
      const res = await fetch(action, { method, body: fd });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        showFlash(data.error || 'Server error');
        enableSubmitUI();
        return;
      }
      const html = await res.text();
      document.open();
      document.write(html);
      document.close();
    } catch (err) {
      showFlash('Upload failed: ' + (err.message || err));
      enableSubmitUI();
    }
  });
}

(function saveResultToHistory() {
  const hero = document.querySelector('.result-hero h1');
  if (!hero) return;

  const rows = document.querySelectorAll('tbody tr');
  const detections = [];
  rows.forEach(row => {
    const tds = row.querySelectorAll('td');
    if (tds.length >= 3) {
      detections.push({
        label: tds[1].textContent.trim(),
        confidence: parseFloat(tds[2].textContent) || 0
      });
    }
  });

  const imgs = document.querySelectorAll('.img-card img');
  const original = imgs[0] ? imgs[0].src : '';
  const result = imgs[1] ? imgs[1].src : '';

  if (!original) return;

  const entry = {
    id: Date.now(),
    date: new Date().toLocaleString(),
    original,
    result,
    detections,
    total: detections.length
  };

  let history = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  history.unshift(entry);
  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem(LS_KEY, JSON.stringify(history));
})();

function renderHistory() {
  if (!historyList) return;
  const history = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  if (history.length === 0) {
    historyList.innerHTML = '<p class="history-empty">No detections yet. Upload an image to start!</p>';
    return;
  }
  historyList.innerHTML = history.map(item => `
    <div class="history-item" data-id="${item.id}">
      <img src="${item.result || item.original}" alt="Result" loading="lazy">
      <div class="history-info">
        <div class="h-date">${item.date}</div>
        <div class="h-dets">${item.total} object${item.total !== 1 ? 's' : ''} detected</div>
      </div>
    </div>
  `).join('');
}

if (historyToggle && historySection) {
  historyToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const shown = historySection.style.display !== 'none';
    historySection.style.display = shown ? 'none' : 'block';
    if (!shown) renderHistory();
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem(LS_KEY);
    renderHistory();
    updateStats();
  });
}

function updateStats() {
  const history = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const counts = { floating_waste: 0, water_hyacinth: 0 };
  let total = 0;

  history.forEach(entry => {
    (entry.detections || []).forEach(d => {
      const label = d.label;
      if (counts[label] !== undefined) counts[label]++;
      total++;
    });
  });

  Object.keys(counts).forEach(k => {
    if (statEls[k]) statEls[k].textContent = counts[k];
  });
  if (statEls['Total']) statEls['Total'].textContent = total;
}

function initModelSelect() {
  if (!modelSelect) return;
  modelSelect.addEventListener('change', () => {
    showFlash(`Model set to ${modelSelect.options[modelSelect.selectedIndex].text}`);
  });
}

function initThemeToggle() {
  const button = document.getElementById('themeToggle');
  if (!button) return;
  loadTheme();
  button.addEventListener('click', () => {
    toggleTheme();
  });
}

function initLiveDetection() {
  if (!liveVideo || !overlayCanvas) return;
  const startBtn = document.getElementById('startCam');
  const pauseBtn = document.getElementById('pauseCam');
  const captureBtn = document.getElementById('captureBtn');
  const detectionsList = document.getElementById('detectionsList');
  const fpsVal = document.getElementById('fpsVal');
  const totalDetections = document.getElementById('totalDetections');
  const avgFps = document.getElementById('avgFps');
  const sessionTime = document.getElementById('sessionTime');

  const resizeOverlay = () => {
    overlayCanvas.width = liveVideo.clientWidth;
    overlayCanvas.height = liveVideo.clientHeight;
  };

  window.addEventListener('resize', resizeOverlay);
  liveVideo.addEventListener('loadedmetadata', resizeOverlay);

  startBtn && startBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      liveVideo.srcObject = stream;
      liveStream = stream;
      await liveVideo.play();
      resizeOverlay();
      startLiveLoop();
      showFlash('Live detection started.');
    } catch (err) {
      showFlash('Unable to access camera: ' + err.message);
    }
  });

  pauseBtn && pauseBtn.addEventListener('click', () => {
    if (!liveStream) return;
    liveStream.getTracks().forEach(track => track.stop());
    liveStream = null;
    if (liveInterval) clearInterval(liveInterval);
    liveInterval = null;
    showFlash('Live detection stopped.');
  });

  captureBtn && captureBtn.addEventListener('click', () => {
    if (!liveVideo || liveVideo.readyState < 2) return;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = liveVideo.videoWidth;
    captureCanvas.height = liveVideo.videoHeight;
    captureCanvas.getContext('2d').drawImage(liveVideo, 0, 0);
    const link = document.createElement('a');
    link.href = captureCanvas.toDataURL('image/png');
    link.download = `wastage_live_${Date.now()}.png`;
    link.click();
    showFlash('Snapshot saved.');
  });

  async function captureFrame() {
    if (!liveVideo || liveVideo.readyState < 2) return;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = liveVideo.videoWidth;
    captureCanvas.height = liveVideo.videoHeight;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(liveVideo, 0, 0, captureCanvas.width, captureCanvas.height);
    const blob = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob) return;

    const payload = new FormData();
    payload.append('frame', blob, 'frame.jpg');
    if (liveModelSelect) payload.append('model', liveModelSelect.value);

    try {
      const response = await fetch('/api/live-predict', { method: 'POST', body: payload });
      const data = await response.json();
      if (data.error) {
        showFlash(data.error);
        return;
      }
      drawOverlay(data);
      renderLiveResults(data);
      refreshFps();
      updateSessionTime();
    } catch (err) {
      showFlash('Live analysis failed: ' + err.message);
    }
  }

  function drawOverlay(data) {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!data || !data.detections) return;
    const xScale = overlayCanvas.width / data.width;
    const yScale = overlayCanvas.height / data.height;

    data.detections.forEach(det => {
      const [x1, y1, x2, y2] = det.box;
      const color = getColorForLabel(det.label);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1 * xScale, y1 * yScale, (x2 - x1) * xScale, (y2 - y1) * yScale);
      const text = `${det.label} ${(det.confidence * 100).toFixed(1)}%`;
      ctx.fillStyle = color;
      ctx.font = '700 14px Inter, sans-serif';
      const textWidth = ctx.measureText(text).width + 16;
      const textHeight = 22;
      const textX = Math.max(x1 * xScale, 8);
      const textY = Math.max(y1 * yScale - textHeight - 6, 8);
      ctx.fillRect(textX, textY, textWidth, textHeight);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(text, textX + 8, textY + 16);
    });
  }

  function renderLiveResults(data) {
    if (!detectionsList) return;
    if (!data || !data.detections || data.detections.length === 0) {
      detectionsList.innerHTML = '<p class="muted" style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">No detections found in the latest frame.</p>';
      return;
    }
    detectionsList.innerHTML = data.detections.map(det => `
      <div class="detection-item">
        <div class="detection-label">${det.label}</div>
        <div class="detection-confidence">Confidence: ${(det.confidence * 100).toFixed(1)}%</div>
      </div>
    `).join('');
    if (totalDetections) totalDetections.textContent = data.detections.length;
  }

  function refreshFps() {
    liveFrameCount += 1;
    const now = Date.now();
    const elapsed = (now - liveLastFpsTime) / 1000;
    if (elapsed >= 1) {
      const fps = Math.round(liveFrameCount / elapsed);
      if (fpsVal) fpsVal.textContent = fps;
      if (avgFps) avgFps.textContent = fps;
      liveFrameCount = 0;
      liveLastFpsTime = now;
    }
  }

  function updateSessionTime() {
    if (!sessionTime || !liveStream) return;
    const elapsed = Math.floor((Date.now() - liveLastFpsTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    sessionTime.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function startLiveLoop() {
    if (liveInterval) clearInterval(liveInterval);
    liveInterval = setInterval(captureFrame, 1000);
    liveLastFpsTime = Date.now();
  }
}

function getColorForLabel(label) {
  const palette = {
    'plastic': '#f59e0b',
    'plastic_waste': '#22c55e',
    'water_hyacinth': '#06b6d4',
    'floating_waste': '#38bdf8',
    'bottle': '#7c3aed',
    'grass': '#22c55e',
    'branch': '#f97316',
    'milk-box': '#a78bfa',
    'plastic-bag': '#fb7185',
    'plastic-garbage': '#67e8f9',
    'ball': '#facc15',
    'leaf': '#4ade80',
    'other': '#cbd5e1'
  };
  return palette[label.toLowerCase()] || '#10b981';
}

function buildHistoryDataset() {
  const history = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const categories = {};
  const daily = {};
  const monthly = {};
  history.forEach(entry => {
    const date = new Date(entry.date);
    if (!isNaN(date)) {
      const dayKey = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      daily[dayKey] = (daily[dayKey] || 0) + entry.total;
      const monthKey = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      monthly[monthKey] = (monthly[monthKey] || 0) + entry.total;
    }
    (entry.detections || []).forEach(d => {
      categories[d.label] = (categories[d.label] || 0) + 1;
    });
  });
  return { categories, daily, monthly };
}

function renderChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return null;
  return new Chart(canvas, config);
}

function initAnalyticsCharts() {
  if (typeof Chart === 'undefined') return;
  const data = buildHistoryDataset();
  const labels = Object.keys(data.categories);
  const values = labels.map(label => data.categories[label]);
  if (document.getElementById('pieChart')) {
    renderChart('pieChart', {
      type: 'pie',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#10b981', '#38bdf8', '#f59e0b', '#fb7185', '#a855f7'] }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  if (document.getElementById('lineChart')) {
    const lineLabels = Object.keys(data.daily);
    const lineData = lineLabels.map(key => data.daily[key]);
    renderChart('lineChart', {
      type: 'line',
      data: { labels: lineLabels, datasets: [{ label: 'Detections', data: lineData, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.18)', fill: true, tension: 0.35, pointRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
  if (document.getElementById('areaChart')) {
    const monthlyLabels = Object.keys(data.monthly);
    const monthlyData = monthlyLabels.map(key => data.monthly[key]);
    renderChart('areaChart', {
      type: 'bar',
      data: { labels: monthlyLabels, datasets: [{ label: 'Monthly Detections', data: monthlyData, backgroundColor: '#22d3ee', borderRadius: 12 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

function initDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  const data = buildHistoryDataset();
  const labels = Object.keys(data.categories);
  const values = labels.map(label => data.categories[label]);
  if (document.getElementById('dashboardPieChart')) {
    renderChart('dashboardPieChart', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: ['#38bdf8', '#10b981', '#f59e0b', '#818cf8', '#fb7185'] }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }
  if (document.getElementById('dashboardBarChart')) {
    const barLabels = Object.keys(data.daily);
    const barData = barLabels.map(key => data.daily[key]);
    renderChart('dashboardBarChart', {
      type: 'bar',
      data: { labels: barLabels, datasets: [{ label: 'Recent Detections', data: barData, backgroundColor: '#0ea5e9', borderRadius: 10 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

function initCameraControls() {
  initLiveDetection();
}

document.addEventListener('DOMContentLoaded', () => {
  renderHistory();
  updateStats();
  initModelSelect();
  setActiveNav();
  initThemeToggle();
  initCameraControls();
  initAnalyticsCharts();
  initDashboardCharts();
  fetchDashboardData();
  setTimeout(() => {
    initParticles();
    animateHeroCounters();
  }, 300);
});

function animateHeroCounters() {
  if (typeof gsap === 'undefined') return;
  const els = document.querySelectorAll('.stat-value');
  els.forEach(el => {
    const target = parseInt(el.getAttribute('data-target') || el.textContent || '0', 10);
    gsap.fromTo(el, { innerText: 0 }, { innerText: target, duration: 1.6, ease: 'power2.out', snap: { innerText: 1 }, onUpdate() { el.textContent = Math.round(el.innerText); } });
  });
}

/* ==========================
   Dashboard data + rendering
   ========================== */
async function fetchDashboardData() {
  try {
    const res = await fetch('/api/dashboard-data');
    if (!res.ok) throw new Error('No dashboard data');
    const data = await res.json();
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.getAttribute('data-key');
      if (key && data[key] !== undefined) {
        el.textContent = data[key];
      }
    });
    renderBarsWeek(data.week || []);
    renderClassesList(data.top_classes || []);
    renderRateChart(data.rate || {});
    renderTrendsChart(data.trends || {});
    if (data.percentiles) {
      const el = document.getElementById('confPercentiles');
      if (el) el.textContent = data.percentiles.join(' · ');
    }
    if (data.latency !== undefined) document.querySelector('[data-key="latency"]').textContent = data.latency + ' ms';
    if (data.dets_per_frame !== undefined) document.querySelector('[data-key="dets_per_frame"]').textContent = data.dets_per_frame;
  } catch (err) {
    console.info('Dashboard data not available; using local history if present.');
    const dataset = buildHistoryDataset();
    if (Object.keys(dataset.daily).length > 0) {
      const total = Object.values(dataset.daily).reduce((a,b)=>a+b,0);
      const classesCount = Object.keys(dataset.categories).length;
      const totalWeekEl = document.querySelector('.detections-big');
      if (totalWeekEl) totalWeekEl.textContent = total;
      const totalTodayEl = document.querySelector('[data-key="total_today"]');
      if (totalTodayEl) totalTodayEl.textContent = total;
      const classesCountEl = document.querySelector('[data-key="classes_count"]');
      if (classesCountEl) classesCountEl.textContent = classesCount || '—';
      renderBarsWeekFromLocal(dataset.daily);
      renderClassesListFromLocal(dataset.categories);
    }
  }
}

function renderBarsWeek(weekArray) {
  const container = document.getElementById('barsWeek');
  if (!container) return;
  container.innerHTML = '';
  if (!weekArray || weekArray.length === 0) {
    for (let i=0;i<7;i++) container.innerHTML += '<div class="bar skeleton" style="flex:1"></div>';
    return;
  }
  weekArray.forEach(item => {
    const total = (item.waste || 0) + (item.organic || 0) || 1;
    const wastePct = ((item.waste || 0) / total) * 100;
    const organicPct = 100 - wastePct;
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.background = `linear-gradient(180deg, ${getCssColor('--moss')} 0%, ${getCssColor('--moss')} ${organicPct}%, ${getCssColor('--alert-coral')} ${organicPct}%, ${getCssColor('--alert-coral')} 100%)`;
    bar.style.height = Math.max(18, Math.min(120, total)) + 'px';
    container.appendChild(bar);
  });
}

function renderBarsWeekFromLocal(dailyObj) {
  const labels = Object.keys(dailyObj).slice(-7);
  const arr = labels.map(k=>({day:k, waste: Math.round(dailyObj[k]*0.6), organic: Math.round(dailyObj[k]*0.4)}));
  renderBarsWeek(arr);
}

function renderClassesList(classes) {
  const el = document.getElementById('classesList');
  if (!el) return;
  el.innerHTML = '';
  if (!classes || classes.length === 0) {
    el.innerHTML = '<p class="muted">No classes detected yet.</p>';
    return;
  }
  classes.forEach(c => {
    const row = document.createElement('div'); row.className='class-row';
    row.innerHTML = `<div class="class-left"><div class="class-icon">${c.icon || ''}</div><div class="class-name">${c.name}</div></div><div class="class-count">${c.count}</div>`;
    el.appendChild(row);
  });
}

function renderClassesListFromLocal(categories) {
  const pairs = Object.keys(categories).map(k=>({name:k,count:categories[k]})).sort((a,b)=>b.count-a.count).slice(0,8);
  renderClassesList(pairs);
}

function getCssColor(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName) || varName; }

function renderRateChart(rate) {
  const canvas = document.getElementById('rateChart');
  if (!canvas || !rate || !rate.labels) return;
  const config = {
    type: 'bar',
    data: { labels: rate.labels, datasets: [
      { label: 'Waste', data: rate.waste || [], backgroundColor: getCssColor('--alert-coral') },
      { label: 'Organic', data: rate.organic || [], backgroundColor: getCssColor('--moss') }
    ] },
    options: { responsive:true, plugins:{ legend:{ position:'top' } }, scales:{ y:{ beginAtZero:true } } }
  };
  renderChart('rateChart', config);
}

let trendsChartInstance = null;
function renderTrendsChart(trends) {
  const ctx = document.getElementById('trendsChart');
  if (!ctx || !trends || !trends.labels) return;
  const config = {
    type: 'bar',
    data: { labels: trends.labels, datasets: [
      { type: 'bar', label: 'Detections', data: trends.counts || [], backgroundColor: getCssColor('--alert-coral'), borderRadius: 6 },
      { type: 'line', label: 'Avg Confidence', data: trends.confidence || [], borderColor: getCssColor('--driftline-gold'), backgroundColor: 'transparent', yAxisID: 'y1', tension:0.3 }
    ] },
    options: { responsive:true, plugins:{ datalabels: { display: false }, legend:{ display:false } }, scales: { y: { beginAtZero:true }, y1: { position:'right', grid:{ display:false }, min:0, max:1 } } }
  };
  if (trendsChartInstance) trendsChartInstance.destroy();
  trendsChartInstance = new Chart(ctx, config);
  document.querySelectorAll('.toggle').forEach(t=>{
    t.addEventListener('click', ()=>{
      const series = t.getAttribute('data-series');
      t.classList.toggle('active');
      const active = t.classList.contains('active');
      if (!trendsChartInstance) return;
      if (series === 'confidence') {
        trendsChartInstance.data.datasets[1].hidden = !active;
      } else if (series === 'waste') {
        trendsChartInstance.data.datasets[0].hidden = !active;
      }
      trendsChartInstance.update();
    });
  });
  const exp = document.getElementById('exportTrends');
  if (exp) exp.addEventListener('click', ()=>{
    const url = trendsChartInstance.toBase64Image();
    const a = document.createElement('a'); a.href = url; a.download = 'trends.png'; a.click();
  });
}

function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = canvas.offsetWidth;
  let h = canvas.height = canvas.offsetHeight;
  const particles = [];
  const count = Math.round((w * h) / 60000) + 40;
  for (let i = 0; i < count; i++) {
    particles.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2 + 0.8, vx: (Math.random() - 0.5) * 0.4, vy: - (Math.random() * 0.3 + 0.1), alpha: Math.random() * 0.5 + 0.2 });
  }
  window.addEventListener('resize', () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; });
  function draw() {
    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.08)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      ctx.beginPath();
      ctx.fillStyle = `rgba(16, 185, 129, ${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}
