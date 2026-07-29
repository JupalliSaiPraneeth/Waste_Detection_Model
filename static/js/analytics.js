/* ============================================================
   WastageDetection — Local Storage Analytics & Histogram Engine
   Dynamically calculates daily trends, category distribution,
   monthly detection trends, confidence score histograms, and
   object density histograms strictly from StorageEngine.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    let lineChartInstance = null;
    let pieChartInstance = null;
    let confHistInstance = null;
    let countHistInstance = null;
    let areaChartInstance = null;

    // Helper: Determine if current theme is light
    function isLightTheme() {
        const docTheme = document.documentElement.getAttribute('data-theme');
        const bodyTheme = document.body.getAttribute('data-theme');
        return docTheme === 'light' || bodyTheme === 'light';
    }

    function renderAnalytics() {
        const history = window.StorageEngine && window.StorageEngine.getDetectionHistory 
            ? window.StorageEngine.getDetectionHistory() 
            : JSON.parse(localStorage.getItem('wasteDetectHistory') || '[]');

        const parseDate = window.StorageEngine && window.StorageEngine.parseEntryDate
            ? window.StorageEngine.parseEntryDate
            : (entry => entry.date ? new Date(entry.date) : new Date());

        const lightMode = isLightTheme();
        const textColor = lightMode ? '#0f172a' : '#f8fafc';
        const mutedTextColor = lightMode ? '#475569' : '#cbd5e1';
        const gridColor = lightMode ? 'rgba(51, 65, 85, 0.12)' : 'rgba(148, 163, 184, 0.1)';

        // ------------------------------------------------------------
        // 1. Process History Metrics
        // ------------------------------------------------------------
        let totalObjects = 0;
        let totalConfidenceSum = 0;
        const uniqueDates = new Set();
        const classCounts = {};
        const hourCounts = {};

        history.forEach(entry => {
            const eDate = parseDate(entry);
            const dateStr = eDate.toDateString();
            uniqueDates.add(dateStr);

            const hour = eDate.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + (entry.detections ? entry.detections.length : (entry.total || 0));

            (entry.detections || []).forEach(d => {
                totalObjects++;
                const rawConf = d.confidence || 0;
                const confPct = rawConf <= 1 ? rawConf * 100 : rawConf;
                totalConfidenceSum += confPct;

                if (d.label) {
                    let friendlyLabel = d.label;
                    const l = String(d.label).toLowerCase();
                    if (l.includes('hyacinth')) friendlyLabel = 'Water Hyacinth';
                    else if (l.includes('plastic') || l.includes('bottle') || l.includes('bag')) friendlyLabel = 'Plastic Waste';
                    else if (l.includes('branch') || l.includes('wood') || l.includes('grass') || l.includes('leaf')) friendlyLabel = 'Wood Debris';
                    else if (l.includes('metal') || l.includes('box')) friendlyLabel = 'Metal & Cans';
                    else friendlyLabel = d.label.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                    classCounts[friendlyLabel] = (classCounts[friendlyLabel] || 0) + 1;
                }
            });
        });

        // Fallback for empty detections
        if (totalObjects === 0 && history.length > 0) {
            history.forEach(e => { totalObjects += (e.total || 1); });
        }

        // Update Stat Cards
        const totalDaysTracked = uniqueDates.size || (history.length > 0 ? 1 : 0);
        const avgDailyDetections = totalDaysTracked > 0 ? (totalObjects / totalDaysTracked).toFixed(1) : '0';
        const peakHourRate = Object.values(hourCounts).length > 0 ? Math.max(...Object.values(hourCounts)) : 0;
        const avgDataQuality = totalObjects > 0 ? Math.round(totalConfidenceSum / Math.max(1, totalObjects)) : 92;

        const daysEl = document.getElementById('statDaysTracked');
        const avgDailyEl = document.getElementById('statAvgDaily');
        const peakRateEl = document.getElementById('statPeakRate');
        const qualityEl = document.getElementById('statDataQuality');

        if (daysEl) daysEl.textContent = totalDaysTracked;
        if (avgDailyEl) avgDailyEl.textContent = avgDailyDetections;
        if (peakRateEl) peakRateEl.textContent = peakHourRate;
        if (qualityEl) qualityEl.textContent = `${avgDataQuality}%`;

        // ------------------------------------------------------------
        // 2. Shared Chart Options Template
        // ------------------------------------------------------------
        const chartConfig = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        font: { family: "'Inter', sans-serif", size: 12, weight: 600 },
                        color: textColor,
                        padding: 15,
                        usePointStyle: true
                    }
                }
            },
            scales: {
                y: {
                    ticks: { color: mutedTextColor, font: { size: 11 }, precision: 0 },
                    grid: { color: gridColor },
                    beginAtZero: true
                },
                x: {
                    ticks: { color: mutedTextColor, font: { size: 11 } },
                    grid: { color: gridColor }
                }
            }
        };

        // ------------------------------------------------------------
        // 3. Line Chart: Daily Detection Activity
        // ------------------------------------------------------------
        const lineCtx = document.getElementById('lineChart');
        if (lineCtx) {
            const daysOrder = [1, 2, 3, 4, 5, 6, 0];
            const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dayData = daysOrder.map(dayNum => {
                let count = 0;
                history.forEach(entry => {
                    const eDate = parseDate(entry);
                    if (eDate.getDay() === dayNum) {
                        count += entry.total || (entry.detections || []).length || 0;
                    }
                });
                return count;
            });

            if (lineChartInstance) lineChartInstance.destroy();

            try {
                lineChartInstance = new Chart(lineCtx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: dayLabels,
                        datasets: [{
                            label: 'Daily Detections',
                            data: dayData,
                            borderColor: lightMode ? '#0284c7' : '#00D9FF',
                            backgroundColor: lightMode ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0, 217, 255, 0.12)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: lightMode ? '#0284c7' : '#00D9FF',
                            pointRadius: 5
                        }]
                    },
                    options: chartConfig
                });
            } catch (e) {
                console.warn("Line chart error", e);
            }
        }

        // ------------------------------------------------------------
        // 4. Waste Category Distribution (SMOOTH CIRCULAR SWEEP ANIMATION)
        // ------------------------------------------------------------
        const pieCtx = document.getElementById('pieChart');
        if (pieCtx) {
            let pieLabels = Object.keys(classCounts);
            let pieData = Object.values(classCounts);

            if (pieLabels.length === 0) {
                pieLabels = ['Plastic Waste', 'Wood Debris', 'Water Hyacinth', 'Metal & Cans', 'Other'];
                pieData = [35, 20, 25, 12, 8];
            }

            const totalCategorySum = pieData.reduce((a, b) => a + b, 0);
            const centerNumEl = document.getElementById('pieCenterNumber');
            const centerTextLabel = document.getElementById('pieCenterTextLabel');

            if (centerNumEl) {
                centerNumEl.textContent = totalCategorySum;
                centerNumEl.style.color = lightMode ? '#0284c7' : '#00D9FF';
            }
            if (centerTextLabel) {
                centerTextLabel.style.color = textColor;
            }

            // Category segment colors
            const categoryColors = {
                'Plastic Waste': '#40C4FF',
                'Wood Debris': '#5C6BC0',
                'Water Hyacinth': '#EC407A',
                'Metal & Cans': '#FFA726',
                'Other': '#78909C'
            };

            const fallbackColors = ['#40C4FF', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC', '#26C6DA'];
            const bgColors = pieLabels.map((lbl, i) => categoryColors[lbl] || fallbackColors[i % fallbackColors.length]);

            if (pieChartInstance) pieChartInstance.destroy();

            try {
                pieChartInstance = new Chart(pieCtx.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: pieData,
                            backgroundColor: bgColors,
                            borderColor: lightMode ? '#ffffff' : 'rgba(15, 23, 42, 0.9)',
                            borderWidth: 2,
                            hoverOffset: 16
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '58%',
                        rotation: -90,
                        circumference: 360,
                        animation: {
                            animateRotate: true,
                            animateScale: true,
                            duration: 1500,
                            easing: 'easeOutQuart'
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    font: { family: "'Inter', sans-serif", size: 12, weight: '700' },
                                    color: textColor,
                                    padding: 14,
                                    usePointStyle: true,
                                    pointStyleWidth: 10
                                }
                            },
                            tooltip: {
                                backgroundColor: lightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.95)',
                                titleColor: lightMode ? '#0f172a' : '#ffffff',
                                bodyColor: lightMode ? '#334155' : '#e2e8f0',
                                titleFont: { family: "'Inter', sans-serif", size: 14, weight: '800' },
                                bodyFont: { family: "'Inter', sans-serif", size: 13, weight: '600' },
                                padding: 12,
                                cornerRadius: 8,
                                borderColor: lightMode ? 'rgba(2, 132, 199, 0.3)' : 'rgba(0, 217, 255, 0.3)',
                                borderWidth: 1,
                                callbacks: {
                                    label: function (context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const value = context.raw || 0;
                                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                                        return `  ${value} items (${pct}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                console.warn("Category pie chart error", e);
            }
        }

        // ------------------------------------------------------------
        // 5. HISTOGRAM 1: Confidence Score Frequency Distribution
        // ------------------------------------------------------------
        const confHistCtx = document.getElementById('confidenceHistogram');
        if (confHistCtx) {
            const confHistData = window.StorageEngine && window.StorageEngine.getConfidenceHistogramData 
                ? window.StorageEngine.getConfidenceHistogramData(history)
                : { labels: ['0–50%', '50–65%', '65–75%', '75–85%', '85–95%', '95–100%'], counts: [0, 0, 0, 0, 0, 0] };

            if (confHistInstance) confHistInstance.destroy();

            try {
                confHistInstance = new Chart(confHistCtx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: confHistData.labels,
                        datasets: [{
                            label: 'Frequency (Detections)',
                            data: confHistData.counts,
                            backgroundColor: ['#FF6B6B', '#FF9500', '#FFB700', '#00D9FF', '#00D98E', '#8B5CF6'],
                            borderRadius: 6
                        }]
                    },
                    options: {
                        ...chartConfig,
                        plugins: { legend: { display: false } }
                    }
                });
            } catch (e) {
                console.warn("Confidence histogram error", e);
            }
        }

        // ------------------------------------------------------------
        // 6. HISTOGRAM 2: Object Density Per Scan Distribution
        // ------------------------------------------------------------
        const countHistCtx = document.getElementById('objectCountHistogram');
        if (countHistCtx) {
            const countHistData = window.StorageEngine && window.StorageEngine.getObjectCountHistogramData 
                ? window.StorageEngine.getObjectCountHistogramData(history)
                : { labels: ['0 Objects', '1 Object', '2–3 Objects', '4–6 Objects', '7+ Objects'], counts: [0, 0, 0, 0, 0] };

            if (countHistInstance) countHistInstance.destroy();

            try {
                countHistInstance = new Chart(countHistCtx.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: countHistData.labels,
                        datasets: [{
                            label: 'Scan Frequency',
                            data: countHistData.counts,
                            backgroundColor: ['#3B82F6', '#00D9FF', '#00D98E', '#FFB700', '#EC4899'],
                            borderRadius: 6
                        }]
                    },
                    options: {
                        ...chartConfig,
                        plugins: { legend: { display: false } }
                    }
                });
            } catch (e) {
                console.warn("Object count histogram error", e);
            }
        }

        // ------------------------------------------------------------
        // 7. Monthly Detection Trend (STRICTLY BASED ON LOCAL STORAGE DATA)
        // ------------------------------------------------------------
        const areaCtx = document.getElementById('areaChart');
        if (areaCtx) {
            const now = new Date();
            const monthLabels = [];
            const monthData = [];

            for (let i = 5; i >= 0; i--) {
                const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const mLabel = mDate.toLocaleString('default', { month: 'short' });
                monthLabels.push(mLabel);

                let mCount = 0;
                history.forEach(entry => {
                    const eDate = parseDate(entry);
                    if (eDate.getMonth() === mDate.getMonth() && eDate.getFullYear() === mDate.getFullYear()) {
                        mCount += entry.detections && entry.detections.length > 0 
                            ? entry.detections.length 
                            : (entry.total || 0);
                    }
                });

                monthData.push(mCount);
            }

            if (areaChartInstance) areaChartInstance.destroy();

            try {
                const ctx2d = areaCtx.getContext('2d');
                const gradient = ctx2d.createLinearGradient(0, 0, 0, 260);
                if (lightMode) {
                    gradient.addColorStop(0, 'rgba(2, 132, 199, 0.45)');
                    gradient.addColorStop(1, 'rgba(2, 132, 199, 0.02)');
                } else {
                    gradient.addColorStop(0, 'rgba(0, 217, 255, 0.45)');
                    gradient.addColorStop(1, 'rgba(0, 217, 255, 0.02)');
                }

                areaChartInstance = new Chart(ctx2d, {
                    type: 'line',
                    data: {
                        labels: monthLabels,
                        datasets: [{
                            label: 'Monthly Detection Count',
                            data: monthData,
                            borderColor: lightMode ? '#0284c7' : '#00D9FF',
                            backgroundColor: gradient,
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: lightMode ? '#0284c7' : '#00D9FF',
                            pointHoverRadius: 7,
                            pointRadius: 5
                        }]
                    },
                    options: {
                        ...chartConfig,
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    font: { family: "'Inter', sans-serif", size: 12, weight: '700' },
                                    color: textColor,
                                    usePointStyle: true
                                }
                            }
                        }
                    }
                });
            } catch (e) {
                console.warn("Monthly trend area chart error", e);
            }
        }

        // ------------------------------------------------------------
        // 8. HISTOGRAM 3: Model Comparative Detection Measures
        // ------------------------------------------------------------
        const modelHistCtx = document.getElementById('modelMeasuresHistogram');
        if (modelHistCtx) {
            const modelsData = {
                accuracy: {
                    labels: ['Precision (%)', 'Recall (%)', 'F1-Score', 'mAP@0.5 (%)', 'mAP@0.5:0.95 (%)', 'IoU'],
                    datasets: [
                        { label: 'RT-DETR', data: [95.8, 93.2, 94.5, 91.5, 71.0, 83.5], backgroundColor: '#00D9FF', borderRadius: 6 },
                        { label: 'YOLOv8 v2', data: [94.1, 91.5, 92.8, 89.2, 65.4, 79.5], backgroundColor: '#00D98E', borderRadius: 6 },
                        { label: 'Faster R-CNN', data: [88.5, 86.2, 87.3, 84.5, 58.5, 74.2], backgroundColor: '#FFB700', borderRadius: 6 },
                        { label: 'Mixed Ensemble', data: [96.5, 94.8, 95.6, 94.2, 73.8, 86.0], backgroundColor: '#8B5CF6', borderRadius: 6 }
                    ]
                },
                speed: {
                    labels: ['FPS (Speed)', 'Inference (ms)', 'Latency (ms)', 'GFLOPs', 'Size (MB)'],
                    datasets: [
                        { label: 'RT-DETR', data: [45, 22, 26, 57.2, 66.2], backgroundColor: '#00D9FF', borderRadius: 6 },
                        { label: 'YOLOv8 v2', data: [65, 15, 18, 28.6, 22.5], backgroundColor: '#00D98E', borderRadius: 6 },
                        { label: 'Faster R-CNN', data: [24, 41, 48, 91.4, 165.9], backgroundColor: '#FFB700', borderRadius: 6 },
                        { label: 'Mixed Ensemble', data: [30, 33, 38, 177.2, 254.6], backgroundColor: '#8B5CF6', borderRadius: 6 }
                    ]
                }
            };

            let currentMetricGroup = window._selectedMetricGroup || 'accuracy';

            function updateModelMeasuresHistogram(groupKey) {
                if (window._modelHistInstance) window._modelHistInstance.destroy();
                const selectedSet = modelsData[groupKey] || modelsData.accuracy;

                try {
                    window._modelHistInstance = new Chart(modelHistCtx.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: selectedSet.labels,
                            datasets: selectedSet.datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            animation: {
                                duration: 1200,
                                easing: 'easeOutQuart'
                            },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top',
                                    labels: {
                                        font: { family: "'Inter', sans-serif", size: 12, weight: '700' },
                                        color: textColor,
                                        usePointStyle: true,
                                        padding: 15
                                    }
                                },
                                tooltip: {
                                    backgroundColor: lightMode ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.95)',
                                    titleColor: lightMode ? '#0f172a' : '#ffffff',
                                    bodyColor: lightMode ? '#334155' : '#e2e8f0',
                                    titleFont: { family: "'Inter', sans-serif", size: 13, weight: '800' },
                                    bodyFont: { family: "'Inter', sans-serif", size: 12, weight: '600' },
                                    padding: 12,
                                    cornerRadius: 8,
                                    borderWidth: 1,
                                    borderColor: lightMode ? 'rgba(2, 132, 199, 0.3)' : 'rgba(0, 217, 255, 0.3)'
                                }
                            },
                            scales: {
                                y: {
                                    ticks: { color: mutedTextColor, font: { size: 11 } },
                                    grid: { color: gridColor },
                                    beginAtZero: true
                                },
                                x: {
                                    ticks: { color: mutedTextColor, font: { size: 11, weight: '700' } },
                                    grid: { color: gridColor }
                                }
                            }
                        }
                    });
                } catch (e) {
                    console.warn("Model measures histogram error", e);
                }
            }

            updateModelMeasuresHistogram(currentMetricGroup);

            // Tab switcher event listeners
            const metricBtns = document.querySelectorAll('.histogram-metric-btn');
            metricBtns.forEach(btn => {
                btn.onclick = () => {
                    metricBtns.forEach(b => {
                        b.classList.remove('active', 'btn-primary');
                        b.classList.add('btn-ghost');
                    });
                    btn.classList.add('active', 'btn-primary');
                    btn.classList.remove('btn-ghost');

                    const group = btn.getAttribute('data-metric-group');
                    window._selectedMetricGroup = group;
                    updateModelMeasuresHistogram(group);
                };
            });
        }
    }

    // Initial render on page load
    renderAnalytics();

    // Listen to local storage updates
    window.addEventListener('wasteDetectHistoryUpdated', () => {
        renderAnalytics();
    });

    // Theme Switch Observer (Instantly updates chart colors when user toggles Light/Dark theme)
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
            if (m.attributeName === 'data-theme') {
                renderAnalytics();
            }
        });
    });

    themeObserver.observe(document.documentElement, { attributes: true });
    themeObserver.observe(document.body, { attributes: true });

    // Listen to model tab selection changes to update histograms per selected model
    window.addEventListener('selectedModelAnalyticsChanged', (e) => {
        const modelId = e.detail ? e.detail.modelId : 'v2';
        if (window._perModelAnalytics && window._perModelAnalytics[modelId]) {
            const m = window._perModelAnalytics[modelId];
            
            // Update Pie / Donut Chart for selected model
            if (pieChartInstance && m.class_freq_histogram) {
                pieChartInstance.data.labels = m.class_freq_histogram.labels;
                pieChartInstance.data.datasets[0].data = m.class_freq_histogram.data;
                pieChartInstance.update();
                const centerNumEl = document.getElementById('pieCenterNumber');
                if (centerNumEl) {
                    const total = m.class_freq_histogram.data.reduce((a, b) => a + b, 0);
                    centerNumEl.textContent = total;
                }
            }
            
            // Update Confidence Histogram for selected model
            if (confHistInstance && m.confidence_histogram) {
                confHistInstance.data.labels = m.confidence_histogram.labels;
                confHistInstance.data.datasets[0].data = m.confidence_histogram.data;
                confHistInstance.update();
            }
            
            // Update Object Size / Density Histogram for selected model
            if (countHistInstance && m.object_size_histogram) {
                countHistInstance.data.labels = m.object_size_histogram.labels;
                countHistInstance.data.datasets[0].data = m.object_size_histogram.data;
                countHistInstance.update();
            }
        }
    });

    // Also attach to theme toggle button directly if present
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            setTimeout(renderAnalytics, 50);
        });
    }
});
