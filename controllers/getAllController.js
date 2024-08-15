const pool = require('../config/database');
const logger = require('../config/logger');

exports.allEdits = async (req, res) => {
    logger.info('Query:', req.query);
    const { book, page_number, status, username, version_name, currentPage = 1, limit = 20, fetchAll = false, sortField = 'creation_date', sortOrder = 'asc' } = req.query;
    const offset = (currentPage - 1) * limit;
    const client = await pool.connect();

    try {
        let query = `
            SELECT translations.translation_id, translations.text, translations.notes, translations.creation_date, translations.status, translations.version_name,
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

        if (version_name) {
            logger.info('Version Name:', version_name);
            whereClauses.push(`translations.version_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${version_name}%`);
            countParams.push(`%${version_name}%`);
        }

        if (whereClauses.length > 0) {
            const whereClause = ` WHERE ` + whereClauses.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        // Add sorting to the query
        const validSortFields = ['book_name', 'page_number', 'text', 'creation_date', 'status', 'username', 'notes', 'hebrew_text', 'version_name'];
        if (validSortFields.includes(sortField)) {
            if (sortField === 'page_number') {
                query += `
                    ORDER BY
                    CAST(regexp_replace(page_number, '[^0-9]', '', 'g') AS INTEGER) ${sortOrder === 'desc' ? 'DESC' : 'ASC'},
                    CASE
                        WHEN page_number ~ 'a$' THEN 0
                        WHEN page_number ~ 'b$' THEN 1
                        ELSE 2
                    END ${sortOrder === 'desc' ? 'DESC' : 'ASC'}
                `;
            } else {
                query += ` ORDER BY ${sortField} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
            }
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
    const { username, translation_status, rating_status, version_name, currentPage = 1, limit = 20, fetchAll = false, sortField = 'creation_date', sortOrder = 'asc' } = req.query;
    const offset = (currentPage - 1) * limit;
    const client = await pool.connect();

    try {
        let query = `
            SELECT ratings.rating_id, ratings.rating, ratings.feedback, ratings.creation_date, ratings.status,
                   translations.text, translations.status AS translation_status, translations.version_name,
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

        if (version_name) {
            logger.info('Version Name:', version_name);
            whereClauses.push(`translations.version_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${version_name}%`);
            countParams.push(`%${version_name}%`);
        }

        if (whereClauses.length > 0) {
            const whereClause = ` WHERE ` + whereClauses.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        // Add sorting to the query
        const validSortFields = ['book_name', 'page_number', 'text', 'creation_date', 'status', 'username', 'feedback', 'hebrew_text', 'rating', 'version_name'];
        if (validSortFields.includes(sortField)) {
            query += ` ORDER BY ${sortField} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
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

exports.allComparisons = async (req, res) => {
    logger.info('Query:', req.query);
    const { translation_one_id, translation_two_id, version_name, status, currentPage = 1, limit = 20, fetchAll = false, sortField = 'comparison_id', sortOrder = 'asc' } = req.query;
    const offset = (currentPage - 1) * limit;
    const client = await pool.connect();

    try {
        let query = `
            SELECT comparisons.comparison_id, comparisons.rating, comparisons.status, comparisons.notes, comparisons.version_name,
                   t1.translation_id AS translation_one_id, t1.text AS translation_one_text, t1.notes AS translation_one_notes, t1.creation_date AS translation_one_creation_date, t1.status AS translation_one_status, t1.version_name AS translation_one_version_name,
                   t2.translation_id AS translation_two_id, t2.text AS translation_two_text, t2.notes AS translation_two_notes, t2.creation_date AS translation_two_creation_date, t2.status AS translation_two_status, t2.version_name AS translation_two_version_name,
                   passages.hebrew_text, passages.passage_id, pages.page_number, books.name AS book_name
            FROM comparisons
            JOIN translations t1 ON comparisons.translation_one_id = t1.translation_id
            JOIN translations t2 ON comparisons.translation_two_id = t2.translation_id
            JOIN passages ON t1.passage_id = passages.passage_id
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
        `;
        let countQuery = `
            SELECT COUNT(*) AS total
            FROM comparisons
            JOIN translations t1 ON comparisons.translation_one_id = t1.translation_id
            JOIN translations t2 ON comparisons.translation_two_id = t2.translation_id
            JOIN passages ON t1.passage_id = passages.passage_id
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
        `;
        let queryParams = [];
        let countParams = [];
        let whereClauses = [];

        if (translation_one_id) {
            whereClauses.push(`comparisons.translation_one_id = $${queryParams.length + 1}`);
            queryParams.push(translation_one_id);
            countParams.push(translation_one_id);
        }

        if (translation_two_id) {
            whereClauses.push(`comparisons.translation_two_id = $${queryParams.length + 1}`);
            queryParams.push(translation_two_id);
            countParams.push(translation_two_id);
        }

        if (version_name) {
            logger.info('Version Name:', version_name);
            whereClauses.push(`comparisons.version_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${version_name}%`);
            countParams.push(`%${version_name}%`);
        }

        if (status !== 'all') {
            whereClauses.push(`comparisons.status = $${queryParams.length + 1}`);
            queryParams.push(status);
            countParams.push(status);
        }

        if (whereClauses.length > 0) {
            const whereClause = ` WHERE ` + whereClauses.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        // Add sorting to the query
        const validSortFields = ['comparison_id', 'rating', 'version_name', 'status'];
        if (validSortFields.includes(sortField)) {
            query += ` ORDER BY ${sortField} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
        }

        if (!fetchAll) {
            query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
            queryParams.push(limit, offset);
        }

        const result = await client.query(query, queryParams);
        const countResult = await client.query(countQuery, countParams);

        res.json({ comparisons: result.rows, totalPages: Math.ceil(countResult.rows[0].total / limit) });
    } catch (error) {
        logger.error('Error fetching comparisons:', error);
        res.status(500).json({ error: 'Error fetching comparisons' });
    } finally {
        client.release();
    }
};