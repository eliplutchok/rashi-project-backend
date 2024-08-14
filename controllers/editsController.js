const pool = require('../config/database');
const logger = require('../config/logger');

exports.submitEdit = async (req, res) => {
    const { passage_id, edited_text, notes } = req.body;
    const user_id = req.user.user_id;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO translations (text, version_name, status, user_id, passage_id, notes)
            VALUES ($1, 'user', 'proposed', $2, $3, $4) RETURNING translation_id
        `, [edited_text, user_id, passage_id, notes]);
        await client.query('COMMIT');
        res.status(201).json({ id: result.rows[0].translation_id, message: 'Edit submitted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error submitting edit:', error);
        res.status(500).json({ error: 'Error submitting edit' });
    } finally {
        client.release();
    }
};

exports.publishEdits = async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let translation_id of translation_ids) {
            const result = await client.query(`SELECT passage_id FROM translations WHERE translation_id = $1`, [translation_id]);
            if (result.rowCount === 0) throw new Error(`Translation not found for ID: ${translation_id}`);

            await client.query(`UPDATE translations SET status = 'redacted' WHERE passage_id = $1 AND status = 'published'`, [result.rows[0].passage_id]);
            await client.query(`UPDATE translations SET status = 'published' WHERE translation_id = $1`, [translation_id]);
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
};

exports.rejectEdits = async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let translation_id of translation_ids) {
            await client.query(`UPDATE translations SET status = 'rejected' WHERE translation_id = $1`, [translation_id]);
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
};

exports.approveEdits = async (req, res) => {
    const { translation_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let translation_id of translation_ids) {
            await client.query(`UPDATE translations SET status = 'approved' WHERE translation_id = $1`, [translation_id]);
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
};

exports.submitRating = async (req, res) => {
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
};

exports.viewRatings = async (req, res) => {
    const { rating_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let rating_id of rating_ids) {
            await client.query(`UPDATE ratings SET status = 'viewed' WHERE rating_id = $1`, [rating_id]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Ratings viewed successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error viewing ratings:', error);
        res.status(500).json({ error: 'Error viewing ratings' });
    } finally {
        client.release();
    }
};

exports.dismissRatings = async (req, res) => {
    const { rating_ids } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let rating_id of rating_ids) {
            await client.query(`UPDATE ratings SET status = 'dismissed' WHERE rating_id = $1`, [rating_id]);
        }
        await client.query('COMMIT');
        res.json({ message: 'Ratings dismissed successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error dismissing ratings:', error);
        res.status(500).json({ error: 'Error dismissing ratings' });
    } finally {
        client.release();
    }
};

exports.submitComparison = async (req, res) => {
    const { translation_one_id, translation_two_id, rating, version_name, status, notes } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            INSERT INTO comparisons (translation_one_id, translation_two_id, rating, version_name, status, notes)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING comparison_id
        `, [translation_one_id, translation_two_id, rating, version_name, status, notes]);
        await client.query('COMMIT');
        res.status(201).json({ id: result.rows[0].comparison_id, message: 'Comparison submitted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error submitting comparison:', error);
        res.status(500).json({ error: 'Error submitting comparison' });
    } finally {
        client.release();
    }
};