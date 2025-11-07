// Lap/core.js

// --- STATE MANAGEMENT ---
let blockchain = [];
let inventory = new Map(); // The "World State"
let currentUser = null;
let globalLocations = []; 
let globalCategories = []; 

// Define the base URL for your backend server
// const API_BASE_URL = 'http://127.0.0.1:3000';



// --- ADD THESE TWO NEW FUNCTIONS ---
const fetchLocations = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch locations');
        globalLocations = await response.json();
    } catch (e) {
        console.error(e);
        globalLocations = [{ name: "Supplier" }, { name: "Warehouse" }, { name: "Retailer" }];
        showError('Could not load dynamic locations.');
    }
};

const fetchCategories = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch categories');
        globalCategories = await response.json();
    } catch (e) {
        console.error(e);
        globalCategories = [{ name: "Electronics" }, { name: "Uncategorized" }];
        showError('Could not load dynamic categories.');
    }
};
// --- END NEW FUNCTIONS ---



// --- SERVICES (Simulating Backend Logic) ---

/**
 * Authentication Service
 * Communicates with the backend.
 */
const authService = {
    /**
     * Checks for an existing server-side session.
     */
    init: async (showAppCallback, showLoginCallback) => {
        try {
            // Check if we have a valid session cookie with the server
            const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                credentials: 'include' // This is essential for sending cookies
            });
            
            if (!response.ok) {
                // No valid session
                throw new Error('Not authenticated');
            }
            
            currentUser = await response.json(); // Server sends back the user object
            await fetchLocations(); // <-- ADD
            await fetchCategories(); // <-- ADD
            await showAppCallback(); // User is logged in, show the app
        
        } catch (error) {
            console.warn('No active session:', error.message);
            showLoginCallback(); // No user, show login
        }
    },
    
    /**
     * Logs in by sending credentials to the backend.
     */
    login: async (email, password, showAppCallback, showErrorCallback) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            currentUser = data.user; // Backend sends back the user object
            await fetchLocations(); // <-- ADD
            await fetchCategories(); // <-- ADD
            await showAppCallback(); // Show the app

        } catch (error) {
            showErrorCallback(error.message);
        }
    },

    /**
     * Logs out by invalidating the server session.
     */
    logout: async (showLoginCallback) => {
        try {
            // Tell the server to destroy the session
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Error logging out:', error);
        } finally {
            currentUser = null;
            showLoginCallback();
        }
    }
};

/**
 * Permission Service
 * Checks permissions based on the currentUser object.
 */
const permissionService = {
    can: (action) => {
        if (!currentUser) return false;
        const role = currentUser.role;

        switch (action) {
            case 'VIEW_DASHBOARD':
                return true;
            case 'VIEW_PRODUCTS':
                return true;
            case 'CREATE_ITEM':
                return role === 'Admin';
            case 'UPDATE_STOCK': // Add, Remove, Move
                return role === 'Admin' || role === 'Inventory Manager';
            case 'VIEW_ITEM_HISTORY':
                return true;
            case 'VIEW_ADMIN_PANEL':
                return role === 'Admin';
            case 'MANAGE_USERS':
                return role === 'Admin';
            case 'VIEW_LEDGER':
                return role === 'Admin' || role === 'Auditor';
            case 'VERIFY_CHAIN':
                return role === 'Admin' || role === 'Auditor';
            case 'CLEAR_DB':
                return role === 'Admin';
            
            // *** NEW PERMISSION ***
            case 'VIEW_HISTORICAL_STATE':
                return role === 'Admin' || role === 'Auditor';

            default:
                return false;
        }
    }
};

// --- CORE LOGIC (Blockchain & Inventory) ---

/**
 * MODIFIED: Sends the transaction to the server, which creates the block.
 * The server returns the new block, which we add to our local state.
 * Throws an error if the server rejects the transaction.
 */
const addTransactionToChain = async (transaction) => {
    // This function no longer creates a block.
    // It sends the transaction to the server, which creates the block.
    
    const response = await fetch(`${API_BASE_URL}/api/blockchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Send session cookie
        body: JSON.stringify(transaction) // Send just the transaction data
    });

    if (!response.ok) {
        const err = await response.json();
        // Throw an error to be caught by the UI handler
        throw new Error(err.message || 'Server failed to add transaction.');
    }
    
    const newBlock = await response.json(); // Server returns the new, valid block
    blockchain.push(newBlock);
    
    // No need to call saveBlockchain()!
};


/**
 * This logic is still needed on the client-side for two reasons:
 * 1. To run a "pre-check" in the UI before sending to the server.
 * 2. To run inside rebuildInventoryState() to build the local inventory map.
 */
const processTransaction = (transaction, suppressErrors = false, showErrorCallback) => {
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

/**
 * MODIFIED: Loads the blockchain from the server API.
 */
const loadBlockchain = async () => {
    try {
        console.log('Fetching blockchain from server...');
        const response = await fetch(`${API_BASE_URL}/api/blockchain`, {
            credentials: 'include' // Send session cookie
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to fetch blockchain from server.');
        }
        blockchain = await response.json();
        
        if (blockchain.length === 0) {
            // This case should not happen if server logic is correct
            throw new Error('Server returned an empty blockchain.');
        }
        console.log(`Blockchain loaded. ${blockchain.length} blocks found.`);
    } catch (e) {
        console.error("Failed to load blockchain:", e);
        // This is a critical failure. We must stop the app.
        alert(`CRITICAL ERROR: Could not load blockchain from server. ${e.message}. Logging out.`);
        authService.logout(() => {
            document.getElementById('login-overlay').style.display = 'flex';
            document.getElementById('app-wrapper').classList.add('hidden');
        });
    }
};

const rebuildInventoryState = () => {
    inventory.clear();
    for (let i = 1; i < blockchain.length; i++) { // Skip Genesis
        if (blockchain[i] && blockchain[i].transaction) {
            // Suppress errors on rebuild, as the server has already validated
            processTransaction(blockchain[i].transaction, true, null); 
        }
    }
};