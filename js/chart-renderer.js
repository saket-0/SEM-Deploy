// Lap/js/chart-renderer.js

// Keep track of charts to destroy them on navigation
let currentCharts = [];

const destroyCurrentCharts = () => {
    currentCharts.forEach(chart => chart.destroy());
    currentCharts = [];
};

const renderItemStockChart = (productId) => {
    const itemHistory = blockchain
        .filter(block => block.transaction.itemSku === productId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort chronological

    if (itemHistory.length === 0) return;

    const labels = [];
    const dataPoints = [];
    let currentStock = 0;

    itemHistory.forEach(block => {
        const tx = block.transaction;
        switch (tx.txType) {
            case 'CREATE_ITEM':
                currentStock += tx.quantity;
                break;
            case 'STOCK_IN':
                currentStock += tx.quantity;
                break;
            case 'STOCK_OUT':
                currentStock -= tx.quantity;
                break;
            case 'MOVE':
                break;
        }
        labels.push(new Date(block.timestamp).toLocaleString());
        dataPoints.push(currentStock);
    });

    const ctx = document.getElementById('item-stock-chart')?.getContext('2d');
    if (!ctx) return;
    
    const stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Stock',
                data: dataPoints,
                borderColor: '#4f46e5',
                backgroundColor: '#eef2ff',
                fill: true,
                tension: 0.1,
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    currentCharts.push(stockChart);
};


const renderAnalyticsPage = () => {
    // This is no longer async
    // The call to renderAnomalyList() has been removed
    renderTxVelocityChart();
    renderInventoryDistributionChart();
    renderTxHeatmapChart();
    renderInventoryCategoryChart();
};


const renderTxVelocityChart = () => {
    const labels = [];
    const txInMap = new Map();
    const txOutMap = new Map();

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toISOString().split('T')[0];
        labels.push(label);
        txInMap.set(label, 0);
        txOutMap.set(label, 0);
    }

    blockchain.forEach(block => {
        if (block.transaction.txType === 'GENESIS') return;
        
        const dateStr = new Date(block.timestamp).toISOString().split('T')[0];
        const txType = block.transaction.txType;
        
        if (txInMap.has(dateStr) && (txType === 'STOCK_IN' || txType === 'CREATE_ITEM')) {
            txInMap.set(dateStr, txInMap.get(dateStr) + 1);
        }
        if (txOutMap.has(dateStr) && txType === 'STOCK_OUT') {
            txOutMap.set(dateStr, txOutMap.get(dateStr) + 1);
        }
    });

    const txInData = labels.map(label => txInMap.get(label));
    const txOutData = labels.map(label => txOutMap.get(label));

    const ctx = document.getElementById('tx-velocity-chart')?.getContext('2d');
    if (!ctx) return;
    
    const velocityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Stock In / Create',
                    data: txInData,
                    backgroundColor: '#10b981',
                },
                {
                    label: 'Stock Out',
                    data: txOutData,
                    backgroundColor: '#ef4444',
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            }
        }
    });
    currentCharts.push(velocityChart);
};

const renderInventoryDistributionChart = () => {
    const locationValues = new Map([
        ['Supplier', 0],
        ['Warehouse', 0],
        ['Retailer', 0]
    ]);

    inventory.forEach(product => {
        const price = product.price || 0;
        product.locations.forEach((qty, location) => {
            if (locationValues.has(location)) {
                locationValues.set(location, locationValues.get(location) + (qty * price));
            }
        });
    });

    const ctx = document.getElementById('inventory-distribution-chart')?.getContext('2d');
    if (!ctx) return;
    
    const pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Array.from(locationValues.keys()),
            datasets: [{
                label: 'Inventory Value',
                data: Array.from(locationValues.values()),
                backgroundColor: ['#3b82f6', '#f97316', '#10b981']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } }
        }
    });
    currentCharts.push(pieChart);
};

const renderTxHeatmapChart = () => {
    const hourCounts = Array(24).fill(0);
    
    blockchain.forEach(block => {
        if (block.transaction.txType === 'GENESIS') return;
        const hour = new Date(block.timestamp).getUTCHours();
        hourCounts[hour]++;
    });

    const labels = Array.from({length: 24}, (_, i) => `${i}:00`);

    const ctx = document.getElementById('tx-heatmap-chart')?.getContext('2d');
    if (!ctx) return;

    const heatmapChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Transactions by Hour (UTC)',
                data: hourCounts,
                backgroundColor: '#4f46e5',
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
    currentCharts.push(heatmapChart);
};

const renderInventoryCategoryChart = () => {
    const categoryValues = new Map();

    inventory.forEach(product => {
        const price = product.price || 0;
        const category = product.category || 'Uncategorized';
        let totalStock = 0;
        product.locations.forEach(qty => totalStock += qty);
        
        const currentCategoryValue = categoryValues.get(category) || 0;
        categoryValues.set(category, currentCategoryValue + (totalStock * price));
    });

    const ctx = document.getElementById('inventory-category-chart')?.getContext('2d');
    if (!ctx) return;

    const categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Array.from(categoryValues.keys()),
            datasets: [{
                label: 'Inventory Value',
                data: Array.from(categoryValues.values()),
                backgroundColor: ['#4f46e5', '#3b82f6', '#10b981', '#f97316', '#ef4444', '#6b7280']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } }
        }
    });
    currentCharts.push(categoryChart);
};