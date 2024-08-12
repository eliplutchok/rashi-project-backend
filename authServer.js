require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const pool = require('./db');

// Generate Access Token
function generateAccessToken(user) {
    return jwt.sign(
        user, 
        process.env.ACCESS_TOKEN_SECRET, 
        { expiresIn: '15m' }
    );
}

// Store Refresh Token
async function storeRefreshToken(token, username, expiresAt) {
    await pool.query('INSERT INTO refresh_tokens (token, username, expires_at) VALUES ($1, $2, $3)', [token, username, expiresAt]);
}

// Verify Refresh Token
async function verifyRefreshToken(token) {
    const result = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
    return result.rows[0];
}

// Delete Refresh Token
async function deleteRefreshToken(token) {
    console.log('Deleting token:', token);
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
}

// Token Route
app.post('/token', async (req, res) => {
    const refreshToken = req.body.token;
    if (refreshToken == null) return res.sendStatus(401);

    const tokenData = await verifyRefreshToken(refreshToken);
    if (!tokenData) return res.sendStatus(403);

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
        if (err) return res.sendStatus(403);

        try {
            const dbUser = await pool.query('SELECT * FROM users WHERE username = $1', [user.username]);
            const accessToken = generateAccessToken(dbUser.rows[0]);
            res.json({ accessToken: accessToken });
        } catch (error) {
            res.sendStatus(500).send('Internal Server Error');
        }
    });
});

// Logout Route
app.delete('/logout', async (req, res) => {
    const token = req.body.token;
    if (token == null) return res.sendStatus(401);

    try {
        await deleteRefreshToken(token);
        res.sendStatus(204);
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

// Signup Route (uncomment if needed)
// app.post('/users/signup', async (req, res) => {
//     try {
//         const hashedPassword = await bcrypt.hash(req.body.password, 10);
//         await pool.query('INSERT INTO users (username, hashed_password) VALUES ($1, $2)', [req.body.username, hashedPassword]);
//         res.status(201).send();
//     } catch (error) {
//         res.status(500).send('Internal Server Error');
//     }
// });

// Login Route
app.post('/users/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = userResult.rows[0];

        if (!user) {
            return res.status(400).send('Cannot find user');
        }

        if (await bcrypt.compare(password, user.hashed_password)) {
            const accessToken = generateAccessToken(user);
            const refreshToken = jwt.sign({ username: user.username, privilege_level: user.privilege_level }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            await storeRefreshToken(refreshToken, user.username, expiresAt);

            res.json({ accessToken: accessToken, refreshToken: refreshToken, privilege_level: user.privilege_level });
        } else {
            res.status(403).send('Not Allowed');
        }
    } catch (error) {
        res.status(500).send('Internal Server Error');
    }
});

app.listen(4000, () => {
    console.log('Authentication server running on port 4000');
});