const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(user) {
    return jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

exports.login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = userResult.rows[0];

        if (!user || !(await bcrypt.compare(password, user.hashed_password))) {
            return res.status(403).json({ message: 'Incorrect username or password' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await pool.query('INSERT INTO refresh_tokens (token, username, expires_at) VALUES ($1, $2, $3)', [refreshToken, user.username, expiresAt]);

        res.json({ accessToken, refreshToken, privilege_level: user.privilege_level, user_id: user.user_id });
    } catch (error) {
        logger.error('Error during login:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.token = async (req, res) => {
    const refreshToken = req.body.token;
    if (!refreshToken) return res.sendStatus(401);

    try {
        const result = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [refreshToken]);
        if (!result.rows[0]) return res.sendStatus(403);

        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
            if (err) return res.sendStatus(403);

            const dbUser = await pool.query('SELECT * FROM users WHERE username = $1', [user.username]);
            const accessToken = generateAccessToken(dbUser.rows[0]);
            res.json({ accessToken });
        });
    } catch (error) {
        logger.error('Error during token generation:', error);
        res.sendStatus(500);
    }
};

exports.logout = async (req, res) => {
    const token = req.body.token;
    if (!token) return res.sendStatus(401);

    try {
        await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
        res.sendStatus(204);
    } catch (error) {
        logger.error('Error during logout:', error);
        res.status(500).send('Internal Server Error');
    }
};