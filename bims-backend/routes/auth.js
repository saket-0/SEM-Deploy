const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Middleware just for this route file
const isAuthenticated = (req, res, next) => {
    console.log('Auth Check - User:', req.session.user ? req.session.user.email : 'MISSING');
    
    if (req.session.user) {
        next(); // User is logged in, continue
    } else {
        console.log('❌ Authentication failed - no user in session');
        res.status(401).json({ message: 'Not authenticated' });
    }
};

// Export a function that takes the db pool
module.exports = (pool) => {
    
    // POST /api/auth/login
    router.post('/login', async (req, res) => {
        console.log('\n🔐 LOGIN ATTEMPT');
        const { email, password } = req.body;
        
        try {
            const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = result.rows[0];

            if (!user) {
                console.log('❌ User not found:', email);
                return res.status(404).json({ message: 'User not found' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                console.log('❌ Invalid password for:', email);
                return res.status(400).json({ message: 'Invalid password' });
            }
            
            const userForSession = {
                id: user.id,
                employee_id: user.employee_id,
                name: user.name,
                email: user.email,
                role: user.role
            };
            
            req.session.user = userForSession;
            
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error:', err);
                    return res.status(500).json({ message: 'Failed to save session' });
                }
                console.log('✅ Login successful');
                console.log('Session ID:', req.sessionID);
                console.log('User:', userForSession.email);
                console.log('Role:', userForSession.role);
                
                res.status(200).json({ 
                    message: 'Login successful', 
                    user: userForSession 
                });
            });
            
        } catch (e) {
            console.error('❌ Login error:', e);
            res.status(500).json({ message: e.message });
        }
    });

    // GET /api/auth/me (Check session)
    router.get('/me', isAuthenticated, (req, res) => {
        console.log('✅ Session valid for:', req.session.user.name);
        res.status(200).json(req.session.user);
    });

    // POST /api/auth/logout
    router.post('/logout', (req, res) => {
        console.log('🚪 Logout request');
        req.session.destroy((err) => {
            if (err) {
                console.error('❌ Logout error:', err);
                return res.status(500).json({ message: 'Could not log out' });
            }
            res.clearCookie('bims.sid');
            console.log('✅ Logout successful');
            res.status(200).json({ message: 'Logout successful' });
        });
    });
    
    // Return the router
    return router;
};