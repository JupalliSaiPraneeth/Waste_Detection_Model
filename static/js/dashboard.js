/* ============================================================
   WastageDetection — Local Storage Dashboard Data Engine
   Dynamically calculates all metrics, weekly breakdown, trends,
   top classes, percentiles & insights from StorageEngine.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    function loadDashboardData() {
        const history = window.StorageEngine && window.StorageEngine.getDetectionHistory 
            ? window.StorageEngine.getDetectionHistory() 
            : JSON.parse(localStorage.getItem('wasteDetectHistory') || '[]');

        const isOrganic = window.StorageEngine && window.StorageEngine.isOrganicLabel 
            ? window.StorageEngine.isOrganicLabel 
            : (label => label && (label.toLowerCase().includes('hyacinth') || label.toLowerCase().includes('grass')));

        // ------------------------------------------------------------
        // 1. Calculate Metrics from Local Storage History
        // ------------------------------------------------------------
        const totalDetections = history.length;
        const allConfidences = [];
        let totalObjects = 0;
        const uniqueClasses = new Set();
        let todayDetections = 0;
        let todayScans = 0;
        let maxObjectsPerFrame = 0;

        const todayStr = new Date().toDateString();
        const classCounts = {};

        history.forEach(entry => {
            const entryDate = window.StorageEngine && window.StorageEngine.parseEntryDate
                ? window.StorageEngine.parseEntryDate(entry)
                : (entry.date ? new Date(entry.date) : new Date());
            
            const isToday = entryDate.toDateString() === todayStr;

            if (isToday) todayScans++;

            const entryObjects = entry.detections || [];
            if (entryObjects.length > maxObjectsPerFrame) {
                maxObjectsPerFrame = entryObjects.length;
            }

            entryObjects.forEach(d => {
                totalObjects++;
                const rawConf = d.confidence || 0;
                const confPct = rawConf <= 1 ? rawConf * 100 : rawConf;
                allConfidences.push(confPct);

                if (d.label) {
                    uniqueClasses.add(d.label);
                    classCounts[d.label] = (classCounts[d.label] || 0) + 1;
                }

                if (isToday) todayDetections++;
            });
        });

        const avgConf = allConfidences.length > 0 
            ? (allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) 
            : 0;

        // Update Top Pill Metrics
        const pillConfEl = document.getElementById('pill-confidence');
        const pillDetEl = document.getElementById('pill-detections');
        const pillClassEl = document.getElementById('pill-classes');

        if (pillConfEl) pillConfEl.textContent = avgConf > 0 ? avgConf.toFixed(1) : '0';
        if (pillDetEl) pillDetEl.textContent = todayDetections;
        if (pillClassEl) pillClassEl.textContent = uniqueClasses.size;

        // ------------------------------------------------------------
        // 2. Weekly Overview (Scans & Two-Tone Day Breakdown)
        // ------------------------------------------------------------
        const barsWeekEl = document.getElementById('barsWeek');
        const weeklyTotalSumEl = document.getElementById('weeklyTotalSum');
        const weeklyBarsContainer = document.getElementById('weeklyBarsContainer');

        if (weeklyBarsContainer) {
            const daysNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const daysFullNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const daysOrder = [1, 2, 3, 4, 5, 6, 0];

            let weeklyTotalSum = 0;
            const dayCounts = daysOrder.map((dayNum, index) => {
                let waste = 0;
                let organic = 0;
                history.forEach(entry => {
                    const eDate = window.StorageEngine && window.StorageEngine.parseEntryDate 
                        ? window.StorageEngine.parseEntryDate(entry) 
                        : (entry.date ? new Date(entry.date) : null);
                    if (eDate && eDate.getDay() === dayNum) {
                        (entry.detections || []).forEach(d => {
                            if (isOrganic(d.label)) organic++;
                            else waste++;
                        });
                    }
                });
                const total = waste + organic;
                weeklyTotalSum += total;
                return {
                    name: daysNames[index],
                    fullName: daysFullNames[index],
                    waste,
                    organic,
                    total
                };
            });

            if (barsWeekEl) {
                const avgPerDay = weeklyTotalSum > 0 ? (weeklyTotalSum / 7).toFixed(1) : '0';
                barsWeekEl.textContent = avgPerDay;
            }

            if (weeklyTotalSumEl) {
                weeklyTotalSumEl.textContent = weeklyTotalSum;
            }

            const maxDayTotal = Math.max(1, ...dayCounts.map(d => d.total));

            let barsHtml = '';
            dayCounts.forEach(d => {
                const totalHeightPct = d.total > 0 ? Math.max(16, Math.round((d.total / maxDayTotal) * 100)) : 0;
                const wasteFraction = d.total > 0 ? (d.waste / d.total) : 0;
                const organicFraction = d.total > 0 ? (d.organic / d.total) : 0;

                const wasteHeightPct = Math.round(totalHeightPct * wasteFraction);
                const organicHeightPct = Math.round(totalHeightPct * organicFraction);

                if (d.total === 0) {
                    barsHtml += `
                        <div class="weekly-bar-col" style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; position: relative;">
                            <div class="bar-pill-track" style="width: 100%; max-width: 38px; height: 125px; background: rgba(148, 163, 184, 0.05); border: 1px dashed rgba(148, 163, 184, 0.2); border-radius: 10px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px; transition: all 0.3s;" title="${d.fullName}: 0 items detected">
                                <span style="width: 12px; height: 3px; background: rgba(148, 163, 184, 0.3); border-radius: 2px;"></span>
                            </div>
                            <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-top: 0.6rem;">${d.name}</span>
                        </div>
                    `;
                } else {
                    barsHtml += `
                        <div class="weekly-bar-col" style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; position: relative;">
                            
                            <!-- Count Badge Top -->
                            <div class="bar-count-badge" style="margin-bottom: 5px;">
                                ${d.total}
                            </div>

                            <!-- Stacked Two-Tone Bar Column -->
                            <div class="bar-pill-track" style="width: 100%; max-width: 38px; height: 125px; background: rgba(0, 217, 255, 0.04); border-radius: 10px; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; padding: 2px; border: 1px solid rgba(0, 217, 255, 0.18); transition: all 0.3s ease;" 
                                 title="${d.fullName} | Total: ${d.total} (Waste: ${d.waste}, Organic: ${d.organic})">
                                
                                <!-- Waste Segment (Top) -->
                                ${d.waste > 0 ? `
                                <div class="bar-segment-waste" style="width: 100%; height: ${wasteHeightPct}%; border-radius: ${d.organic > 0 ? '6px 6px 2px 2px' : '6px'};"></div>
                                ` : ''}

                                <!-- Organic Segment (Bottom) -->
                                ${d.organic > 0 ? `
                                <div class="bar-segment-organic" style="width: 100%; height: ${organicHeightPct}%; border-radius: ${d.waste > 0 ? '2px 2px 6px 6px' : '6px'}; ${d.waste > 0 ? 'margin-top: 2px;' : ''}"></div>
                                ` : ''}

                            </div>

                            <!-- Day Label -->
                            <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); margin-top: 0.6rem;">${d.name}</span>
                        </div>
                    `;
                }
            });
            weeklyBarsContainer.innerHTML = barsHtml;
        }

        // ------------------------------------------------------------
        // 3. Top Detection Classes List
        // ------------------------------------------------------------
        const classesListEl = document.getElementById('classesList');
        if (classesListEl) {
            if (Object.keys(classCounts).length > 0) {
                const sortedClasses = Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

                // Category SVG Vector Icons (No Emojis!)
                const categoryMeta = {
                    'floating_waste': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#00D9FF" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 15C6 15 7 13 10 13C13 13 14 15 17 15C20 15 21 13 24 13M3 19C6 19 7 17 10 17C13 17 14 19 17 19C20 19 21 17 24 17M12 3V9M12 9L9 6M12 9L15 6"/></svg>`, 
                        name: 'Floating Waste', 
                        tag: 'Artificial Litter', 
                        grad: 'linear-gradient(90deg, #00D9FF 0%, #0088FF 100%)', 
                        glow: 'rgba(0, 217, 255, 0.4)', 
                        color: '#00D9FF' 
                    },
                    'water_hyacinth': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#00D98E" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2A9 9 0 0121 11C21 15.97 16.97 20 12 20A9 9 0 013 11C3 6.03 7.03 2 12 2Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 20V11M12 11L8 7M12 11L16 7"/></svg>`, 
                        name: 'Water Hyacinth', 
                        tag: 'Organic Flora', 
                        grad: 'linear-gradient(90deg, #00D98E 0%, #009966 100%)', 
                        glow: 'rgba(0, 217, 142, 0.4)', 
                        color: '#00D98E' 
                    },
                    'bottle': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#38BDF8" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 2H14V4H10V2ZM9 4H15V7L17 10V20A2 2 0 0115 22H9A2 2 0 017 20V10L9 7V4Z"/></svg>`, 
                        name: 'Plastic Bottle', 
                        tag: 'PET Recyclable', 
                        grad: 'linear-gradient(90deg, #38BDF8 0%, #0284C7 100%)', 
                        glow: 'rgba(56, 189, 248, 0.4)', 
                        color: '#38BDF8' 
                    },
                    'plastic-bag': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#C084FC" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7A4 4 0 008 0V11M5 9H19L20 21H4L5 9Z"/></svg>`, 
                        name: 'Plastic Bag', 
                        tag: 'Polymer Waste', 
                        grad: 'linear-gradient(90deg, #C084FC 0%, #9333EA 100%)', 
                        glow: 'rgba(192, 132, 252, 0.4)', 
                        color: '#C084FC' 
                    },
                    'plastic-garbage': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#A855F7" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7L18.13 19.142A2 2 0 0116.138 21H7.862A2 2 0 015.862 19.142L5 7M10 11V17M14 11V17M9 7V4A1 1 0 0110 3H14A1 1 0 0115 4V7M4 7H20"/></svg>`, 
                        name: 'Plastic Debris', 
                        tag: 'Inorganic Waste', 
                        grad: 'linear-gradient(90deg, #A855F7 0%, #7E22CE 100%)', 
                        glow: 'rgba(168, 85, 247, 0.4)', 
                        color: '#A855F7' 
                    },
                    'straw': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#FACC15" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8H18A2 2 0 0120 10V12A2 2 0 0118 14H17M3 8H17V19A2 2 0 0115 21H5A2 2 0 013 19V8ZM7 3L11 8"/></svg>`, 
                        name: 'Drinking Straw', 
                        tag: 'Single-Use Plastic', 
                        grad: 'linear-gradient(90deg, #FACC15 0%, #CA8A04 100%)', 
                        glow: 'rgba(250, 204, 21, 0.4)', 
                        color: '#FACC15' 
                    },
                    'branch': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#34D399" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22V12M12 12L6 6M12 12L18 6M12 17L8 13M12 17L16 13"/></svg>`, 
                        name: 'Tree Branch', 
                        tag: 'Organic Debris', 
                        grad: 'linear-gradient(90deg, #34D399 0%, #059669 100%)', 
                        glow: 'rgba(52, 211, 153, 0.4)', 
                        color: '#34D399' 
                    },
                    'can': { 
                        svg: `<svg width="18" height="18" fill="none" stroke="#F87171" stroke-width="2" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 5V19C5 20.66 8.13 22 12 22C15.87 22 19 20.66 19 19V5"/></svg>`, 
                        name: 'Metal Can', 
                        tag: 'Aluminum/Metal', 
                        grad: 'linear-gradient(90deg, #F87171 0%, #DC2626 100%)', 
                        glow: 'rgba(248, 113, 113, 0.4)', 
                        color: '#F87171' 
                    }
                };

                classesListEl.innerHTML = sortedClasses.map(([cls, count], idx) => {
                    const pct = Math.round((count / Math.max(1, totalObjects)) * 100);
                    const lKey = cls.toLowerCase();
                    const meta = categoryMeta[lKey] || {
                        svg: `<svg width="18" height="18" fill="none" stroke="var(--primary)" stroke-width="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>`,
                        name: cls,
                        tag: isOrganic(cls) ? 'Organic Matter' : 'Inorganic Waste',
                        grad: 'linear-gradient(90deg, #00D9FF 0%, #00D98E 100%)',
                        glow: 'rgba(0, 217, 255, 0.3)',
                        color: 'var(--primary)'
                    };

                    return `
                        <div class="class-item-row" style="display: flex; flex-direction: column; gap: 5px; background: rgba(0, 217, 255, 0.02); padding: 0.65rem 0.85rem; border-radius: 10px; border: 1px solid rgba(148, 163, 184, 0.12); transition: all 0.3s ease;">
                            
                            <!-- Header Row: SVG Category Icon, Name, Tag, Count & % -->
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
                                    <span style="display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: rgba(0, 217, 255, 0.06); border: 1px solid rgba(148, 163, 184, 0.15); flex-shrink: 0;">
                                        ${meta.svg}
                                    </span>
                                    <div style="display: flex; flex-direction: column; min-width: 0;">
                                        <span style="font-weight: 800; font-size: 0.88rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${meta.name}</span>
                                        <span style="font-size: 0.72rem; font-weight: 600; color: var(--text-muted);">${meta.tag}</span>
                                    </div>
                                </div>
                                <div style="text-align: right; flex-shrink: 0;">
                                    <span style="font-weight: 900; font-size: 0.95rem; color: ${meta.color};">${count}</span>
                                    <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-left: 2px;">(${pct}%)</span>
                                </div>
                            </div>

                            <!-- Progress Track & Fill Bar -->
                            <div style="height: 7px; background: rgba(148, 163, 184, 0.12); border-radius: 4px; overflow: hidden; margin-top: 2px;">
                                <div class="class-progress-fill" style="height: 100%; width: ${pct}%; background: ${meta.grad}; border-radius: 4px; box-shadow: 0 0 10px ${meta.glow}; transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
                            </div>
                        </div>
                    `;
                }).join('');

                // GSAP Stagger Entrance for Class Items
                if (typeof gsap !== 'undefined') {
                    gsap.fromTo('.class-item-row', 
                        { opacity: 0, x: -20 }, 
                        { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out' }
                    );
                }
            } else {
                classesListEl.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem;">
                        <p style="font-weight: 600; margin-bottom: 0.5rem;">No local detection data</p>
                        <p style="font-size: 0.85rem;">Upload an image on Home page or run Live Detection to record data.</p>
                    </div>
                `;
            }
        }

        // ------------------------------------------------------------
        // 4. Mini Stats (Latency, Dets / Frame, Confidence Percentiles)
        // ------------------------------------------------------------
        const latencyEl = document.getElementById('latency');
        const detsPerFrameEl = document.getElementById('dets_per_frame');
        const confPercentilesEl = document.getElementById('confPercentiles');

        if (latencyEl) latencyEl.textContent = totalDetections > 0 ? '38 ms' : '0 ms';

        if (detsPerFrameEl) {
            const avgDets = totalDetections > 0 ? (totalObjects / totalDetections).toFixed(1) : '0';
            detsPerFrameEl.textContent = `${avgDets}`;
        }

        if (confPercentilesEl) {
            if (allConfidences.length > 0) {
                const sorted = [...allConfidences].sort((a, b) => a - b);
                const p75 = sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1];
                const p90 = sorted[Math.floor(sorted.length * 0.90)] || sorted[sorted.length - 1];
                const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
                confPercentilesEl.textContent = `${Math.round(p75)} · ${Math.round(p90)} · ${Math.round(p95)}`;
            } else {
                confPercentilesEl.textContent = '0 · 0 · 0';
            }
        }

        // ------------------------------------------------------------
        // 5. System Rate Insights Text
        // ------------------------------------------------------------
        const rateInsightEl = document.getElementById('rateInsight');
        if (rateInsightEl) {
            if (totalDetections > 0) {
                const topClassEntry = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0];
                const topClassName = topClassEntry ? topClassEntry[0] : 'N/A';
                const topClassCount = topClassEntry ? topClassEntry[1] : 0;
                rateInsightEl.textContent = `Local storage contains ${totalDetections} scan records (${totalObjects} total objects across ${uniqueClasses.size} categories). Top class: "${topClassName}" (${topClassCount} items) with ${avgConf.toFixed(1)}% average confidence.`;
            } else {
                rateInsightEl.textContent = `No local detection records found. Use the detection tool to analyze images or video frames. Metrics will automatically display here.`;
            }
        }

        // ------------------------------------------------------------
        // 6. Interactive Trends Chart & Confidence Histogram
        // ------------------------------------------------------------
        initDashboardCharts(history, isOrganic);
    }

    // Initial render
    loadDashboardData();

    // Re-render automatically on local storage updates
    window.addEventListener('wasteDetectHistoryUpdated', () => {
        loadDashboardData();
    });

    // Re-render dynamically on theme changes (Light/Dark mode)
    const themeObserver = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.attributeName === 'data-theme') {
                loadDashboardData();
            }
        });
    });
    themeObserver.observe(document.documentElement, { attributes: true });
    themeObserver.observe(document.body, { attributes: true });
});


function initDashboardCharts(history, isOrganicLabel) {
    let trendsChartInstance = null;
    let rateChartInstance = null;

    const periodSelect = document.getElementById('trendPeriod');
    const seriesButtons = document.querySelectorAll('.card-trends .toggle');

    const activeSeries = {
        waste: true,
        organic: true,
        confidence: true
    };

    if (seriesButtons) {
        seriesButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const s = btn.getAttribute('data-series');
                if (s && activeSeries.hasOwnProperty(s)) {
                    activeSeries[s] = !activeSeries[s];
                    btn.classList.toggle('active', activeSeries[s]);
                    btn.style.opacity = activeSeries[s] ? '1' : '0.4';
                    updateTrendsChart();
                }
            });
        });
    }

    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            updateTrendsChart();
        });
    }

    function updateTrendsChart() {
        const periodDays = parseInt(periodSelect ? periodSelect.value : '7', 10) || 7;
        const labels = [];
        const wasteData = [];
        const organicData = [];
        const confData = [];

        const now = new Date();

        for (let i = periodDays - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(now.getDate() - i);
            const dateStr = d.toDateString();
            const labelStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            labels.push(labelStr);

            let dayWaste = 0;
            let dayOrganic = 0;
            let dayConfSum = 0;
            let dayObjectCount = 0;

            history.forEach(entry => {
                const eDate = window.StorageEngine && window.StorageEngine.parseEntryDate 
                    ? window.StorageEngine.parseEntryDate(entry) 
                    : (entry.date ? new Date(entry.date) : null);
                if (eDate && eDate.toDateString() === dateStr) {
                    (entry.detections || []).forEach(det => {
                        const rawConf = det.confidence || 0;
                        const confPct = rawConf <= 1 ? rawConf * 100 : rawConf;
                        dayConfSum += confPct;
                        dayObjectCount++;

                        if (isOrganicLabel(det.label)) {
                            dayOrganic++;
                        } else {
                            dayWaste++;
                        }
                    });
                }
            });

            wasteData.push(dayWaste);
            organicData.push(dayOrganic);
            confData.push(dayObjectCount > 0 ? Math.round(dayConfSum / dayObjectCount) : 0);
        }

        const datasets = [];
        if (activeSeries.waste) {
            datasets.push({
                label: 'Waste',
                data: wasteData,
                borderColor: '#00D9FF',
                backgroundColor: 'rgba(0, 217, 255, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            });
        }
        if (activeSeries.organic) {
            datasets.push({
                label: 'Organic',
                data: organicData,
                borderColor: '#00D98E',
                backgroundColor: 'rgba(0, 217, 142, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            });
        }
        if (activeSeries.confidence) {
            datasets.push({
                label: 'Confidence (%)',
                data: confData,
                borderColor: '#FFB700',
                backgroundColor: 'rgba(255, 183, 0, 0.05)',
                borderWidth: 2,
                borderDash: [4, 4],
                fill: false,
                tension: 0.4
            });
        }

        const canvas = document.getElementById('trendsChart');
        if (!canvas) return;

        if (trendsChartInstance) {
            trendsChartInstance.destroy();
        }

        try {
            trendsChartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#94a3b8', font: { size: 11 } },
                            grid: { color: 'rgba(148, 163, 184, 0.1)' }
                        },
                        y: {
                            ticks: { color: '#94a3b8', font: { size: 11 } },
                            grid: { color: 'rgba(148, 163, 184, 0.1)' },
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (e) {
            console.warn("Trends Chart rendering failed", e);
        }
    }

    function updateRateChart() {
        const histData = window.StorageEngine && window.StorageEngine.getConfidenceHistogramData 
            ? window.StorageEngine.getConfidenceHistogramData(history)
            : { labels: ['<70%', '70-85%', '85-95%', '95-100%'], counts: [0, 0, 0, 0] };

        const canvas = document.getElementById('rateChart');
        if (!canvas) return;

        if (rateChartInstance) {
            rateChartInstance.destroy();
        }

        try {
            rateChartInstance = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: histData.labels,
                    datasets: [{
                        label: 'Detections Frequency',
                        data: histData.counts,
                        backgroundColor: ['#FF6B6B', '#FF9500', '#FFB700', '#00D9FF', '#00D98E', '#8B5CF6'],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: { color: '#cbd5e1', font: { size: 10, weight: 600 } },
                            grid: { display: false }
                        },
                        y: {
                            ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 },
                            grid: { color: 'rgba(148, 163, 184, 0.1)' },
                            beginAtZero: true
                        }
                    }
                }
            });
        } catch (e) {
            console.warn("Rate Chart rendering failed", e);
        }
    }

    function updateCompositionChart() {
        const canvas = document.getElementById('compositionChart');
        const breakdownListEl = document.getElementById('compositionBreakdownList');
        const centerTotalEl = document.getElementById('compositionCenterTotal');

        if (!canvas || !breakdownListEl) return;

        // Active models map (without YOLOv8 v2) + Mixed Ensemble
        const modelMap = {
            'rtdetr': { key: 'RT-DETR', name: 'RT-DETR (best.pt)', count: 0, confSum: 0, color: '#00D9FF', latency: '~28ms' },
            'yolov8': { key: 'YOLOv8', name: 'YOLOv8 Standard', count: 0, confSum: 0, color: '#8B5CF6', latency: '~30ms' },
            'taco': { key: 'TACO Faster R-CNN', name: 'TACO Faster R-CNN', count: 0, confSum: 0, color: '#00D98E', latency: '~65ms' },
            'mixed': { key: 'Mixed Ensemble', name: 'All Models (Mixed / Ensemble)', count: 0, confSum: 0, color: '#FFB700', latency: '~38ms' }
        };

        let totalModelDetections = 0;
        let totalMixedConfSum = 0;

        history.forEach(entry => {
            const mStr = String(entry.model_name || entry.model_id || entry.model || '').toLowerCase();
            let matchedKey = 'yolov8';

            if (mStr.includes('rtdetr') || mStr.includes('rt-detr') || mStr.includes('best_pt') || mStr.includes('rtdetr_main')) {
                matchedKey = 'rtdetr';
            } else if (mStr.includes('taco') || mStr.includes('fasterrcnn') || mStr.includes('faster') || mStr.includes('30epochs')) {
                matchedKey = 'taco';
            } else if (mStr.includes('mixed') || mStr.includes('ensemble') || mStr.includes('all')) {
                matchedKey = 'mixed';
            } else {
                matchedKey = 'yolov8';
            }

            const detList = entry.detections || [];
            detList.forEach(d => {
                const rawConf = d.confidence || 0;
                const confPct = rawConf <= 1 ? rawConf * 100 : rawConf;
                modelMap[matchedKey].count++;
                modelMap[matchedKey].confSum += confPct;
                totalModelDetections++;
                totalMixedConfSum += confPct;
            });
        });

        // Compute Mixed / All Models Combined analytics summary
        modelMap['mixed'].count = totalModelDetections;
        modelMap['mixed'].confSum = totalMixedConfSum;

        // Filter out zero count entries (except Mixed if total > 0)
        const displayModels = Object.values(modelMap)
            .filter(m => m.count > 0)
            .map(m => {
                const avgConf = m.count > 0 ? (m.confSum / m.count).toFixed(1) : '0.0';
                const pct = m.key === 'Mixed Ensemble' ? 100 : Math.round((m.count / Math.max(1, totalModelDetections)) * 100);
                return {
                    ...m,
                    avgConf,
                    pct
                };
            })
            .sort((a, b) => (b.key === 'Mixed Ensemble' ? -1 : a.key === 'Mixed Ensemble' ? 1 : b.count - a.count));

        // 1. GSAP Counter Animation
        if (typeof gsap !== 'undefined' && centerTotalEl) {
            const counterObj = { val: parseInt(centerTotalEl.textContent || '0', 10) || 0 };
            gsap.to(counterObj, {
                val: totalModelDetections,
                duration: 1.4,
                ease: 'power2.out',
                onUpdate: () => {
                    centerTotalEl.textContent = Math.round(counterObj.val);
                }
            });

            // GSAP Donut Chart Entrance Scale & Rotation Spring
            gsap.fromTo(canvas, 
                { scale: 0.75, opacity: 0, rotation: -35 }, 
                { scale: 1, opacity: 1, rotation: 0, duration: 1.2, ease: 'back.out(1.6)' }
            );

            // GSAP Ambient Ring Pulse
            const ringEl = document.querySelector('.pie-glow-ring');
            if (ringEl) {
                gsap.fromTo(ringEl, 
                    { scale: 0.85, opacity: 0.3 }, 
                    { scale: 1.08, opacity: 0.7, duration: 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut' }
                );
            }
        } else if (centerTotalEl) {
            centerTotalEl.textContent = totalModelDetections;
        }

        // Check active theme
        const isLightTheme = (document.documentElement.getAttribute('data-theme') === 'light' || document.body.getAttribute('data-theme') === 'light');
        const sliceBorderColor = isLightTheme ? '#ffffff' : 'rgba(14, 21, 44, 0.95)';

        // Individual model chart models (Outer Ring)
        const outerModels = displayModels.filter(m => m.key !== 'Mixed Ensemble');
        const outerLabels = outerModels.map(m => m.key);
        const outerData = outerModels.map(m => m.count);

        const ctx = canvas.getContext('2d');

        // Outer Ring Canvas Gradients
        const outerGradients = outerModels.map(m => {
            const grad = ctx.createLinearGradient(0, 0, 185, 185);
            if (m.key === 'RT-DETR') {
                grad.addColorStop(0, '#00D9FF');
                grad.addColorStop(1, '#0066FF');
            } else if (m.key === 'YOLOv8') {
                grad.addColorStop(0, '#A855F7');
                grad.addColorStop(1, '#6366F1');
            } else if (m.key === 'TACO Faster R-CNN') {
                grad.addColorStop(0, '#00D98E');
                grad.addColorStop(1, '#059669');
            } else {
                grad.addColorStop(0, '#FFB700');
                grad.addColorStop(1, '#FF8C00');
            }
            return grad;
        });

        // Inner Mixed Ensemble Gold Ring Gradient
        const mixedGrad = ctx.createLinearGradient(0, 0, 185, 185);
        mixedGrad.addColorStop(0, '#FFB700');
        mixedGrad.addColorStop(1, '#FF8C00');

        if (compositionChartInstance) {
            compositionChartInstance.destroy();
        }

        try {
            compositionChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [...outerLabels, 'All Models (Mixed / Ensemble)'],
                    datasets: [
                        // Dataset 0: Outer Ring - Individual Model Proportions
                        {
                            label: 'Model Distribution',
                            data: outerData.length > 0 ? outerData : [1],
                            backgroundColor: outerGradients.length > 0 ? outerGradients : ['#00D9FF'],
                            borderWidth: 2,
                            borderColor: sliceBorderColor,
                            hoverBorderColor: '#ffffff',
                            hoverBorderWidth: 3,
                            hoverOffset: 8,
                            borderRadius: 4,
                            spacing: 2
                        },
                        // Dataset 1: Inner Concentric Ring - All Models (Mixed / Ensemble)
                        {
                            label: 'All Models Mixed',
                            data: [totalModelDetections > 0 ? totalModelDetections : 1],
                            backgroundColor: [mixedGrad],
                            borderWidth: 2,
                            borderColor: sliceBorderColor,
                            hoverBorderColor: '#ffffff',
                            hoverBorderWidth: 3,
                            hoverOffset: 6,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '64%',
                    animation: {
                        animateRotate: true,
                        animateScale: true,
                        duration: 1200,
                        easing: 'easeOutQuart'
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: isLightTheme ? 'rgba(255, 255, 255, 0.96)' : 'rgba(10, 14, 39, 0.94)',
                            titleColor: isLightTheme ? '#0f172a' : '#f8fafc',
                            bodyColor: isLightTheme ? '#334155' : '#cbd5e1',
                            borderColor: isLightTheme ? 'rgba(0, 153, 204, 0.25)' : 'rgba(0, 217, 255, 0.25)',
                            borderWidth: 1,
                            titleFont: { family: 'Poppins', size: 13, weight: '700' },
                            bodyFont: { family: 'Inter', size: 12 },
                            padding: 12,
                            boxPadding: 6,
                            usePointStyle: true,
                            callbacks: {
                                label: function(context) {
                                    const val = context.parsed;
                                    const pct = Math.round((val / Math.max(1, totalModelDetections)) * 100);
                                    return ` ${context.label}: ${val} detections (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.warn("Model Analytics Donut Chart rendering failed", e);
        }

        // Render detailed per-model performance list with GSAP stagger class & theme adaptability
        breakdownListEl.innerHTML = displayModels.map((m, idx) => {
            const isMixed = m.key === 'Mixed Ensemble';
            return `
                <div class="model-analytics-item ${isMixed ? 'is-mixed' : ''}" data-index="${idx}" style="display: flex; flex-direction: column; gap: 4px; background: ${isMixed ? 'linear-gradient(135deg, rgba(255, 183, 0, 0.08) 0%, rgba(255, 140, 0, 0.04) 100%)' : 'rgba(0, 217, 255, 0.02)'}; padding: 0.5rem 0.85rem; border-radius: 10px; border: 1px solid ${isMixed ? 'rgba(255, 183, 0, 0.35)' : 'rgba(148, 163, 184, 0.12)'}; transition: all 0.3s ease; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; font-weight: 700;">
                        <span style="color: var(--text); display: flex; align-items: center; gap: 7px;">
                            <span style="width: 9px; height: 9px; border-radius: 50%; background: ${m.color}; display: inline-block; box-shadow: 0 0 8px ${m.color};"></span>
                            ${m.name}
                        </span>
                        <span style="color: ${m.color}; font-weight: 800; font-size: 0.9rem;">${m.count} <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">(${m.pct}%)</span></span>
                    </div>
                    <div style="height: 6px; background: rgba(148, 163, 184, 0.1); border-radius: 4px; overflow: hidden; margin: 3px 0;">
                        <div style="height: 100%; width: ${m.pct}%; background: linear-gradient(90deg, ${m.color}, rgba(255, 255, 255, 0.7)); border-radius: 4px; transition: width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">
                        <span>Avg Conf: <strong style="color: var(--text); font-weight: 700;">${m.avgConf}%</strong></span>
                        <span>Latency: <strong style="color: var(--primary); font-weight: 700;">${m.latency}</strong></span>
                    </div>
                </div>
            `;
        }).join('');

        // 3. GSAP Stagger Entrance for Model Cards
        if (typeof gsap !== 'undefined') {
            gsap.fromTo('.model-analytics-item', 
                { opacity: 0, x: 25 }, 
                { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out', delay: 0.15 }
            );
        }

        // 4. Interactive Card Hover -> Chart Slice Highlight Effect
        const itemEls = breakdownListEl.querySelectorAll('.model-analytics-item');
        itemEls.forEach((item, idx) => {
            item.addEventListener('mouseenter', () => {
                if (typeof gsap !== 'undefined') {
                    gsap.to(item, { scale: 1.02, x: 4, duration: 0.25, ease: 'power2.out' });
                }
                if (compositionChartInstance) {
                    const isMixedCard = displayModels[idx] && displayModels[idx].key === 'Mixed Ensemble';
                    if (isMixedCard) {
                        compositionChartInstance.setActiveElements([{ datasetIndex: 1, index: 0 }]);
                    } else if (outerModels[idx - 1]) {
                        compositionChartInstance.setActiveElements([{ datasetIndex: 0, index: idx - 1 }]);
                    }
                    compositionChartInstance.update();
                }
            });
            item.addEventListener('mouseleave', () => {
                if (typeof gsap !== 'undefined') {
                    gsap.to(item, { scale: 1, x: 0, duration: 0.25, ease: 'power2.out' });
                }
                if (compositionChartInstance) {
                    compositionChartInstance.setActiveElements([]);
                    compositionChartInstance.update();
                }
            });
        });
    }

    let compositionChartInstance = null;

    updateTrendsChart();
    updateRateChart();
    updateCompositionChart();
}
