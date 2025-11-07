# BIMS: Blockchain Inventory Management System

BIMS is a modern, secure, web-based application designed to manage inventory using an immutable blockchain ledger. It features a client-server architecture with a lightweight vanilla JavaScript frontend and a robust Node.js backend, all backed by a PostgreSQL database.

The system enforces strict business logic and security through role-based access control, ensuring that all inventory transactions (additions, removals, and transfers) are validated, cryptographically signed, and permanently recorded on a server-side blockchain.

## Features

  * **Secure Authentication:** User login is handled via a secure, server-side session management system.
  * **Role-Based Access Control (RBAC):** The system defines three distinct user roles with specific permissions:
      * **Admin:** Full control. Can manage users, add new products, update stock, clear the entire blockchain, and verify the chain's integrity.
      * **Inventory Manager:** Can update stock levels (Stock In, Stock Out) and move inventory between locations.
      * **Auditor:** Read-only access to the complete inventory ledger and the ability to verify the blockchain's integrity.
  * **Centralized Dashboard:** A landing page with high-level KPIs, including Total Inventory Value, Total Unit Count, and Total Transactions Recorded. It also features widgets for "Recent Activity" and "Low Stock Items".
  * **Product & Inventory Management:**
      * **Add Products:** Admins can create new product SKUs, setting their name, category, initial price, and starting quantity.
      * **Product List:** View all products in the inventory with a live search/filter function.
      * **Detailed View:** Click any product to see a detailed breakdown of its stock levels across different locations (e.g., Supplier, Warehouse, Retailer).
  * **Immutable Transaction Ledger:**
      * Every inventory change is a transaction (e.g., `CREATE_ITEM`, `STOCK_IN`, `STOCK_OUT`, `MOVE`).
      * Each valid transaction is permanently recorded as a block on the server-side blockchain.
      * **Full Ledger View:** Auditors and Admins can view the complete, chronological history of *all* transactions in the system.
      * **Item-Specific History:** The product detail page shows a filtered view of the blockchain, displaying *only* the transaction history for that specific item.
  * **Blockchain Integrity Verification:**
      * Admins and Auditors can trigger a server-side process to re-calculate the hash of every block and validate the entire chain's cryptographic integrity, ensuring it has not been tampered with.
      * The server can also be reset (by Admins only), clearing the blockchain and starting over with a new Genesis block.

## Tech Stack

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | HTML5 | Structured with semantic HTML and `<template>` elements for views. |
| | CSS3 / TailwindCSS | Styled with TailwindCSS utility classes and custom styles for components. |
| | Vanilla JavaScript (ES6+) | Manages all client-side logic, including DOM manipulation, API calls, and state management. |
| **Backend** | Node.js / Express.js | A robust Express.js server handles all API routes, business logic, and authentication. |
| | PostgreSQL | The primary database for storing user accounts, sessions, and the blockchain itself. |
| **Security** | `bcryptjs` | Used for securely hashing and verifying user passwords on the server. |
| | `express-session` | Manages server-side user sessions. |
| | `connect-pg-simple` | A session store that persists `express-session` data in the PostgreSQL database. |

## Project Structure

```
Lap/
├── index.html              # Main HTML file containing all <template> views
├── styles.css              # Custom CSS and Tailwind styles
├── app.js                  # Frontend app logic (DOM, event listeners, rendering)
├── core.js                 # Frontend business logic (Auth, Permissions, State)
├── config.js               # (Legacy file, logic moved to server)
│
└── bims-backend/
    ├── server.js           # The main Express.js backend server
    ├── chain-utils.js      # Core blockchain logic (hashing, block creation, validation)
    ├── seed.js             # Database seed script for default users
    ├── package.json        # Node.js project dependencies and scripts
    └── package-lock.json
```

## How It Works: System Architecture

This project uses a modern client-server model where the frontend is a "dumb" client that relies entirely on the backend for data and business logic.

### 1\. Authentication Flow

1.  A user enters their credentials in the login form.
2.  The client sends the `email` and `password` to the `POST /api/auth/login` endpoint.
3.  The server finds the user by email in the `users` table, hashes the provided password with `bcryptjs`, and compares it to the stored `password_hash`.
4.  If successful, the server creates a session for the user and stores it in the `user_sessions` database table.
5.  A secure `httpOnly` session cookie (e.g., `bims.sid`) is sent back to the client.
6.  The client stores this cookie. All future requests to the API (using `credentials: 'include'`) automatically include this cookie, authenticating the user.

### 2\. The Server-Side Blockchain

The core of the system's integrity lies in how it processes transactions. **The client *never* creates blocks.** The client only *requests* a transaction; the server validates it and creates the block.

1.  **Client Pre-Check:** A user (e.g., an Inventory Manager) tries to move 10 units. The client's `app.js` first runs the logic in `core.js`'s `processTransaction` function against its *local* inventory state to provide instant feedback (e.g., "Error: Insufficient stock").
2.  **API Request:** If the pre-check passes, the client sends *only the transaction data* (e.g., `{ txType: "MOVE", itemSku: "SKU-101", quantity: 10, ... }`) to the `POST /api/blockchain` endpoint.
3.  **Server Validation (Critical Step):** The server receives this request. It does not trust the client. It performs the following steps:
    a. Fetches the *entire* current blockchain from the PostgreSQL `blockchain` table.
    b. Rebuilds the "world state" (the complete inventory) in memory by re-playing every transaction from the Genesis block.
    c. Runs the new transaction against this server-side state using the `validateTransaction` utility.
4.  **Block Creation:**
      * If validation fails (e.g., the client's state was out of sync), the server returns a 400 Bad Request error.
      * If it succeeds, the server:
        a. Fetches the last block in the chain to get its hash.
        b. Injects the authenticated user's details (`userId`, `userName`) into the transaction.
        c. Creates a new, cryptographically-signed block using `createBlock`, which includes an index, timestamp, the transaction data, the previous hash, and its own new hash.
        d. Inserts this new block into the `blockchain` table in PostgreSQL.
5.  **Client Sync:** The server responds with the newly created block. The client then pushes this block to its local `blockchain` array and rebuilds its own inventory state using `rebuildInventoryState()`, which updates the UI automatically.

This "server-authoritative" model ensures that no invalid transaction can ever be added to the ledger, and the client is just a reflection of the server's state.

## Setup and Installation

### Prerequisites

  * [Node.js](https://nodejs.org/) (v18 or later)
  * [PostgreSQL](https://www.postgresql.org/download/)

### 1\. Database Setup

1.  Install and run PostgreSQL.
2.  Using `psql` or a GUI tool like pgAdmin, create a new database.
    ```sql
    CREATE DATABASE bims;
    ```
3.  Create a user and grant it privileges on the new database. (The app defaults to user `deep` with password `password`).
    ```sql
    CREATE USER deep WITH PASSWORD 'password';
    GRANT ALL PRIVILEGES ON DATABASE bims TO deep;
    ```
    *Note: The `users`, `blockchain`, and `user_sessions` tables will be created automatically by the server and session store on first run, but the `users` table must be seeded.*

### 2\. Backend Server

1.  Navigate to the backend directory:
    ```bash
    cd Lap/bims-backend
    ```
2.  Install the Node.js dependencies:
    ```bash
    npm install
    ```
3.  **Important:** If you used different database credentials in Step 1, update them in `Lap/bims-backend/server.js` and `Lap/bims-backend/seed.js`.
4.  Run the database seed script to create the default users:
    ```bash
    node seed.js
    ```
5.  Start the backend server:
    ```bash
    node server.js
    ```
    The server will be running at `http://127.0.0.1:3000`.

### 3\. Frontend Application

1.  The frontend is a simple static site. You can serve it using any local web server. The VS Code "Live Server" extension is a popular choice.
2.  Alternatively, use the `serve` package:
    ```bash
    # Install serve globally (if you don't have it)
    npm install -g serve

    # From the root Lap/ directory, serve the folder on port 5500
    serve -l 5500
    ```
3.  Open your browser and navigate to `http://127.0.0.1:5500`.

## Default Logins

The database seed script (`seed.js`) creates three default users. The password for all users is `password`.

  * **Admin:** `admin@bims.com`
  * **Inventory Manager:** `manager@bims.com`
  * **Auditor:** `auditor@bims.com`