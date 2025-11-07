// seed.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// WARNING: Use environment variables in a real app
// const pool = new Pool({
//     user: 'deep',
//     host: 'localhost',
//     database: 'bims',
//     password: 'password',
//     port: 5432,
// });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Add this if you're using a free-tier database
    ssl: {
      rejectUnauthorized: false
    }
});

// ... after const pool = new Pool(...)

const createTables = async (client) => {
    console.log('Checking for tables...');

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

    console.log('Tables are ready.');
};

const MOCK_USERS = [
    { employeeId: 'EMP-20251029-0001', name: 'Dr. Admin Ji', email: 'admin@bims.com', role: 'Admin' },
    { employeeId: 'EMP-20251029-0002', name: 'Manager Babu', email: 'manager@bims.com', role: 'Inventory Manager' },
    { employeeId: 'EMP-20251029-0003', name: 'Auditor Saabji', email: 'auditor@bims.com', role: 'Auditor' }
];

const MOCK_LOCATIONS = [
    'Supplier',
    'Warehouse',
    'Retailer'
];

const MOCK_CATEGORIES = [
    'Electronics',
    'Clothing',
    'Groceries',
    'Uncategorized'
];

async function seedDatabase() {
    console.log('Seeding database...');
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // Start transaction
        // await createTables(client);
        
        // --- 1. Seed Users ---
        console.log('Seeding users...');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash('password', salt);

        for (const user of MOCK_USERS) {
            await client.query(
                `INSERT INTO users (employee_id, name, email, role, password_hash)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                employee_id = EXCLUDED.employee_id,
                role = EXCLUDED.role;`, // This line is now fixed
                [user.employeeId, user.name, user.email, user.role, passwordHash]
            );
        }
        console.log('Users seeded.');

        // --- 2. Seed Locations ---
        console.log('Seeding locations...');
        for (const locName of MOCK_LOCATIONS) {
            await client.query(
                `INSERT INTO locations (name) VALUES ($1)
                 ON CONFLICT (name) DO NOTHING;`,
                [locName]
            );
        }
        console.log('Locations seeded.');

        // --- 3. Seed Categories ---
        console.log('Seeding categories...');
        for (const catName of MOCK_CATEGORIES) {
            await client.query(
                `INSERT INTO categories (name) VALUES ($1)
                 ON CONFLICT (name) DO NOTHING;`,
                [catName]
            );
        }
        console.log('Categories seeded.');

        
        await client.query('COMMIT'); // Commit transaction
        console.log('Database seeded successfully!');
    } catch (e) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error('Error seeding database:', e);
    } finally {
        client.release();
        pool.end();
    }
}

seedDatabase();