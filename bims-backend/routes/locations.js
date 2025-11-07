// bims-backend/routes/locations.js
const express = require('express');
const router = express.Router();

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
};

module.exports = (pool) => {
    // GET (Get all locations)
    router.get('/', async (req, res) => {
        try {
            // Admins see all, others see only non-archived
            const query = (req.session.user && req.session.user.role === 'Admin')
                ? 'SELECT * FROM locations ORDER BY name'
                : 'SELECT * FROM locations WHERE is_archived = false ORDER BY name';
            const result = await pool.query(query);
            res.status(200).json(result.rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    });

    // POST (Create a new location)
    router.post('/', isAdmin, async (req, res) => {
        const { name } = req.body;
        try {
            const result = await pool.query('INSERT INTO locations (name) VALUES ($1) RETURNING *', [name]);
            res.status(201).json(result.rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ message: 'Location name already exists.' });
            res.status(500).json({ message: e.message });
        }
    });

    // PUT (Rename a location)
    router.put('/:id', isAdmin, async (req, res) => {
        const { name } = req.body;
        try {
            const result = await pool.query('UPDATE locations SET name = $1 WHERE id = $2 RETURNING *', [name, req.params.id]);
            res.status(200).json(result.rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ message: 'Location name already exists.' });
            res.status(500).json({ message: e.message });
        }
    });

    // DELETE (Archive a location)
    router.delete('/:id', isAdmin, async (req, res) => {
        try {
            await pool.query('UPDATE locations SET is_archived = true WHERE id = $1', [req.params.id]);
            res.status(204).send();
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    return router;
};