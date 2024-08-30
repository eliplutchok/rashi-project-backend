const pool = require('../config/database');
const logger = require('../config/logger');

// get array of passages by ids
exports.getPassagesByIds = async (req, res) => {
    const { passage_ids } = req.query;
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT passages.passage_id, passages.hebrew_text, translations.text, translations.translation_id, books.name, pages.page_number
            FROM passages
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON passages.book_id = books.book_id
            JOIN translations ON passages.passage_id = translations.passage_id
            WHERE passages.passage_id = ANY($1)
        `, [passage_ids]);
        res.json(result.rows);
    } catch (error) {
        logger.error('Error getting passages by IDs:', error);
        res.status(500).json({ error: 'Error getting passages by IDs' });
    } finally {
        client.release();
    }
};
