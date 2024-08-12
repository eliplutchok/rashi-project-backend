require('dotenv').config();
const cors = require('cors');
const fetch = require('node-fetch');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const winston = require('winston');

const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());

const corsOptions = {
    origin: process.env.REACT_APP_URL,
    optionsSuccessStatus: 200, // For legacy browser support
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true, // Allow credentials (cookies, authorization headers, TLS client certificates)
  };
  
  app.use(cors(corsOptions));
// app.use(cors());

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

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
    console.log('Login request:', req.body);
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

// Middleware to authenticate the token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ error: 'No token provided' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

const getPageFromSefaria = async (book, page) => {
    try {
        const response_url = `${process.env.REACT_APP_PAGE_URL}${book}.${page}`;
        logger.info(`Fetching URL: ${response_url}`);
        const response = await fetch(response_url);
        const data = await response.json();

        if (data.versions && data.versions[0] && data.versions[0].text) {
            let text = data.versions[0].text;
            const flattenedText = text.flatMap(subArray => subArray);
            return flattenedText;
        } else {
            throw new Error('Unexpected response structure');
        }
    } catch (error) {
        logger.error('Error fetching page:', error);
        throw error;
    }
};

const getPassagesFromDB = async (book, page) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.text AS english_text, translations.translation_id
            FROM passages
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
            LEFT JOIN translations ON passages.passage_id = translations.passage_id AND translations.status = 'published'
            WHERE books.name = $1 AND pages.page_number = $2
        `, [book, page]);

        return result.rows.map(row => ({
            id: row.passage_id,
            hebrew_text: row.hebrew_text,
            english_text: row.english_text,
            passage_number: row.passage_number,
            translation_id: row.translation_id
        }));
    } catch (error) {
        logger.error('Error fetching passages from database:', error);
        throw error;
    } finally {
        client.release();
    }
};

app.get('/page', authenticateToken, async (req, res) => {
    const book = req.query.book;
    const page = req.query.page;
    try {
        const textObject = await getPassagesFromDB(book, page);
        logger.info(`Fetched page: ${textObject.length}`);
        res.json(textObject);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching page' });
    }
});

app.post('/edits', authenticateToken, async (req, res) => {
    const { passage_id, edited_text } = req.body;
    const user_id = req.user.user_id;
    logger.info('User ID:', user_id);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO translations (text, version_name, status, user_id, passage_id)
            VALUES ($1, $2, $3, $4, $5) RETURNING translation_id
        `;
        const result = await client.query(insertQuery, [edited_text, 'user', 'proposed', user_id, passage_id]);
        const translationId = result.rows[0].translation_id;

        await client.query('COMMIT');
        res.status(201).json({ id: translationId, message: 'Edit submitted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error submitting edit:', error);
        res.status(500).json({ error: 'Error submitting edit' });
    } finally {
        client.release();
    }
});

app.post('/ratings', authenticateToken, async (req, res) => {
    const { translation_id, rating, feedback } = req.body;
    const user_id = req.user.user_id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO ratings (user_id, translation_id, rating, feedback, status)
            VALUES ($1, $2, $3, $4, 'not viewed') RETURNING rating_id
        `;
        const result = await client.query(insertQuery, [user_id, translation_id, rating, feedback]);
        const ratingId = result.rows[0].rating_id;

        await client.query('COMMIT');
        res.status(201).json({ id: ratingId, message: 'Rating submitted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error submitting rating:', error);
        res.status(500).json({ error: 'Error submitting rating' });
    } finally {
        client.release();
    }
});

// Middleware to ensure the user is an admin
const ensureAdmin = (req, res, next) => {
    if (req.user && req.user.privilege_level === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Access denied. Admins only.' });
    }
};

app.get('/allEdits', authenticateToken, ensureAdmin, async (req, res) => {
    logger.info('Query:', req.query);
    const { book, page_number, status, username, currentPage = 1, limit = 20, fetchAll = false } = req.query;
    const offset = (currentPage - 1) * limit;
    const client = await pool.connect();

    try {
        let query = `
            SELECT translations.translation_id, translations.text, translations.notes, translations.creation_date, translations.status,
                   passages.hebrew_text, pages.page_number, passages.passage_id, books.name AS book_name, users.username
            FROM translations
            JOIN passages ON translations.passage_id = passages.passage_id
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
            JOIN users ON translations.user_id = users.user_id
        `;
        let countQuery = `
            SELECT COUNT(*) AS total
            FROM translations
            JOIN passages ON translations.passage_id = passages.passage_id
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
            JOIN users ON translations.user_id = users.user_id
        `;
        let queryParams = [];
        let countParams = [];
        let whereClauses = [];

        if (status !== 'all') {
            whereClauses.push(`translations.status = $${queryParams.length + 1}`);
            queryParams.push(status);
            countParams.push(status);
        }

        if (book) {
            logger.info('Book:', book);
            whereClauses.push(`books.name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${book}%`);
            countParams.push(`%${book}%`);
        }

        if (page_number) {
            whereClauses.push(`pages.page_number ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${page_number}%`);
            countParams.push(`%${page_number}%`);
        }

        if (username) {
            logger.info('Username:', username);
            whereClauses.push(`users.username ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${username}%`);
            countParams.push(`%${username}%`);
        }

        if (whereClauses.length > 0) {
            const whereClause = ` WHERE ` + whereClauses.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        if (!fetchAll) {
            query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
            queryParams.push(limit, offset);
        }


        const result = await client.query(query, queryParams);

        const countResult = await client.query(countQuery, countParams);

        res.json({ edits: result.rows, totalPages: Math.ceil(countResult.rows[0].total / limit) });
    } catch (error) {
        logger.error('Error fetching edits:', error);
        res.status(500).json({ error: 'Error fetching edits' });
    } finally {
        client.release();
    }
});

app.get('/allRatings', authenticateToken, ensureAdmin, async (req, res) => {
    logger.info('Query:', req.query);
    const { username, translation_status, rating_status, currentPage = 1, limit = 20, fetchAll = false } = req.query;
    const offset = (currentPage - 1) * limit;
    const client = await pool.connect();

    try {
        let query = `
        SELECT ratings.rating_id, ratings.rating, ratings.feedback, ratings.creation_date, ratings.status,
               translations.text, translations.status AS translation_status,
               passages.hebrew_text, passages.passage_id, pages.page_number, books.name AS book_name, users.username
        FROM ratings
        JOIN translations ON ratings.translation_id = translations.translation_id
        JOIN passages ON translations.passage_id = passages.passage_id
        JOIN pages ON passages.page_id = pages.page_id
        JOIN books ON pages.book_id = books.book_id
        JOIN users ON ratings.user_id = users.user_id
    `;
    let countQuery = `
        SELECT COUNT(*) AS total
        FROM ratings
        JOIN translations ON ratings.translation_id = translations.translation_id
        JOIN passages ON translations.passage_id = passages.passage_id
        JOIN pages ON passages.page_id = pages.page_id
        JOIN books ON pages.book_id = books.book_id
        JOIN users ON ratings.user_id = users.user_id
    `;
        let queryParams = [];
        let countParams = [];
        let whereClauses = [];

        if (username) {
            logger.info('Username:', username);
            whereClauses.push(`users.username ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${username}%`);
            countParams.push(`%${username}%`);
        }

        if (translation_status && translation_status !== 'all') {
            whereClauses.push(`translations.status = $${queryParams.length + 1}`);
            queryParams.push(translation_status);
            countParams.push(translation_status);
        }

        if (rating_status && rating_status !== 'all') {
            whereClauses.push(`ratings.status = $${queryParams.length + 1}`);
            queryParams.push(rating_status);
            countParams.push(rating_status);
        }

        if (whereClauses.length > 0) {
            const whereClause = ` WHERE ` + whereClauses.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        if (!fetchAll) {
            query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
            queryParams.push(limit, offset);
        }

        const result = await client.query(query, queryParams);

        const countResult = await client.query(countQuery, countParams);

        res.json({ ratings: result.rows, totalPages: Math.ceil(countResult.rows[0].total / limit) });
    } catch (error) {
        logger.error('Error fetching ratings:', error);
        res.status(500).json({ error: 'Error fetching ratings' });
    } finally {
        client.release();
    }
});

app.post('/edits/publish', authenticateToken, ensureAdmin, async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let translation_id of translation_ids) {
            // Get the passage_id of the translation being published
            const passageResult = await client.query(`
                SELECT passage_id FROM translations WHERE translation_id = $1
            `, [translation_id]);

            if (passageResult.rowCount === 0) {
                throw new Error(`Translation not found for ID: ${translation_id}`);
            }

            const passage_id = passageResult.rows[0].passage_id;

            // Set all other translations of the same passage to 'redacted'
            await client.query(`
                UPDATE translations SET status = 'redacted' 
                WHERE passage_id = $1 AND status = 'published'
            `, [passage_id]);

            // Update the translation status to published
            await client.query(`
                UPDATE translations SET status = 'published' WHERE translation_id = $1
            `, [translation_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Edits published successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error publishing edits:', error);
        res.status(500).json({ error: 'Error publishing edits' });
    } finally {
        client.release();
    }
});

app.post('/edits/approve', authenticateToken, ensureAdmin, async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let translation_id of translation_ids) {
            // Get the passage_id of the translation being approved
            const passageResult = await client.query(`
                SELECT passage_id FROM translations WHERE translation_id = $1
            `, [translation_id]);

            if (passageResult.rowCount === 0) {
                throw new Error(`Translation not found for ID: ${translation_id}`);
            }

            // Update the translation status to approved
            await client.query(`
                UPDATE translations SET status = 'approved' WHERE translation_id = $1
            `, [translation_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Edits approved successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error approving edits:', error);
        res.status(500).json({ error: 'Error approving edits' });
    } finally {
        client.release();
    }
});

app.post('/edits/reject', authenticateToken, ensureAdmin, async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let translation_id of translation_ids) {
            // Update the translation status to rejected
            await client.query(`
                UPDATE translations SET status = 'rejected' WHERE translation_id = $1
            `, [translation_id]);
        }

        await client.query('COMMIT');
        res.json({ message: 'Edits rejected successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error rejecting edits:', error);
        res.status(500).json({ error: 'Error rejecting edits' });
    } finally {
        client.release();
    }
});

app.listen(3001, () => {
    console.log('Server is running on port 3001');
    logger.info('Server is running on port 3001');
});