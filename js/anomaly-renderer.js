// Lap/js/anomaly-renderer.js

// Main function to render the dedicated anomaly page
const renderAnomalyPage = async () => {
    const appContent = document.getElementById('app-content');
    if (!appContent) return;

    // Show loading state
    const kpiTotal = appContent.querySelector('#kpi-total-anomalies');
    const kpiPercent = appContent.querySelector('#kpi-percent-flagged');
    const listContainer = appContent.querySelector('#anomaly-list-container');
    
    kpiTotal.textContent = '...';
    kpiPercent.textContent = '...';
    listContainer.innerHTML = '<p class="text-sm text-slate-500">Scanning blockchain for all anomalies...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/analytics/anomalies-report`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            const err = await response.json();
            if (response.status === 403) {
                listContainer.innerHTML = `<p class="text-lg text-yellow-700">${err.message}</p>`;
            }
            throw new Error(err.message || 'Failed to load anomaly report');
        }
        
        const report = await response.json();
        
        // Populate KPIs
        kpiTotal.textContent = report.summary.totalAnomalies;
        kpiPercent.textContent = `${report.summary.percentOfTransactionsFlagged.toFixed(2)}%`;

        // Render the lists
        listContainer.innerHTML = ''; // Clear loading
        
        if (report.summary.totalAnomalies === 0) {
            listContainer.innerHTML = '<p class="text-sm text-slate-500">No anomalies found. The chain is clean.</p>';
            return;
        }

        renderAnomalyCategory(listContainer, 'Business Logic Anomalies', 'ph-hard-hat', report.basicAnomalies);
        renderAnomalyCategory(listContainer, 'Statistical Outliers', 'ph-chart-line-up', report.statisticalOutliers);
        renderAnomalyCategory(listContainer, 'Behavioral Anomalies', 'ph-user-switch', report.behavioralAnomalies);

    } catch (error) {
        console.error(error.message);
        kpiTotal.textContent = 'Error';
        kpiPercent.textContent = 'Error';
        listContainer.innerHTML = `<p class="text-sm text-red-600">Error loading anomaly report. ${error.message}</p>`;
    }
};

// Helper function to render a category of anomalies
const renderAnomalyCategory = (container, title, icon, anomalies) => {
    if (anomalies.length === 0) return;

    const categoryWrapper = document.createElement('div');
    categoryWrapper.className = 'bg-white p-6 rounded-lg shadow-md';
    
    let anomalyHtml = '';
    anomalies.forEach(anomaly => {
        // We re-use the block element creator from ui-utils.js
        const blockElement = createLedgerBlockElement(anomaly.block);
        
        // Add a red border and the reasons
        blockElement.classList.add('border-red-300', 'border-2');
        
        const reasonsList = anomaly.reasons.map(reason => 
            `<li class="text-xs font-medium text-red-700">${reason}</li>`
        ).join('');

        blockElement.innerHTML += `
            <ul class="mt-2 list-disc list-inside space-y-1">
                ${reasonsList}
            </ul>
        `;
        anomalyHtml += blockElement.outerHTML;
    });

    categoryWrapper.innerHTML = `
        <div class="flex items-center gap-3 mb-4">
            <span class="inline-flex p-3 bg-red-100 text-red-700 rounded-full">
                <i class="ph-bold ${icon} text-2xl"></i>
            </span>
            <h2 class="text-2xl font-semibold text-slate-800">${title} (${anomalies.length})</h2>
        </div>
        <div class="space-y-4">
            ${anomalyHtml}
        </div>
    `;
    
    container.appendChild(categoryWrapper);
};