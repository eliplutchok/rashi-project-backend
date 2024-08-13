// Middleware to ensure the user is an admin
const ensureAdmin = (req, res, next) => {
    if (req.user && req.user.privilege_level === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Admins only.' });
    }
};

module.exports = ensureAdmin;