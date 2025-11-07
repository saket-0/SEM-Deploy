// bims-backend/db-init.js
const bcrypt = require('bcryptjs');

// Data from seed.js
const MOCK_USERS = [
    { employeeId: 'EMP-20251029-0001', name: 'Dr. Admin Ji', email: 'admin@bims.com', role: 'Admin' },
    { employeeId: 'EMP-20251029-0002', name: 'Manager Babu', email: 'manager@bims.com', role: 'Inventory Manager' },
    { employeeId: 'EMP-20251029-0003', name: 'Auditor Saabji', email: 'auditor@bims.com', role: 'Auditor' }
];

const MOCK_LOCATIONS = ['Supplier', 'Warehouse', 'Retailer'];
const MOCK_CATEGORIES = ['Electronics', 'Clothing', 'Groceries', 'Uncategorized'];

const initializeDatabase = async (pool) => {
    console.log('Running Database Initialization...');
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Create All Tables
        console.log('Creating tables if they do not exist...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                employee_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                role TEXT NOT NULL,
                password_hash TEXT NOT NULL
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS blockchain (
                index INTEGER PRIMARY KEY,
                timestamp TIMESTAMPTZ NOT NULL,
                transaction JSONB NOT NULL,
                previous_hash TEXT NOT NULL,
                hash TEXT NOT NULL
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                is_archived BOOLEAN DEFAULT false
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                is_archived BOOLEAN DEFAULT false
            );
        `);
        
        // await client.query(`
        //     CREATE TABLE IF NOT EXISTS "user_sessions" (
        //       "sid" varchar NOT NULL COLLATE "default",
        //       "sess" json NOT NULL,
        //       "expire" timestamptz(6) NOT NULL,
        //       CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
        //     );
        // `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS "user_sessions" (
              "sid" varchar NOT NULL COLLATE "default",
              "sess" json NOT NULL,
              "expire" timestamptz(6) NOT NULL
            )
            WITH (OIDS=FALSE);
        `);
        // Add primary key constraint ONLY if it doesn't exist
        await client.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1
                FROM   pg_constraint
                WHERE  conname = 'user_sessions_pkey'
              ) THEN
                ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
              END IF;
            END;
            $$
        `);
        
        console.log('Tables are ready.');

        // 2. Seed Users
        console.log('Seeding users...');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('password', salt);
        for (const user of MOCK_USERS) {
            await client.query(
                `INSERT INTO users (employee_id, name, email, role, password_hash)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO NOTHING;`, // ON CONFLICT ensures this is safe to run
                [user.employeeId, user.name, user.email, user.role, passwordHash]
            );
        }
        console.log('Users seeded.');

        // 3. Seed Locations
        console.log('Seeding locations...');
        for (const locName of MOCK_LOCATIONS) {
            await client.query(
                `INSERT INTO locations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;`,
                [locName]
            );
        }
        console.log('Locations seeded.');

        // 4. Seed Categories
        console.log('Seeding categories...');
        for (const catName of MOCK_CATEGORIES) {
            await client.query(
                `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;`,
                [catName]
            );
        }
        console.log('Categories seeded.');

        await client.query('COMMIT');
        console.log('Database Initialization Complete!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('CRITICAL: Database initialization failed:', e);
        throw e; // Stop the server from starting
    } finally {
        client.release();
    }
};

module.exports = { initializeDatabase };