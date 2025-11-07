// bims-backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const { rebuildStateAt } = require('../chain-utils');

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
};

// SQL query to select columns and alias them to camelCase
const SELECT_BLOCKCHAIN_FIELDS = `
    SELECT 
        index, 
        timestamp, 
        transaction, 
        previous_hash AS "previousHash", 
        hash 
    FROM blockchain
`;

// Helper function for standard deviation
const getStdDev = (array) => {
    if (array.length === 0) return 0;
    const n = array.length;
    const mean = array.reduce((a, b) => a + b) / n;
    const stdDev = Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
    return { mean, stdDev };
};

module.exports = (pool) => {

    /**
     * FEATURE 1: Predictive Low-Stock
     * GET /api/analytics/low-stock-predictions
     */
    router.get('/low-stock-predictions', isAuthenticated, async (req, res) => {
        console.log('📈 Generating low-stock predictions...');
        
        try {
            const chainResult = await pool.query(`${SELECT_BLOCKCHAIN_FIELDS} ORDER BY index ASC`);
            const currentChain = chainResult.rows;

            if (currentChain.length <= 1) {
                return res.json([]);
            }

            const { inventory } = rebuildStateAt(currentChain, new Date().toISOString());
            
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const velocityMap = new Map();

            currentChain.forEach(block => {
                const tx = block.transaction;
                const blockDate = new Date(block.timestamp);
                
                if (tx.txType === 'STOCK_OUT' && blockDate > thirtyDaysAgo) {
                    const currentVelocity = velocityMap.get(tx.itemSku) || 0;
                    velocityMap.set(tx.itemSku, currentVelocity + tx.quantity);
                }
            });

            const predictions = [];
            const PREDICTION_THRESHOLD_DAYS = 7; 

            inventory.forEach((product, sku) => {
                let totalStock = 0;
                product.locations.forEach(qty => totalStock += qty);

                const totalStockOut = velocityMap.get(sku) || 0;
                
                if (totalStockOut > 0) {
                    const dailyVelocity = totalStockOut / 30;
                    const daysToEmpty = Math.floor(totalStock / dailyVelocity);

                    if (daysToEmpty <= PREDICTION_THRESHOLD_DAYS) {
                        predictions.push({
                            id: sku,
                            name: product.productName,
                            stock: totalStock,
                            daysToEmpty: daysToEmpty
                        });
                    }
                }
            });

            predictions.sort((a, b) => a.daysToEmpty - b.daysToEmpty);
            
            console.log(`✅ Found ${predictions.length} proactive warnings.`);
            res.status(200).json(predictions);

        } catch (e) {
            console.error('❌ Error generating predictions:', e);
            res.status(500).json({ message: e.message });
        }
    });

    /**
     * FEATURE 2: Dedicated Anomaly Report (NEW)
     * GET /api/analytics/anomalies-report
     * Scans the entire blockchain for multiple types of anomalies
     */
    router.get('/anomalies-report', isAuthenticated, async (req, res) => {
        console.log('🛡️ Running full anomaly detection report...');
        
        if (req.session.user.role !== 'Admin' && req.session.user.role !== 'Auditor') {
            return res.status(403).json({ message: 'Forbidden: Admin or Auditor access required' });
        }

        try {
            // 1. Get all users to map names to roles and track behavior
            const usersResult = await pool.query('SELECT id, name, role FROM users');
            const userRoleMap = new Map(usersResult.rows.map(u => [u.name, u.role]));
            // Map<userId, Set<txType>>
            const userBehaviorMap = new Map(usersResult.rows.map(u => [u.id, new Set()]));
            
            // 2. Get the full chain
            const chainResult = await pool.query(`${SELECT_BLOCKCHAIN_FIELDS} ORDER BY index ASC`);
            const chain = chainResult.rows;
            
            // Lists to store anomalies
            const basicAnomalies = [];
            const statisticalOutliers = [];
            const behavioralAnomalies = [];
            
            // For statistical analysis
            const quantities = {
                'CREATE_ITEM': [],
                'STOCK_IN': [],
                'STOCK_OUT': [],
                'MOVE': []
            };

            // First pass: get all quantities to calculate stats
            for (const block of chain) {
                if (block.index === 0) continue;
                const tx = block.transaction;
                if (quantities[tx.txType]) {
                    quantities[tx.txType].push(tx.quantity);
                }
            }
            
            // Calculate stats for transaction types
            const stats = {};
            for (const txType in quantities) {
                const { mean, stdDev } = getStdDev(quantities[txType]);
                stats[txType] = { mean, stdDev, threshold: mean + (3 * stdDev) }; // 3-sigma rule
            }

            // Second pass: apply all rules
            for (const block of chain) {
                if (block.index === 0) continue; 

                const tx = block.transaction;
                const reasons = [];

                // --- Rule Set 1: Business Logic ---
                const hour = new Date(block.timestamp).getUTCHours();
                if (hour < 6 || hour > 22) {
                    reasons.push(`Transaction occurred at an unusual time (${hour}:00 UTC).`);
                }
                
                const userRole = userRoleMap.get(tx.userName);
                if (tx.txType === 'MOVE' && userRole === 'Admin') {
                    reasons.push(`Logistics (MOVE) operation performed by an Admin, not a Manager.`);
                }
                
                if (tx.txType === 'MOVE' && tx.fromLocation === 'Supplier' && tx.toLocation === 'Retailer') {
                    reasons.push(`Logistics anomaly: Skipped Warehouse (Supplier -> Retailer).`);
                }

                if (reasons.length > 0) {
                    basicAnomalies.push({ block, reasons });
                }

                // --- Rule Set 2: Statistical Outlier ---
                const stat = stats[tx.txType];
                if (stat && tx.quantity > stat.threshold && tx.quantity > 10) { // Check vs threshold and a min value
                    statisticalOutliers.push({
                        block,
                        reasons: [`Quantity (${tx.quantity}) is a statistical outlier ( > 3x std. dev.) for ${tx.txType} transactions.`]
                    });
                }
                
                // --- Rule Set 3: Behavioral Anomaly ---
                const userHistory = userBehaviorMap.get(tx.userId);
                
                // First, check if this is the first time this user has EVER done this
                if (userHistory && !userHistory.has(tx.txType)) {
                    // It's the first time. Is this action unusual for their role?
                    let isUnusual = false;
                    switch (userRole) {
                        case 'Auditor':
                            isUnusual = true; // Auditors should not be performing ANY transactions
                            break;
                        case 'Inventory Manager':
                            if (tx.txType === 'CREATE_ITEM') isUnusual = true; // Managers shouldn't create items
                            break;
                        case 'Admin':
                            isUnusual = false; // Admins can do anything
                            break;
                    }

                    if (isUnusual) {
                        behavioralAnomalies.push({
                            block,
                            reasons: [`First time user '${tx.userName}' (Role: ${userRole}) performed a '${tx.txType}' action.`]
                        });
                    }
                }
                // Add this action to their history
                if (userHistory) {
                    userHistory.add(tx.txType);
                }
            }
            
            const totalTransactions = chain.length - 1;
            const allAnomalies = new Set([
                ...basicAnomalies.map(a => a.block.hash),
                ...statisticalOutliers.map(a => a.block.hash),
                ...behavioralAnomalies.map(a => a.block.hash)
            ]);
            const totalAnomalies = allAnomalies.size;

            console.log(`✅ Full anomaly scan complete. Found ${totalAnomalies} unique flags.`);
            
            res.status(200).json({
                summary: {
                    totalAnomalies: totalAnomalies,
                    totalTransactions: totalTransactions,
                    percentOfTransactionsFlagged: (totalAnomalies / totalTransactions) * 100
                },
                basicAnomalies: basicAnomalies.reverse(),
                statisticalOutliers: statisticalOutliers.reverse(),
                behavioralAnomalies: behavioralAnomalies.reverse()
            });

        } catch (e) {
            console.error('❌ Error scanning for anomalies:', e);
            res.status(500).json({ message: e.message });
        }
    });

    return router;
};