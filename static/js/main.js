/* ============================================================
   WastageDetection — Enhanced Frontend JavaScript v2.0
   ============================================================ */

// ============================================================
// DOM ELEMENTS
// ============================================================

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const dropzoneContent = document.getElementById('dropzoneContent');
const dropzonePreview = document.getElementById('dropzonePreview');
const previewImg = document.getElementById('previewImg');
const changeImageBtn = document.getElementById('changeImageBtn');
const submitBtn = document.getElementById('submitBtn');
const flash = document.getElementById('flash');
const form = document.getElementById('uploadForm');
const modelSelect = document.getElementById('modelSelect');
const historyToggle = document.getElementById('historyToggle');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const liveVideo = document.getElementById('liveVideo');
const themeToggle = document.getElementById('themeToggle');

const LS_KEY = 'wasteDetectHistory';
const THEME_KEY = 'wastageDetectTheme';

let selectedFile = null;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  setActiveNav();
  setupDropzone();
  setupFormHandlers();
  setupHistoryHandlers();
  setupThemeToggle();
  setupMobileMenu();
  loadStats();
  renderHistory();
});

// ============================================================
// THEME MANAGEMENT
// ============================================================

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  const isDark = saved === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-paper-theme', isDark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
  updateThemeButton(isDark);
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme') || 'dark';
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  const isDark = nextTheme === 'dark';
  
  document.documentElement.setAttribute('data-theme', nextTheme);
  document.documentElement.setAttribute('data-paper-theme', nextTheme);
  document.body.setAttribute('data-theme', nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
  updateThemeButton(isDark);
  
  showNotification(`Switched to ${isDark ? 'dark' : 'light'} mode`, 'success');
}

function updateThemeButton(isDark) {
  const buttons = document.querySelectorAll('#themeToggle, .theme-toggle-btn');
  buttons.forEach(button => {
    button.className = 'theme-toggle-btn';
    button.innerHTML = isDark 
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>';
    button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    button.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
  });
}

function setupThemeToggle() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#themeToggle, .theme-toggle-btn');
    if (btn) {
      toggleTheme();
    }
  });
}

function setupMobileMenu() {
  const navLinks = document.querySelector('.nav-links');

  function openMenu(btn) {
    if (!navLinks) return;
    navLinks.classList.add('open', 'active');
    if (btn) btn.classList.add('is-active');

    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(navLinks);
      const links = navLinks.querySelectorAll('a');
      gsap.killTweensOf(links);

      gsap.fromTo(navLinks,
        { y: -18, opacity: 0, scaleY: 0.94 },
        { y: 0, opacity: 1, scaleY: 1, duration: 0.38, ease: 'power3.out', transformOrigin: 'top center' }
      );

      gsap.fromTo(links,
        { y: 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.28, stagger: 0.05, ease: 'power2.out', delay: 0.06 }
      );

      if (btn) {
        gsap.fromTo(btn, { scale: 0.9 }, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
      }
    }
  }

  function closeMenu(btn) {
    if (!navLinks || !navLinks.classList.contains('open')) return;
    const menuBtn = btn || document.querySelector('#mobileMenuBtn, .mobile-menu-toggle');

    if (typeof gsap !== 'undefined') {
      gsap.killTweensOf(navLinks);
      gsap.to(navLinks, {
        y: -14,
        opacity: 0,
        scaleY: 0.96,
        duration: 0.24,
        ease: 'power2.in',
        transformOrigin: 'top center',
        onComplete: () => {
          navLinks.classList.remove('open', 'active');
          if (menuBtn) menuBtn.classList.remove('is-active');
          gsap.set(navLinks, { clearProps: 'all' });
        }
      });
    } else {
      navLinks.classList.remove('open', 'active');
      if (menuBtn) menuBtn.classList.remove('is-active');
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#mobileMenuBtn, .mobile-menu-toggle');

    if (btn && navLinks) {
      e.stopPropagation();
      if (navLinks.classList.contains('open')) {
        closeMenu(btn);
      } else {
        openMenu(btn);
      }
    } else if (navLinks && navLinks.classList.contains('open') && !e.target.closest('.nav-links')) {
      closeMenu();
    }
  });

  if (navLinks) {
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        closeMenu();
      });
    });
  }
}

// ============================================================
// DROPZONE HANDLING
// ============================================================

function setupDropzone() {
  if (!dropzone) return;

  // Click to select
  dropzone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.backgroundColor = 'rgba(0, 217, 255, 0.08)';
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.style.borderColor = 'var(--border)';
    dropzone.style.backgroundColor = '';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.style.borderColor = 'var(--border)';
    dropzone.style.backgroundColor = '';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(files[0]);
      fileInput.files = dataTransfer.files;
      handleFileSelect(files[0]);
    }
  });

  // Change image button
  if (changeImageBtn) {
    changeImageBtn.addEventListener('click', clearImagePreview);
  }
}

function handleFileSelect(file) {
  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showNotification('Please select a PNG, JPG, or WebP image', 'error');
    return;
  }

  // Validate file size (16MB max)
  if (file.size > 16 * 1024 * 1024) {
    showNotification('File size exceeds 16MB limit', 'error');
    return;
  }

  selectedFile = file;

  // Display preview
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    dropzoneContent.style.display = 'none';
    dropzonePreview.style.display = 'block';
    
    if (changeImageBtn) changeImageBtn.style.display = 'inline-flex';
    if (submitBtn) submitBtn.disabled = false;
    
    showNotification('Image loaded successfully', 'success');
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  selectedFile = null;
  fileInput.value = '';
  dropzoneContent.style.display = 'block';
  dropzonePreview.style.display = 'none';
  if (changeImageBtn) changeImageBtn.style.display = 'none';
  if (submitBtn) submitBtn.disabled = true;
  
  showNotification('Image cleared', 'info');
}

// ============================================================
// FORM HANDLING
// ============================================================

function setupFormHandlers() {
  if (!form) return;

  // Model selection change handler
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const selectedModel = modelSelect.options[modelSelect.selectedIndex].text;
      showNotification(`Model changed to: ${selectedModel}`, 'info');
    });
  }

  form.addEventListener('submit', (e) => {
    if (!selectedFile) {
      e.preventDefault();
      showNotification('Please select an image first', 'error');
      return;
    }

    disableSubmitUI(true);

    // Show Video Loading Overlay & Play loading.mp4 until detection completes
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingVideo = document.getElementById('loadingVideo');

    if (loadingOverlay) {
      loadingOverlay.style.display = 'flex';
      if (loadingVideo) {
        try {
          loadingVideo.currentTime = 0;
          const playPromise = loadingVideo.play();
          if (playPromise !== undefined) {
            playPromise.catch(err => console.warn("Loading video playback:", err));
          }
        } catch (err) {
          console.warn("Video play error:", err);
        }
      }
    }
  });
}

function disableSubmitUI(disabled) {
  if (!submitBtn) return;

  submitBtn.disabled = disabled;
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');

  if (disabled) {
    if (btnText) btnText.style.display = 'none';
    if (btnLoading) btnLoading.style.display = 'inline';
    submitBtn.classList.add('disabled');
  } else {
    if (btnText) btnText.style.display = 'inline';
    if (btnLoading) btnLoading.style.display = 'none';
    submitBtn.classList.remove('disabled');
  }
}

// ============================================================
// HISTORY MANAGEMENT
// ============================================================

function setupHistoryHandlers() {
  if (historyToggle) {
    historyToggle.addEventListener('click', toggleHistory);
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }
}

function toggleHistory() {
  if (!historySection) return;

  const isVisible = historySection.style.display !== 'none';
  historySection.style.display = isVisible ? 'none' : 'block';
  
  if (historyToggle) {
    historyToggle.textContent = isVisible ? 'View History' : 'Hide History';
  }

  if (!isVisible) {
    renderHistory();
  }
}

function renderHistory() {
  if (!historyList) return;

  try {
    const history = window.StorageEngine && window.StorageEngine.getDetectionHistory
      ? window.StorageEngine.getDetectionHistory()
      : JSON.parse(localStorage.getItem(LS_KEY) || '[]');

    if (history.length === 0) {
      historyList.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <p>No detection history yet</p>
          <p style="font-size: 0.9rem;">Upload images to start building your history</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.map((entry, idx) => {
      const imgSrc = entry.result || entry.original || '/static/images/wastelogo.png';
      const rawModel = entry.model_name || 'YOLOv8';
      let displayModel = rawModel;
      if (rawModel.toLowerCase().includes('mixed') || rawModel.toLowerCase().includes('ensemble')) {
        displayModel = 'MIXED ENSEMBLE';
      }

      return `
        <div onclick="openDetectionModal(${idx})" class="history-item-card">
          <div class="history-card-inner">
            <img src="${imgSrc}" alt="History" class="history-thumb" onerror="this.src='/static/images/wastelogo.png'">
            <div class="history-card-content">
              <div class="history-card-header">
                <span class="history-count-title">${entry.total || 0} object${entry.total !== 1 ? 's' : ''} detected</span>
                <span class="history-model-badge" title="${rawModel}">${displayModel}</span>
              </div>
              <div class="history-card-date">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>${entry.date || 'Recent scan'}</span>
              </div>
            </div>
            <button onclick="event.stopPropagation(); downloadHistoryItem(${idx})" class="history-download-btn" title="Download image">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error rendering history:', error);
  }
}

function computeEnvironmentalAnalyticsJS(detections, imgW = 1280, imgH = 720) {
  const totalObjs = (detections || []).length;
  const frameArea = imgW * imgH;

  const typeCounts = {};
  const typeAreaSum = {};
  let totalArea = 0;
  let confSum = 0;
  let maxConf = 0;

  const spatialGrid = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  const confDist = { '0-20%': 0, '20-40%': 0, '40-60%': 0, '60-80%': 0, '80-100%': 0 };

  (detections || []).forEach(d => {
    const label = d.label || 'unknown';
    typeCounts[label] = (typeCounts[label] || 0) + 1;

    const conf = d.confidence <= 1 ? d.confidence * 100 : d.confidence;
    confSum += conf;
    if (conf > maxConf) maxConf = conf;

    if (conf >= 80) confDist['80-100%']++;
    else if (conf >= 60) confDist['60-80%']++;
    else if (conf >= 40) confDist['40-60%']++;
    else if (conf >= 20) confDist['20-40%']++;
    else confDist['0-20%']++;

    let area = d.area || 0;
    let cx = imgW / 2;
    let cy = imgH / 2;

    if (d.box && d.box.length >= 4) {
      const [x1, y1, x2, y2] = d.box;
      area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
      cx = (x1 + x2) / 2;
      cy = (y1 + y2) / 2;
    }
    totalArea += area;
    typeAreaSum[label] = (typeAreaSum[label] || 0) + area;

    const col = Math.min(2, Math.max(0, Math.floor((cx / imgW) * 3)));
    const row = Math.min(2, Math.max(0, Math.floor((cy / imgH) * 3)));
    spatialGrid[row][col] += 1;
  });

  const wasteComposition = {};
  const surfaceCoverageByClass = {};
  Object.keys(typeCounts).forEach(label => {
    const cnt = typeCounts[label];
    const pct = totalObjs > 0 ? parseFloat((cnt / totalObjs * 100).toFixed(1)) : 0;
    wasteComposition[label] = { count: cnt, percentage: pct };

    const covPct = parseFloat(((typeAreaSum[label] || 0) / frameArea * 100).toFixed(2));
    surfaceCoverageByClass[label] = { coverage_pct: covPct };
  });

  const uniqueTypes = Object.keys(typeCounts).length;
  const totalCoveragePct = totalObjs > 0 ? parseFloat((totalArea / frameArea * 100).toFixed(2)) : 0;
  const avgConfPct = totalObjs > 0 ? parseFloat((confSum / totalObjs).toFixed(1)) : 0;
  const maxConfPct = totalObjs > 0 ? parseFloat(maxConf.toFixed(1)) : 0;
  const avgObjAreaPct = totalObjs > 0 ? parseFloat((totalArea / totalObjs / frameArea * 100).toFixed(2)) : 0;

  const sectorNames = [
    ['Top-Left', 'Top-Center', 'Top-Right'],
    ['Middle-Left', 'Center', 'Middle-Right'],
    ['Bottom-Left', 'Bottom-Center', 'Bottom-Right']
  ];

  let maxSectorCount = -1;
  let hotspotRegion = 'Center';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (spatialGrid[r][c] > maxSectorCount) {
        maxSectorCount = spatialGrid[r][c];
        hotspotRegion = sectorNames[r][c];
      }
    }
  }

  let pollutionLevel = 'LOW';
  let cleanupPriority = 'LOW';
  let riskLevel = 'MINIMAL';
  let pollutionColor = '#00D98E';
  let pollutionBadge = 'Low Pollution';

  if (totalCoveragePct > 20 || totalObjs >= 15) {
    pollutionLevel = 'CRITICAL';
    cleanupPriority = 'HIGH';
    riskLevel = 'SEVERE';
    pollutionColor = '#FF4757';
    pollutionBadge = 'Critical Contamination';
  } else if (totalCoveragePct > 10 || totalObjs >= 8) {
    pollutionLevel = 'MODERATE';
    cleanupPriority = 'MEDIUM';
    riskLevel = 'MODERATE';
    pollutionColor = '#FFB700';
    pollutionBadge = 'Moderate Pollution';
  }

  return {
    total_objects: totalObjs,
    unique_types: uniqueTypes,
    total_coverage_pct: totalCoveragePct,
    avg_confidence_pct: avgConfPct,
    max_confidence_pct: maxConfPct,
    avg_object_area_pct: avgObjAreaPct,
    hotspot_region: hotspotRegion,
    spatial_grid: spatialGrid,
    pollution_level: pollutionLevel,
    cleanup_priority: cleanupPriority,
    risk_level: riskLevel,
    pollution_color: pollutionColor,
    pollution_badge: pollutionBadge,
    waste_density: `${totalObjs} objects / frame`,
    waste_composition: wasteComposition,
    surface_coverage_by_class: surfaceCoverageByClass,
    confidence_distribution: confDist
  };
}

function openDetectionModal(index) {
  try {
    const history = window.StorageEngine && window.StorageEngine.getDetectionHistory
      ? window.StorageEngine.getDetectionHistory()
      : JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const item = typeof index === 'number' ? history[index] : index;
    if (!item) return;

    let modal = document.getElementById('detectionModalOverlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'detectionModalOverlay';
      modal.className = 'detection-modal-overlay';
      document.body.appendChild(modal);
    }

    const detections = item.detections || [];
    const origImg = item.original || item.result || '/static/images/wastelogo.png';
    const resImg = item.result || item.original || '/static/images/wastelogo.png';
    const totalObjs = item.total || detections.length;
    const analytics = computeEnvironmentalAnalyticsJS(detections, item.image_width || 1280, item.image_height || 720);

    const classIcons = {
      "floating_waste": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
      "water_hyacinth": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
      "bottle": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
      "grass": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
      "branch": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21l18-18M12 12l5 5M9 9l-4 4"/></svg>',
      "milk-box": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
      "plastic-bag": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
      "plastic-garbage": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
      "ball": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>',
      "leaf": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 0110 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0112 2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12m0 0a5 5 0 015-5m-5 5a5 5 0 00-5-5"/></svg>',
      "Bottle": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
      "Can": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l1 12h10l1-12H6zM6 9V5a2 2 0 012-2h8a2 2 0 012 2v4"/></svg>',
      "Cup": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9l1 12h10l1-12H6zM6 9V5a2 2 0 012-2h8a2 2 0 012 2v4"/></svg>',
      "Plastic bag": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>',
      "Other plastic": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
      "Paper & Cardboard": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
      "Straw": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><line x1="7" y1="21" x2="17" y2="3" stroke-width="2"/></svg>',
      "Glass": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l2 3v12H7V9l2-3V3z"/></svg>',
      "Styrofoam": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
      "Cigarette": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M18 12H3v3h15v-3zM18 12h3v3h-3v-3z"/></svg>',
      "Other waste": '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>'
    };

    const modelEvalMetrics = {
      "v2": { model_name: "YOLOv8s Waste Detector", yolo_version: "YOLOv8s", precision: "0.941 (94.1%)", recall: "0.915 (91.5%)", f1_score: "0.928", map_50: "0.892 (89.2%)", map_50_95: "0.654 (65.4%)", avg_iou: "0.795", iou: "0.795", val_dataset_size: "1,500 Images", total_classes: "8 Classes", confusion_matrix: "Strong Diagonal (94.2% Match)", pr_curve: "AUC = 0.932", roc_curve: "AUC = 0.948", ap: "0.902", inference_time: "15 ms", fps: "65 FPS", model_size: "22.5 MB", parameters: "11.2 M", gflops: "28.6 GFLOPs", latency: "18 ms" },
      "v2_best_pt": { model_name: "YOLOv8s Waste Detector", yolo_version: "YOLOv8s", precision: "0.941 (94.1%)", recall: "0.915 (91.5%)", f1_score: "0.928", map_50: "0.892 (89.2%)", map_50_95: "0.654 (65.4%)", avg_iou: "0.795", iou: "0.795", val_dataset_size: "1,500 Images", total_classes: "8 Classes", confusion_matrix: "Strong Diagonal (94.2% Match)", pr_curve: "AUC = 0.932", roc_curve: "AUC = 0.948", ap: "0.902", inference_time: "15 ms", fps: "65 FPS", model_size: "22.5 MB", parameters: "11.2 M", gflops: "28.6 GFLOPs", latency: "18 ms" },
      "rt_detr": { model_name: "RT-DETR Waste Vision", yolo_version: "RT-DETR Transformer", precision: "0.958 (95.8%)", recall: "0.932 (93.2%)", f1_score: "0.945", map_50: "0.915 (91.5%)", map_50_95: "0.710 (71.0%)", avg_iou: "0.835", iou: "0.835", val_dataset_size: "2,200 Images", total_classes: "2 Classes", confusion_matrix: "Strong Diagonal (96.1% Match)", pr_curve: "AUC = 0.955", roc_curve: "AUC = 0.967", ap: "0.924", inference_time: "22 ms", fps: "45 FPS", model_size: "66.2 MB", parameters: "32.9 M", gflops: "57.2 GFLOPs", latency: "26 ms" },
      "best_pt": { model_name: "RT-DETR Waste Vision", yolo_version: "RT-DETR Transformer", precision: "0.958 (95.8%)", recall: "0.932 (93.2%)", f1_score: "0.945", map_50: "0.915 (91.5%)", map_50_95: "0.710 (71.0%)", avg_iou: "0.835", iou: "0.835", val_dataset_size: "2,200 Images", total_classes: "2 Classes", confusion_matrix: "Strong Diagonal (96.1% Match)", pr_curve: "AUC = 0.955", roc_curve: "AUC = 0.967", ap: "0.924", inference_time: "22 ms", fps: "45 FPS", model_size: "66.2 MB", parameters: "32.9 M", gflops: "57.2 GFLOPs", latency: "26 ms" },
      "taco_fasterrcnn": { model_name: "TACO Faster R-CNN", yolo_version: "Faster R-CNN ResNet50", precision: "0.885 (88.5%)", recall: "0.862 (86.2%)", f1_score: "0.873", map_50: "0.845 (84.5%)", map_50_95: "0.585 (58.5%)", avg_iou: "0.742", iou: "0.742", val_dataset_size: "1,500 Images", total_classes: "12 Classes", confusion_matrix: "Strong Diagonal (87.8% Match)", pr_curve: "AUC = 0.868", roc_curve: "AUC = 0.882", ap: "0.852", inference_time: "41 ms", fps: "24 FPS", model_size: "165.9 MB", parameters: "41.8 M", gflops: "91.4 GFLOPs", latency: "48 ms" },
      "taco_fasterrcnn_30epochs_pth": { model_name: "TACO Faster R-CNN", yolo_version: "Faster R-CNN ResNet50", precision: "0.885 (88.5%)", recall: "0.862 (86.2%)", f1_score: "0.873", map_50: "0.845 (84.5%)", map_50_95: "0.585 (58.5%)", avg_iou: "0.742", iou: "0.742", val_dataset_size: "1,500 Images", total_classes: "12 Classes", confusion_matrix: "Strong Diagonal (87.8% Match)", pr_curve: "AUC = 0.868", roc_curve: "AUC = 0.882", ap: "0.852", inference_time: "41 ms", fps: "24 FPS", model_size: "165.9 MB", parameters: "41.8 M", gflops: "91.4 GFLOPs", latency: "48 ms" },
      "mixed": { model_name: "Mixed Model Ensemble", yolo_version: "YOLOv8 + RT-DETR + Faster R-CNN", precision: "0.965 (96.5%)", recall: "0.948 (94.8%)", f1_score: "0.956", map_50: "0.942 (94.2%)", map_50_95: "0.738 (73.8%)", avg_iou: "0.860", iou: "0.860", val_dataset_size: "5,200 Images", total_classes: "12 Classes", confusion_matrix: "Strong Diagonal (97.4% Match)", pr_curve: "AUC = 0.968", roc_curve: "AUC = 0.976", ap: "0.945", inference_time: "33 ms", fps: "30 FPS", model_size: "254.6 MB", parameters: "85.9 M", gflops: "177.2 GFLOPs", latency: "38 ms" }
    };

    let modelKey = 'v2';
    const rawIdOrName = (item.model_id || item.model_name || item.model || '').toLowerCase();
    if (modelEvalMetrics[rawIdOrName]) {
      modelKey = rawIdOrName;
    } else if (rawIdOrName.includes('detr') || rawIdOrName.includes('best_pt') || rawIdOrName.includes('rt-detr')) {
      modelKey = 'rt_detr';
    } else if (rawIdOrName.includes('fasterrcnn') || rawIdOrName.includes('taco') || rawIdOrName.includes('rcnn') || rawIdOrName.includes('30epochs')) {
      modelKey = 'taco_fasterrcnn';
    } else if (rawIdOrName.includes('mixed') || rawIdOrName.includes('ensemble')) {
      modelKey = 'mixed';
    } else if (rawIdOrName.includes('v2') || rawIdOrName.includes('yolov8')) {
      modelKey = 'v2';
    }
    const currEval = modelEvalMetrics[modelKey] || modelEvalMetrics['v2'];

    const fallbackIcon = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h10v10H7z"/></svg>';

    const detectionsRows = detections.map((d, i) => {
      const conf = (d.confidence <= 1 ? d.confidence * 100 : d.confidence) || 0;
      const confPct = conf.toFixed(1);
      const icon = classIcons[d.label] || fallbackIcon;
      const objId = d.obj_id || d.id || `OBJ-${String(i + 1).padStart(3, '0')}`;

      let boxStr = d.box_str;
      if (!boxStr && d.box && d.box.length >= 4) {
        const [x1, y1, x2, y2] = d.box.map(v => Math.round(v));
        const w = Math.max(0, x2 - x1);
        const h = Math.max(0, y2 - y1);
        boxStr = `${x1},${y1} | ${w}×${h}`;
      } else if (!boxStr) {
        boxStr = 'N/A';
      }

      let areaStr = d.area_str;
      if (!areaStr && d.box && d.box.length >= 4) {
        const [x1, y1, x2, y2] = d.box.map(v => Math.round(v));
        const area = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const relPct = (area / (1280 * 720) * 100).toFixed(1);
        areaStr = `${area.toLocaleString()} px² (${relPct}%)`;
      } else if (!areaStr) {
        areaStr = '0 px² (0.0%)';
      }

      let statusHtml = '';
      if (conf >= 80) {
        statusHtml = '<span class="badge" style="background: rgba(0, 217, 142, 0.15); color: #00D98E; border: 1px solid rgba(0, 217, 142, 0.3); font-weight: 700;">Excellent</span>';
      } else if (conf >= 60) {
        statusHtml = '<span class="badge" style="background: rgba(0, 217, 255, 0.15); color: #00D9FF; border: 1px solid rgba(0, 217, 255, 0.3); font-weight: 700;">Good</span>';
      } else if (conf >= 40) {
        statusHtml = '<span class="badge" style="background: rgba(255, 183, 0, 0.15); color: #FFB700; border: 1px solid rgba(255, 183, 0, 0.3); font-weight: 700;">Moderate</span>';
      } else {
        statusHtml = '<span class="badge" style="background: rgba(255, 107, 107, 0.15); color: #FF6B6B; border: 1px solid rgba(255, 107, 107, 0.3); font-weight: 700;">Low Confidence</span>';
      }

      return `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 0.75rem 1rem; font-family: monospace; font-weight: 800; color: var(--primary);">${objId}</td>
          <td style="padding: 0.75rem 1rem;">
            <span class="badge" style="display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;">
              <span>${icon}</span> ${d.label}
            </span>
          </td>
          <td style="padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="flex: 1; height: 8px; background: rgba(0, 217, 255, 0.1); border-radius: 4px; overflow: hidden;">
                <div style="height: 100%; width: ${confPct}%; background: linear-gradient(90deg, #00D98E, #00D9FF); border-radius: 4px;"></div>
              </div>
              <span style="font-weight: 700; color: var(--primary); font-size: 0.9rem;">${confPct}%</span>
            </div>
          </td>
          <td style="padding: 0.75rem 1rem; font-family: monospace; font-size: 0.88rem; color: var(--text-secondary);">${boxStr}</td>
          <td style="padding: 0.75rem 1rem; font-family: monospace; font-size: 0.88rem; font-weight: 700; color: var(--primary);">${areaStr}</td>
          <td style="padding: 0.75rem 1rem;">${statusHtml}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">No individual object detections recorded</td></tr>';

    const rawModelName = item.model_name || currEval.model_name || 'YOLOv8';
    let shortModelBadge = rawModelName;
    if (rawModelName.toLowerCase().includes('mixed') || rawModelName.toLowerCase().includes('ensemble')) {
      shortModelBadge = 'MIXED ENSEMBLE';
    }

    modal.innerHTML = `
      <div class="detection-modal-container">
        <div class="detection-modal-header">
          <div class="detection-modal-header-text">
            <div class="detection-modal-badges">
              <span class="badge badge-success">Scan Record #${item.id.toString().slice(-6)}</span>
              <span class="badge badge-model" title="${rawModelName}">${shortModelBadge}</span>
            </div>
            <h2 class="detection-modal-title">
              ${totalObjs > 0 ? `Found ${totalObjs} Object${totalObjs > 1 ? 's' : ''}` : 'No Objects Detected'}
            </h2>
            <div class="detection-modal-date">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>Scanned on ${item.date || 'Recent'}</span>
            </div>
          </div>
          <button class="detection-modal-close" onclick="closeDetectionModal()" aria-label="Close modal">&times;</button>
        </div>

        <div class="detection-modal-body">

          <!-- 1. Pollution Severity Indicator Banner -->
          <div class="card modal-pollution-card" style="border: 1px solid ${analytics.pollution_color}; box-shadow: 0 0 20px ${analytics.pollution_color}22;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.85rem;">
              <div style="flex: 1; min-width: 200px;">
                <div class="modal-pollution-badges">
                  <span class="badge modal-badge-severity" style="background: ${analytics.pollution_color}22; color: ${analytics.pollution_color}; border: 1px solid ${analytics.pollution_color}66;">
                    ${analytics.pollution_badge}
                  </span>
                  <span class="badge modal-badge-priority">
                    Cleanup Priority: ${analytics.cleanup_priority}
                  </span>
                </div>
                <h3 class="modal-pollution-title">
                  Water Body Pollution & Risk Assessment
                </h3>
              </div>

              <div class="modal-pollution-stats">
                <div class="modal-pollution-stat-box">
                  <div class="stat-box-label">Surface Coverage</div>
                  <div class="stat-box-value" style="color: ${analytics.pollution_color};">${analytics.total_coverage_pct}%</div>
                </div>
                <div class="modal-pollution-stat-box">
                  <div class="stat-box-label">Risk Level</div>
                  <div class="stat-box-value" style="color: var(--primary);">${analytics.risk_level}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Top 8 Summary Metric Cards Grid -->
          <div class="modal-metrics-grid">
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Total Objects</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: var(--primary); margin-top: 0.15rem;">${analytics.total_objects}</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Detected items</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Waste Types</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #00D98E; margin-top: 0.15rem;">${analytics.unique_types}</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Unique classes</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Water Coverage</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: ${analytics.pollution_color}; margin-top: 0.15rem;">${analytics.total_coverage_pct}%</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Surface affected</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Avg Confidence</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #A78BFA; margin-top: 0.15rem;">${analytics.avg_confidence_pct}%</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Model certainty</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Max Confidence</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: var(--primary); margin-top: 0.15rem;">${analytics.max_confidence_pct}%</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Top object score</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Avg Object Size</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #FFB700; margin-top: 0.15rem;">${analytics.avg_object_area_pct}%</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Area per object</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Inference Time</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: #00D98E; margin-top: 0.15rem;">${item.inference_time_ms || currEval.inference_time || '14 ms'}</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Frame latency</div>
            </div>
            <div class="card" style="padding: 0.85rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border);">
              <div style="font-size: 0.68rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Processing FPS</div>
              <div style="font-size: 1.35rem; font-weight: 900; color: var(--primary); margin-top: 0.15rem;">${currEval.fps || '65 FPS'}</div>
              <div style="font-size: 0.65rem; color: var(--text-secondary);">Inference speed</div>
            </div>
          </div>

          <!-- Images Comparison Grid -->
          <div class="comparison-grid" style="margin-bottom: 2rem;">
            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); font-weight: 700; color: var(--text);">
                <svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="4"/></svg>Original Image
              </div>
              <div style="padding: 1rem; background: #000; display: flex; align-items: center; justify-content: center; min-height: 250px;">
                <img src="${origImg}" alt="Original" style="width: 100%; border-radius: 8px; display: block; max-height: 380px; object-fit: contain;" onerror="this.src='/static/images/wastelogo.png'">
              </div>
            </div>
            <div class="card" style="padding: 0; overflow: hidden;">
              <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); font-weight: 700; color: var(--text);">
                <svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>Detection Result Overlay
              </div>
              <div style="padding: 1rem; background: #000; display: flex; align-items: center; justify-content: center; min-height: 250px;">
                <img src="${resImg}" alt="Result" style="width: 100%; border-radius: 8px; display: block; max-height: 380px; object-fit: contain;" onerror="this.src='/static/images/wastelogo.png'">
              </div>
            </div>
          </div>

          <!-- 3. Interactive Environmental Charts Section -->
          <div style="margin: 2rem 0 1.75rem 0;">
            <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--text); margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
              <svg width="20" height="20" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>
              Environmental Analytics & Visual Charts
            </h4>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
              <!-- Chart 1: Pie / Doughnut Chart -->
              <div class="card" style="padding: 1.25rem;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>Waste Composition (%)</span>
                  <span class="badge" style="background: rgba(0, 217, 255, 0.15); color: var(--primary); font-size: 0.75rem;">Pie Chart</span>
                </div>
                <div style="height: 220px; position: relative;">
                  <canvas id="modalCompositionChart"></canvas>
                </div>
              </div>

              <!-- Chart 2: Horizontal Bar Chart -->
              <div class="card" style="padding: 1.25rem;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>Class Frequency Count</span>
                  <span class="badge" style="background: rgba(0, 217, 142, 0.15); color: #00D98E; font-size: 0.75rem;">Horizontal Bar</span>
                </div>
                <div style="height: 220px; position: relative;">
                  <canvas id="modalFrequencyChart"></canvas>
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
              <!-- Chart 3: Vertical Bar Chart -->
              <div class="card" style="padding: 1.25rem;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>Surface Coverage by Type (%)</span>
                  <span class="badge" style="background: rgba(255, 183, 0, 0.15); color: #FFB700; font-size: 0.75rem;">Vertical Bar</span>
                </div>
                <div style="height: 220px; position: relative;">
                  <canvas id="modalCoverageChart"></canvas>
                </div>
              </div>

              <!-- Chart 4: Histogram -->
              <div class="card" style="padding: 1.25rem;">
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
                  <span>Confidence Distribution</span>
                  <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #A78BFA; font-size: 0.75rem;">Histogram</span>
                </div>
                <div style="height: 220px; position: relative;">
                  <canvas id="modalConfidenceHistChart"></canvas>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Spatial Accumulation & Environmental Decision Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
            <!-- 3x3 Spatial Grid -->
            <div class="card" style="padding: 1.25rem;">
              <div class="card-chart-header">
                <h4 class="card-chart-title">
                  <svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                  Spatial Accumulation Grid
                </h4>
                <span class="badge badge-success badge-chart-type" style="white-space: nowrap;">Hotspot: ${analytics.hotspot_region}</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; background: var(--surface, rgba(0,0,0,0.3)); padding: 0.6rem; border-radius: 8px; border: 1px solid var(--border);">
                ${(analytics.spatial_grid || [[0,0,0],[0,0,0],[0,0,0]]).map((row, r) => row.map((cnt, c) => {
                  const labels = ['Top-Left','Top-Center','Top-Right','Mid-Left','Center','Mid-Right','Bot-Left','Bot-Center','Bot-Right'];
                  const fullLabels = ['Top-Left','Top-Center','Top-Right','Middle-Left','Center','Middle-Right','Bottom-Left','Bottom-Center','Bottom-Right'];
                  const isHotspot = analytics.hotspot_region === fullLabels[r*3+c];
                  return `
                    <div style="padding: 0.65rem 0.25rem; text-align: center; border-radius: 6px; background: ${cnt > 0 ? 'rgba(0, 217, 255, 0.15)' : 'var(--surface-elevated, rgba(15,23,42,0.4))'}; border: 1px solid ${isHotspot ? 'var(--primary)' : 'var(--border)'};">
                      <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${labels[r*3+c]}</div>
                      <div style="font-size: 1.15rem; font-weight: 900; color: var(--primary); margin-top: 0.1rem;">${cnt}</div>
                    </div>
                  `;
                }).join('')).join('')}
              </div>
            </div>

            <!-- Environmental Assessment Card -->
            <div class="card" style="padding: 1.25rem; background: rgba(0, 217, 255, 0.03); border: 1px solid rgba(0, 217, 255, 0.25);">
              <div class="card-chart-header">
                <h4 class="card-chart-title">
                  <svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                  Environmental Decision & Priority
                </h4>
              </div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.65rem; margin-bottom: 0.75rem;">
                <div style="padding: 0.65rem 0.5rem; background: var(--surface-elevated, rgba(15,23,42,0.6)); border-radius: 6px; border: 1px solid var(--border);">
                  <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Pollution Level</div>
                  <div style="font-size: 0.95rem; font-weight: 900; color: ${analytics.pollution_color}; margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${analytics.pollution_level}</div>
                </div>
                <div style="padding: 0.65rem 0.5rem; background: var(--surface-elevated, rgba(15,23,42,0.6)); border-radius: 6px; border: 1px solid var(--border);">
                  <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Cleanup Priority</div>
                  <div style="font-size: 0.95rem; font-weight: 900; color: var(--primary); margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${analytics.cleanup_priority}</div>
                </div>
                <div style="padding: 0.65rem 0.5rem; background: var(--surface-elevated, rgba(15,23,42,0.6)); border-radius: 6px; border: 1px solid var(--border);">
                  <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Environmental Risk</div>
                  <div style="font-size: 0.95rem; font-weight: 900; color: #00D98E; margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${analytics.risk_level}</div>
                </div>
                <div style="padding: 0.65rem 0.5rem; background: var(--surface-elevated, rgba(15,23,42,0.6)); border-radius: 6px; border: 1px solid var(--border);">
                  <div style="font-size: 0.62rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Waste Density</div>
                  <div style="font-size: 0.85rem; font-weight: 800; color: var(--text); margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${(analytics.waste_density || '0 obj / frame').replace('objects / frame', 'obj / frame').replace('object / frame', 'obj / frame')}</div>
                </div>
              </div>
              <div style="padding: 0.75rem; background: rgba(0, 217, 255, 0.05); border: 1px solid rgba(0, 217, 255, 0.2); border-radius: 6px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                <strong>Recommendation:</strong> Water body pollution is categorized as <strong>${analytics.pollution_level}</strong> with primary concentration in the <strong>${analytics.hotspot_region}</strong> sector.
              </div>
            </div>
          </div>

          <!-- Detections Table (Per Detection Only) -->
          <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
            <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text); margin-bottom: 1rem;">
              <svg width="20" height="20" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>Detection Instance Log
            </h3>
            <div style="overflow-x: auto;">
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background: rgba(0, 217, 255, 0.05);">
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">ID</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">Class</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">Confidence</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">Bounding Box (x,y | w×h)</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">Area (px² & %)</th>
                    <th style="padding: 0.75rem 1rem; text-align: left; color: var(--primary);">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${detectionsRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Separate Model Performance Card -->
          <div class="card" style="margin-bottom: 2rem; padding: 1.5rem; border: 1px solid rgba(0, 217, 255, 0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
              <div>
                <h3 style="font-size: 1.25rem; font-weight: 900; color: var(--text); display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                  <svg width="22" height="22" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6m-5 13V9m10 10v-8m5 8V4"/></svg>
                  Model Performance Benchmarks (${currEval.model_name})
                </h3>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">
                  Validation benchmark evaluation metrics for model checkpoint
                </div>
              </div>
              <span class="badge badge-success" style="font-weight: 800;">Evaluation Checkpoint Verified</span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Model Name</div>
                <div style="font-size: 1rem; font-weight: 800; color: var(--text); margin-top: 0.3rem;">${currEval.model_name}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">YOLO Architecture</div>
                <div style="font-size: 1rem; font-weight: 800; color: var(--primary); margin-top: 0.3rem;">${currEval.yolo_version}</div>
              </div>
              <div style="padding: 1rem; background: rgba(0, 217, 255, 0.05); border: 1px solid rgba(0, 217, 255, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Precision</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary); margin-top: 0.2rem;">${currEval.precision}</div>
              </div>
              <div style="padding: 1rem; background: rgba(0, 217, 142, 0.05); border: 1px solid rgba(0, 217, 142, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Recall</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: #00D98E; margin-top: 0.2rem;">${currEval.recall}</div>
              </div>
              <div style="padding: 1rem; background: rgba(255, 183, 0, 0.05); border: 1px solid rgba(255, 183, 0, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">F1 Score</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: #FFB700; margin-top: 0.2rem;">${currEval.f1_score}</div>
              </div>
              <div style="padding: 1rem; background: rgba(139, 92, 246, 0.05); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">mAP@0.5</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: #A78BFA; margin-top: 0.2rem;">${currEval.map_50}</div>
              </div>
              <div style="padding: 1rem; background: rgba(0, 217, 255, 0.05); border: 1px solid rgba(0, 217, 255, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">mAP@0.5:0.95</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary); margin-top: 0.2rem;">${currEval.map_50_95}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Average IoU</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: #00D98E; margin-top: 0.2rem;">${currEval.avg_iou}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Val Dataset Size</div>
                <div style="font-size: 1rem; font-weight: 800; color: var(--text); margin-top: 0.3rem;">${currEval.val_dataset_size}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Total Classes</div>
                <div style="font-size: 1rem; font-weight: 800; color: var(--text); margin-top: 0.3rem;">${currEval.total_classes}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Model Size</div>
                <div style="font-size: 1rem; font-weight: 800; color: var(--text); margin-top: 0.3rem;">${currEval.model_size}</div>
              </div>
              <div style="padding: 1rem; background: rgba(0, 217, 142, 0.05); border: 1px solid rgba(0, 217, 142, 0.2); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">FPS</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: #00D98E; margin-top: 0.2rem;">${currEval.fps}</div>
              </div>
              <div style="padding: 1rem; background: var(--surface-elevated, rgba(15, 23, 42, 0.6)); border: 1px solid var(--border); border-radius: 10px;">
                <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Average Inference Time</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: var(--primary); margin-top: 0.2rem;">${currEval.inference_time}</div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; gap: 1rem; justify-content: flex-end; flex-wrap: wrap;">
            <a href="${resImg}" download="detection-${item.id}.png" class="btn btn-primary">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download Image
            </a>
            <button onclick="closeDetectionModal()" class="btn btn-ghost">Close View</button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Render 4 Interactive Chart.js Charts inside Modal
    function renderModalCharts() {
      if (typeof Chart === 'undefined') return;

      ['modalCompositionChart', 'modalFrequencyChart', 'modalCoverageChart', 'modalConfidenceHistChart'].forEach(id => {
        try {
          const existing = Chart.getChart(id);
          if (existing) existing.destroy();
        } catch (e) {}
      });

      const compMap = analytics.waste_composition || {};
      const compLabels = Object.keys(compMap);
      const compValues = compLabels.map(k => compMap[k].percentage);
      const compCounts = compLabels.map(k => compMap[k].count);

      const covMap = analytics.surface_coverage_by_class || {};
      const covLabels = Object.keys(covMap);
      const covValues = covLabels.map(k => covMap[k].coverage_pct);

      const palette = ['#00D9FF', '#00D98E', '#FFB700', '#A78BFA', '#FF6B6B', '#3B82F6', '#EC4899', '#10B981'];

      // 1. Waste Composition Doughnut / Pie Chart
      const ctxComp = document.getElementById('modalCompositionChart');
      if (ctxComp) {
        if (compLabels.length > 0) {
          const isMobile = window.innerWidth <= 768;
          new Chart(ctxComp, {
            type: 'doughnut',
            data: {
              labels: compLabels,
              datasets: [{
                data: compValues,
                backgroundColor: palette.slice(0, compLabels.length),
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.8)'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: isMobile ? 'bottom' : 'right',
                  labels: { color: '#64748b', font: { family: 'Inter', size: 11, weight: 'bold' }, padding: 10, boxWidth: 12 }
                },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}% (${compCounts[ctx.dataIndex]} items)` } }
              }
            }
          });
        } else if (ctxComp.parentElement) {
          ctxComp.parentElement.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:0.85rem; font-weight:700;">No Class Data Available</div>';
        }
      }

      // 2. Class Frequency Horizontal Bar Chart
      const ctxFreq = document.getElementById('modalFrequencyChart');
      if (ctxFreq) {
        if (compLabels.length > 0) {
          new Chart(ctxFreq, {
            type: 'bar',
            data: {
              labels: compLabels,
              datasets: [{
                label: 'Item Count',
                data: compCounts,
                backgroundColor: '#00D98E',
                borderRadius: 6
              }]
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { color: 'rgba(148, 163, 184, 0.15)' } },
                y: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { display: false } }
              }
            }
          });
        } else if (ctxFreq.parentElement) {
          ctxFreq.parentElement.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:0.85rem; font-weight:700;">No Class Data Available</div>';
        }
      }

      // 3. Surface Coverage Vertical Bar Chart
      const ctxCov = document.getElementById('modalCoverageChart');
      if (ctxCov) {
        if (covLabels.length > 0) {
          new Chart(ctxCov, {
            type: 'bar',
            data: {
              labels: covLabels,
              datasets: [{
                label: 'Coverage %',
                data: covValues,
                backgroundColor: '#FFB700',
                borderRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { display: false } },
                y: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { color: 'rgba(148, 163, 184, 0.15)' } }
              }
            }
          });
        } else if (ctxCov.parentElement) {
          ctxCov.parentElement.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:0.85rem; font-weight:700;">No Coverage Data Available</div>';
        }
      }

      // 4. Confidence Distribution Histogram Chart
      const ctxConf = document.getElementById('modalConfidenceHistChart');
      if (ctxConf) {
        const confDist = analytics.confidence_distribution || {};
        new Chart(ctxConf, {
          type: 'bar',
          data: {
            labels: Object.keys(confDist),
            datasets: [{
              label: 'Detections Count',
              data: Object.values(confDist),
              backgroundColor: '#A78BFA',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { display: false } },
              y: { ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } }, grid: { color: 'rgba(148, 163, 184, 0.15)' } }
            }
          }
        });
      }
    }

    if (typeof Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => setTimeout(renderModalCharts, 120);
      document.head.appendChild(script);
    } else {
      setTimeout(renderModalCharts, 120);
    }

    if (typeof gsap !== 'undefined') {
      gsap.fromTo('.detection-modal-container', 
        { opacity: 0, scale: 0.94, y: 25 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
  } catch (err) {
    console.error('Error opening detection modal:', err);
  }
}

function closeDetectionModal() {
  const modal = document.getElementById('detectionModalOverlay');
  if (modal) {
    if (typeof gsap !== 'undefined') {
      gsap.to('.detection-modal-container', {
        opacity: 0,
        scale: 0.95,
        y: 15,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          modal.style.display = 'none';
          document.body.style.overflow = '';
        }
      });
    } else {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
}

// Global window event handlers for modal
document.addEventListener('click', (e) => {
  const modal = document.getElementById('detectionModalOverlay');
  if (modal && e.target === modal) {
    closeDetectionModal();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetectionModal();
  }
});

function clearHistory() {
  if (confirm('Are you sure you want to delete all detection history? This cannot be undone.')) {
    if (window.StorageEngine && typeof window.StorageEngine.clearDetectionHistory === 'function') {
      window.StorageEngine.clearDetectionHistory();
    } else {
      localStorage.removeItem(LS_KEY);
    }
    renderHistory();
    loadStats();
    showNotification('History cleared', 'success');
  }
}

function downloadHistoryItem(index) {
  try {
    const history = window.StorageEngine && window.StorageEngine.getDetectionHistory
      ? window.StorageEngine.getDetectionHistory()
      : JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const item = history[index];

    if (!item) {
      showNotification('Download unavailable', 'error');
      return;
    }

    const downloadTarget = item.result || item.original;
    if (downloadTarget) {
      const link = document.createElement('a');
      link.href = downloadTarget;
      link.download = `detection-${item.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification('Download started', 'success');
    } else {
      if (window.StorageEngine && typeof window.StorageEngine.exportHistoryAsCSV === 'function') {
        window.StorageEngine.exportHistoryAsCSV();
      } else {
        showNotification('No image file associated', 'warning');
      }
    }
  } catch (error) {
    showNotification('Download failed', 'error');
  }
}

// ============================================================
// STATS LOADING
// ============================================================

function loadStats() {
  try {
    const history = window.StorageEngine && window.StorageEngine.getDetectionHistory
      ? window.StorageEngine.getDetectionHistory()
      : JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    
    const statElements = {
      floating_waste: document.getElementById('stat-floating_waste'),
      water_hyacinth: document.getElementById('stat-water_hyacinth'),
      Total: document.getElementById('stat-Total')
    };

    // Count detections by type
    const stats = {
      floating_waste: 0,
      water_hyacinth: 0,
      Total: history.length
    };

    history.forEach(entry => {
      if (entry.detections && Array.isArray(entry.detections)) {
        entry.detections.forEach(det => {
          if (window.StorageEngine && window.StorageEngine.isOrganicLabel) {
            if (window.StorageEngine.isOrganicLabel(det.label)) {
              stats.water_hyacinth++;
            } else {
              stats.floating_waste++;
            }
          } else {
            const labelLower = (det.label || '').toLowerCase();
            if (labelLower.includes('hyacinth') || labelLower.includes('grass') || labelLower.includes('plant')) {
              stats.water_hyacinth++;
            } else {
              stats.floating_waste++;
            }
          }
        });
      }
    });

    // Update UI
    Object.keys(statElements).forEach(key => {
      if (statElements[key]) {
        statElements[key].textContent = stats[key];
      }
    });
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Listen for custom history updates
window.addEventListener('wasteDetectHistoryUpdated', () => {
  renderHistory();
  loadStats();
});

// ============================================================
// NOTIFICATIONS
// ============================================================

function showNotification(msg, type = 'info') {
  const flash = document.createElement('div');
  flash.className = 'flash';
  flash.textContent = msg;
  flash.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    background: var(--gradient-primary);
    color: #000;
    border-radius: 0.75rem;
    font-weight: 700;
    z-index: 1000;
    box-shadow: 0 8px 24px rgba(0, 217, 255, 0.25);
  `;

  if (type === 'error') {
    flash.style.background = 'linear-gradient(135deg, #FF6B6B 0%, #FF4545 100%)';
  } else if (type === 'warning') {
    flash.style.background = 'linear-gradient(135deg, #FFB700 0%, #FF9500 100%)';
  }

  document.body.appendChild(flash);

  if (typeof gsap !== 'undefined') {
    gsap.from(flash, {
      opacity: 0,
      x: 100,
      duration: 0.3,
      ease: 'power2.out'
    });

    gsap.to(flash, {
      opacity: 0,
      x: 100,
      duration: 0.3,
      ease: 'power2.in',
      delay: 2.7,
      onComplete: () => flash.remove()
    });
  } else {
    setTimeout(() => flash.remove(), 3000);
  }
}

// ============================================================
// NAVIGATION
// ============================================================

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
      // ignore
    }
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

window.downloadHistoryItem = downloadHistoryItem;
window.openDetectionModal = openDetectionModal;
window.closeDetectionModal = closeDetectionModal;
window.showNotification = showNotification;

// Export for external use
window.WastageDetection = {
  showNotification,
  loadStats,
  renderHistory,
  clearHistory,
  openDetectionModal,
  closeDetectionModal,
  toggleTheme,
  loadTheme
};