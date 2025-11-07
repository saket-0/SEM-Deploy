// bims-backend/db-init.js
const createTables = async (pool) => {
    console.log('Checking for tables...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
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
        
        // This table is also needed for sessions
        await client.query(`
            CREATE TABLE IF NOT EXISTS "user_sessions" (
              "sid" varchar NOT NULL COLLATE "default",
              "sess" json NOT NULL,
              "expire" timestamptz(6) NOT NULL
            )
            WITH (OIDS=FALSE);
        `);
        // Add primary key constraint if it doesn't exist
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
        
        await client.query('COMMIT');
        console.log('Tables are ready.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error creating tables:', e);
        throw e; // Throw error to stop server start
    } finally {
        client.release();
    }
};

module.exports = { createTables };