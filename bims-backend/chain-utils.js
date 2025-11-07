// Lap/bims-backend/chain-utils.js
const crypto = require('crypto');

/**
 * Calculates the SHA-256 hash of a given data object (Node.js version).
 * @param {object} data The data to hash.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal hash string.
 */
async function calculateHash(data) {
    // Create a canonical, ordered string for consistent hashing
    const str = JSON.stringify(data, Object.keys(data).sort());
    
    // Use Node.js's built-in crypto module
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return hash;
}

/**
 * Creates a new block object.
 * @param {number} index - The block's position in the chain.
 * @param {object} transaction - The data for this block (must be the full, rich object).
 * @param {string} previousHash - The hash of the preceding block.
 * @returns {Promise<object>} A promise that resolves to the new block object.
 */
async function createBlock(index, transaction, previousHash) {
    // We use an ISOString to ensure the hash is created from a
    // consistent string, not a Date object with millisecond issues.
    const timestamp = new Date().toISOString();
    
    // Create a new, sorted transaction object to ensure consistent hashing
    const sortedTransaction = Object.keys(transaction)
        .sort()
        .reduce((obj, key) => {
            obj[key] = transaction[key];
            return obj;
        }, {});

    // Create the block *data* that will be hashed
    const blockData = {
        index,
        timestamp, // timestamp is an ISO String
        transaction: sortedTransaction,
        previousHash,
    };
    
    const hash = await calculateHash(blockData);
    
    return { ...blockData, hash };
}

/**
 * Creates the first (Genesis) block of the chain.
 * @returns {Promise<object>} A promise that resolves to the Genesis block.
 */
async function createGenesisBlock() {
    return await createBlock(0, { txType: "GENESIS" }, "0");
}

/**
 * Verifies the integrity of the entire blockchain.
 * @param {Array<object>} blockchainArray - The array of blocks to verify.
 * @returns {Promise<boolean>} A promise that resolves to true if valid, false if tampered.
 */
async function isChainValid(blockchainArray) {
    for (let i = 1; i < blockchainArray.length; i++) {
        const currentBlock = blockchainArray[i];
        const previousBlock = blockchainArray[i - 1];

        // --- START: FINAL FIX ---
        // Trim whitespace from hash fields during comparison
        // to prevent data type or padding issues from the DB.
        if (currentBlock.previousHash.trim() !== previousBlock.hash.trim()) {
        // --- END: FINAL FIX ---
            console.error(`Chain invalid: previousHash mismatch at block ${i}.`);
            return false;
        }

        // Create a new, sorted transaction object from the DB data
        const sortedTransaction = Object.keys(currentBlock.transaction)
            .sort()
            .reduce((obj, key) => {
                obj[key] = currentBlock.transaction[key];
                return obj;
            }, {});

        // 2. Re-calculate the hash of the current block
        const blockDataToRecalculate = {
            index: currentBlock.index,
            // Convert timestamp from DB (Date object) to the exact
            // same string format used during creation.
            timestamp: currentBlock.timestamp.toISOString(),
            transaction: sortedTransaction,
            previousHash: currentBlock.previousHash,
        };
        
        const recalculatedHash = await calculateHash(blockDataToRecalculate);

        // Also trim here for the second check
        if (currentBlock.hash.trim() !== recalculatedHash.trim()) {
            console.error(`Chain invalid: Hash mismatch at block ${i}. Expected ${currentBlock.hash} but got ${recalculatedHash}`);
            return false;
        }
    }
    // If all blocks pass, the chain is valid
    return true;
}


/**
 * This is the server-side validator, moved from core.js
 * It rebuilds the state from the chain and validates a new transaction.
 */
function validateTransaction(transaction, currentChain) {
    // 1. Rebuild the "world state" (inventory) from the existing chain
    const inventory = new Map();
    for (let i = 1; i < currentChain.length; i++) { // Skip Genesis
        if (currentChain[i] && currentChain[i].transaction) {
            // Run the processor in a "muted" state (no errors)
            processTransaction(currentChain[i].transaction, inventory, true, null); 
        }
    }

    // 2. Process the new transaction against that state
    const errorCallback = (message) => { throw new Error(message); };
    
    try {
        const success = processTransaction(transaction, inventory, false, errorCallback);
        return { success: success, error: null };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * *** NEW: Time-Travel Function ***
 * Rebuilds the "world state" (inventory) from the chain up to a
 * specific point in time.
 * @param {Array<object>} blockchainArray - The *entire* blockchain.
 * @param {string} targetTimestampISO - An ISO string of the time to stop at.
 * @returns {object} An object containing { inventory, transactionCount }
 */
function rebuildStateAt(blockchainArray, targetTimestampISO) {
    const inventory = new Map();
    let transactionCount = 0;
    const targetDate = new Date(targetTimestampISO);

    // Start at 1 to skip the Genesis block
    for (let i = 1; i < blockchainArray.length; i++) {
        const block = blockchainArray[i];
        const blockDate = new Date(block.timestamp);

        // If the block's timestamp is *after* our target, stop processing.
        if (blockDate > targetDate) {
            break; // This is the "time-travel" part
        }

        // This block is at or before our target time, process it.
        if (block && block.transaction) {
            // Use the existing processTransaction logic in "muted" mode
            processTransaction(block.transaction, inventory, true, null);
            transactionCount++;
        }
    }

    return { inventory, transactionCount };
}


/**
 * This is the core logic from core.js, now running on the server.
 * Note: It modifies the inventory map directly.
 */
const processTransaction = (transaction, inventory, suppressErrors = false, showErrorCallback) => {
    const { txType, itemSku, itemName, quantity, fromLocation, toLocation, location, price, category } = transaction;

    let product;
    if (txType !== 'CREATE_ITEM' && !inventory.has(itemSku)) {
        if (showErrorCallback) showErrorCallback(`Product ${itemSku} not found.`, suppressErrors);
        return false;
    }
    
    if (txType !== 'CREATE_ITEM') {
        product = inventory.get(itemSku);
    }

    switch (txType) {
        case 'CREATE_ITEM':
            if (inventory.has(itemSku) && !suppressErrors) {
                if (showErrorCallback) showErrorCallback(`Product SKU ${itemSku} already exists.`);
                return false;
            }
            if (!inventory.has(itemSku)) {
                 inventory.set(itemSku, {
                    productName: itemName,
                    price: price || 0,
                    category: category || 'Uncategorized',
                    locations: new Map()
                });
            }
            product = inventory.get(itemSku);
            const currentAddQty = product.locations.get(toLocation) || 0;
            product.locations.set(toLocation, currentAddQty + quantity);
            return true;
    
        case 'MOVE':
            const fromQty = product.locations.get(fromLocation) || 0;
            if (fromQty < quantity) {
                if (showErrorCallback) showErrorCallback(`Insufficient stock at ${fromLocation}. Only ${fromQty} available.`, suppressErrors);
                return false;
            }
            if (fromLocation === toLocation) {
                 if (showErrorCallback) showErrorCallback(`Cannot move item to its current location.`, suppressErrors);
                 return false;
            }
            const toQty = product.locations.get(toLocation) || 0;
            product.locations.set(fromLocation, fromQty - quantity);
            product.locations.set(toLocation, toQty + quantity);
            return true;
        
        case 'STOCK_IN':
            const currentStockInQty = product.locations.get(location) || 0;
            product.locations.set(location, currentStockInQty + quantity);
            return true;
        
        case 'STOCK_OUT':
            const currentStockOutQty = product.locations.get(location) || 0;
            if (currentStockOutQty < quantity) {
                if (showErrorCallback) showErrorCallback(`Insufficient stock at ${location}. Only ${currentStockOutQty} available.`, suppressErrors);
                return false;
            }
            product.locations.set(location, currentStockOutQty - quantity);
            return true;
    }
    return false;
};


module.exports = {
    calculateHash,
    createBlock,
    createGenesisBlock,
    isChainValid,
    validateTransaction,
    rebuildStateAt 
};