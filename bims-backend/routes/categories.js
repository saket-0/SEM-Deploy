// bims-backend/routes/categories.js
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
    // GET (Get all categories)
    router.get('/', async (req, res) => {
        try {
            // Admins see all, others see only non-archived
            const query = (req.session.user && req.session.user.role === 'Admin')
                ? 'SELECT * FROM categories ORDER BY name'
                : 'SELECT * FROM categories WHERE is_archived = false ORDER BY name';
            const result = await pool.query(query);
            res.status(200).json(result.rows);
        } catch (e) { res.status(500).json({ message: e.message }); }
    });

    // POST (Create a new category)
    router.post('/', isAdmin, async (req, res) => {
        const { name } = req.body;
        try {
            const result = await pool.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]);
            res.status(201).json(result.rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ message: 'Category name already exists.' });
            res.status(500).json({ message: e.message });
        }
    });

    // PUT (Rename a category)
    router.put('/:id', isAdmin, async (req, res) => {
        const { name } = req.body;
        try {
            const result = await pool.query('UPDATE categories SET name = $1 WHERE id = $2 RETURNING *', [name, req.params.id]);
            res.status(200).json(result.rows[0]);
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ message: 'Category name already exists.' });
            res.status(500).json({ message: e.message });
        }
    });

    // DELETE (Archive a category)
    router.delete('/:id', isAdmin, async (req, res) => {
        try {
            await pool.query('UPDATE categories SET is_archived = true WHERE id = $1', [req.params.id]);
            res.status(204).send();
        } catch (e) { res.status(500).json({ message: e.message }); }
    });
    return router;
};