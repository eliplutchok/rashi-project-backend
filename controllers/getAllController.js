const pool = require('../config/database');
const logger = require('../config/logger');

exports.allEdits = async (req, res) => {
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
};

exports.allRatings = async (req, res) => {
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
};