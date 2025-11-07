// Lap/js/form-handlers.js

const handleAddItem = async (form) => {
    if (!permissionService.can('CREATE_ITEM')) return showError("Access Denied.");

    const itemSku = form.querySelector('#add-product-id').value;
    const itemName = form.querySelector('#add-product-name').value;
    const quantity = parseInt(form.querySelector('#add-quantity').value, 10);
    const toLocation = form.querySelector('#add-to').value;
    const price = parseFloat(form.querySelector('#add-price').value);
    const category = form.querySelector('#add-product-category').value;

    if (!itemSku || !itemName || !category || !quantity || quantity <= 0 || !price || price < 0) {
        return showError("Please fill out all fields with valid data (Price/Qty > 0).");
    }
    
    const transaction = {
        txType: "CREATE_ITEM", itemSku, itemName, quantity,
        price, category,
        beforeQuantity: 0, 
        afterQuantity: quantity, 
        toLocation
    };

    if (processTransaction(transaction, false, showError)) {
        try {
            await addTransactionToChain(transaction);
            renderProductList();
            showSuccess(`Product ${itemName} added!`);
            form.reset();
            form.querySelector('#add-product-id').value = `SKU-${Math.floor(100 + Math.random() * 900)}`;
            form.querySelector('#add-product-name').value = "New Product";
            form.querySelector('#add-product-category').value = "Electronics";

        } catch (error) {
            showError(`Server error: ${error.message}`);
            rebuildInventoryState();
        }
    }
};

const handleUpdateStock = async (form) => {
    if (!permissionService.can('UPDATE_STOCK')) return showError("Access Denied.");

    const itemSku = document.getElementById('update-product-id').value;
    const quantity = parseInt(form.querySelector('#update-quantity').value, 10);
    const clickedButton = document.activeElement;
    const actionType = clickedButton.id === 'stock-in-button' ? 'STOCK_IN' : 'STOCK_OUT';

    if (!itemSku || !quantity || quantity <= 0) return showError("Please enter a valid quantity.");
    
    const product = inventory.get(itemSku);
    let transaction = {};
    let success = false;
    let beforeQuantity, afterQuantity;

    if (actionType === 'STOCK_IN') {
        const locationIn = form.querySelector('#update-location').value;
        beforeQuantity = product.locations.get(locationIn) || 0;
        afterQuantity = beforeQuantity + quantity;

        transaction = { 
            txType: "STOCK_IN", itemSku, quantity, 
            location: locationIn, 
            beforeQuantity, afterQuantity
        };
        success = processTransaction(transaction, false, showError);

    } else if (actionType === 'STOCK_OUT') {
        const locationOut = form.querySelector('#update-location').value;
        beforeQuantity = product.locations.get(locationOut) || 0;
        afterQuantity = beforeQuantity - quantity;
        
        transaction = { 
            txType: "STOCK_OUT", itemSku, quantity, 
            location: locationOut, 
            beforeQuantity, afterQuantity
        };
        success = processTransaction(transaction, false, showError);
    }

    if (success) {
        try {
            await addTransactionToChain(transaction);
            destroyCurrentCharts();
            renderProductDetail(itemSku);
            showSuccess(`Stock for ${itemSku} updated!`);
        
        } catch (error) {
            showError(`Server error: ${error.message}`);
            rebuildInventoryState();
            renderProductDetail(itemSku);
        }
    }
};

const handleMoveStock = async (form) => {
    if (!permissionService.can('UPDATE_STOCK')) return showError("Access Denied.");

    const itemSku = document.getElementById('update-product-id').value;
    const quantity = parseInt(form.querySelector('#move-quantity').value, 10);
    const fromLocation = form.querySelector('#move-from-location').value;
    const toLocation = form.querySelector('#move-to-location').value;

    if (fromLocation === toLocation) {
        return showError("Cannot move stock to the same location.");
    }
    if (!itemSku || !quantity || quantity <= 0) {
        return showError("Please enter a valid quantity.");
    }

    const product = inventory.get(itemSku);
    const beforeFromQty = product.locations.get(fromLocation) || 0;
    const beforeToQty = product.locations.get(toLocation) || 0;
    
    const transaction = {
        txType: "MOVE", itemSku, quantity,
        fromLocation, toLocation,
        beforeQuantity: { from: beforeFromQty, to: beforeToQty },
        afterQuantity: { from: beforeFromQty - quantity, to: beforeToQty + quantity }
    };

    if (processTransaction(transaction, false, showError)) {
        try {
            await addTransactionToChain(transaction);
            destroyCurrentCharts();
            renderProductDetail(itemSku);
            showSuccess(`Moved ${quantity} units of ${itemSku}.`);
        
        } catch (error) {
            showError(`Server error: ${error.message}`);
            rebuildInventoryState();
            renderProductDetail(itemSku);
        }
    }
};

const handleClearDb = async (navigateTo) => {
    if (!permissionService.can('CLEAR_DB')) return showError("Access Denied.");
    if (confirm('Are you sure you want to clear the entire blockchain? This cannot be undone.')) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/blockchain`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to clear database');
            }
            
            blockchain = data.chain;
            rebuildInventoryState();
            navigateTo('dashboard');
            showSuccess("Server blockchain cleared.");
            
        } catch (error) {
            showError(error.message);
        }
    }
};

const handleVerifyChain = async () => {
    if (!permissionService.can('VERIFY_CHAIN')) return showError("Access Denied.");
    try {
        const response = await fetch(`${API_BASE_URL}/api/blockchain/verify`, {
            credentials: 'include'
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Verification check failed');
        }
        
        if (data.isValid) {
            showSuccess("Verification complete: Blockchain is valid!");
        } else {
            showError("CRITICAL: Blockchain is invalid! Tampering detected.");
        }
    } catch (error) {
        showError(error.message);
    }
};

const handleRoleChange = async (userId, newRole) => {
    if (!permissionService.can('MANAGE_USERS')) return showError("Access Denied.");
    try {
        const response = await fetch(`${API_BASE_URL}/api/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to update role');
        }
        showSuccess(`Role for ${data.user.name} updated to ${newRole}.`);
        
        if (data.user.id === currentUser.id) { 
            currentUser = data.user;
            document.getElementById('user-role').textContent = currentUser.role;
            document.getElementById('nav-admin').style.display = permissionService.can('VIEW_ADMIN_PANEL') ? 'flex' : 'none';
            document.getElementById('nav-ledger').style.display = permissionService.can('VIEW_LEDGER') ? 'flex' : 'none';
        }
    } catch (error) {
        showError(error.message);
        renderAdminPanel();
    }
};

const handleAddUser = async (form) => {
    if (!permissionService.can('MANAGE_USERS')) return showError("Access Denied.");

    const name = form.querySelector('#add-user-name').value;
    const email = form.querySelector('#add-user-email').value;
    const employeeId = form.querySelector('#add-user-employee-id').value;
    const role = form.querySelector('#add-user-role').value;
    const password = form.querySelector('#add-user-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, email, employeeId, role, password })
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to create user');
        }
        
        showSuccess(`User ${data.user.name} created successfully!`);
        form.reset();
        renderAdminPanel();
        await populateLoginDropdown();
        
    } catch (error) {
        showError(error.message);
    }
};

const handleSnapshotForm = async (form, navigateTo) => {
    if (!permissionService.can('VIEW_HISTORICAL_STATE')) return showError("Access Denied.");
    
    const timestamp = form.querySelector('#snapshot-timestamp').value;
    if (!timestamp) return showError("Please select a date and time.");

    const button = form.querySelector('#generate-snapshot-button');
    button.disabled = true;
    button.innerHTML = '<i class="ph-bold ph-spinner animate-spin"></i> Generating...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/blockchain/state-at?timestamp=${timestamp}`, {
            credentials: 'include'
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to generate snapshot');
        }
        
        navigateTo('snapshot', { snapshotData: data });

    } catch (error) {
        showError(error.message);
        button.disabled = false;
        button.innerHTML = '<i class="ph-bold ph-timer"></i> Generate Snapshot';
    }
};

// --- LOCATION HANDLERS ---
const handleAddLocation = async (form) => {
    const nameInput = form.querySelector('#add-location-name');
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ name: nameInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showSuccess(`Location "${data.name}" added.`);
        nameInput.value = '';
        await fetchLocations(); 
        await renderAdminPanel();
    } catch (error) { showError(error.message); }
};

const handleRenameLocation = async (id, newName) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ name: newName })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showSuccess(`Location renamed to "${data.name}".`);
        await fetchLocations();
    } catch (error) { showError(error.message); renderAdminPanel(); }
};

const handleArchiveLocation = async (id, name) => {
    if (!confirm(`Archive "${name}"? This hides it from new transactions.`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/locations/${id}`, {
            method: 'DELETE', credentials: 'include'
        });
        if (!response.ok) throw new Error((await response.json()).message);
        showSuccess(`Location "${name}" archived.`);
        await fetchLocations();
        await renderAdminPanel();
    } catch (error) { showError(error.message); }
};

// --- CATEGORY HANDLERS ---
const handleAddCategory = async (form) => {
    const nameInput = form.querySelector('#add-category-name');
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ name: nameInput.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showSuccess(`Category "${data.name}" added.`);
        nameInput.value = '';
        await fetchCategories();
        await renderAdminPanel();
    } catch (error) { showError(error.message); }
};

const handleRenameCategory = async (id, newName) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ name: newName })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showSuccess(`Category renamed to "${data.name}".`);
        await fetchCategories();
    } catch (error) { showError(error.message); renderAdminPanel(); }
};

const handleArchiveCategory = async (id, name) => {
    if (!confirm(`Archive "${name}"? This hides it from new transactions.`)) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
            method: 'DELETE', credentials: 'include'
        });
        if (!response.ok) throw new Error((await response.json()).message);
        showSuccess(`Category "${name}" archived.`);
        await fetchCategories();
        await renderAdminPanel();
    } catch (error) { showError(error.message); }
};