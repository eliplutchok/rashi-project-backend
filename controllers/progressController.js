const pool = require('../config/database');
const logger = require('../config/logger');

const updateReadingProgress = async (userId, bookId, lastReadPageId, lastReadPassageId) => {
  const client = await pool.connect();
  try {
    // console.log('Updating reading progress:', userId, bookId, lastReadPageId, lastReadPassageId);
    await client.query(`
      INSERT INTO reading_progress (user_id, book_id, last_read_page, last_read_passage)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, book_id) DO UPDATE 
      SET last_read_page = EXCLUDED.last_read_page, last_read_passage = EXCLUDED.last_read_passage, updated_at = CURRENT_TIMESTAMP
    `, [userId, bookId, lastReadPageId, lastReadPassageId]);
  } catch (error) {
    logger.error('Error updating reading progress:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getReadingProgress = async (userId, bookId = null) => {
    const client = await pool.connect();
    try {
      const query = bookId
        ? `
          SELECT rp.book_id, b.name AS book_name, p.page_number, rp.last_read_passage
          FROM reading_progress rp
          JOIN books b ON rp.book_id = b.book_id
          JOIN pages p ON rp.last_read_page = p.page_id
          WHERE rp.user_id = $1 AND rp.book_id = $2
          ORDER BY rp.updated_at DESC
          LIMIT 1
        `
        : `
          SELECT rp.book_id, b.name AS book_name, p.page_number, rp.last_read_passage
          FROM reading_progress rp
          JOIN books b ON rp.book_id = b.book_id
          JOIN pages p ON rp.last_read_page = p.page_id
          WHERE rp.user_id = $1
          ORDER BY rp.updated_at DESC
          LIMIT 1
        `;
  
      const values = bookId ? [userId, bookId] : [userId];
      const result = await client.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching reading progress:', error);
      throw error;
    } finally {
      client.release();
    }
  };

exports.updateReadingProgress = async (req, res) => {
  const { userId, bookId, lastReadPageId, lastReadPassageId } = req.body;
  try {
    await updateReadingProgress(userId, bookId, lastReadPageId, lastReadPassageId);
    res.status(200).send('Reading progress updated successfully');
  } catch (error) {
    res.status(500).send('Error updating reading progress');
  }
};

exports.getReadingProgress = async (req, res) => {
    const { userId, bookId } = req.query;
    try {
      const progress = await getReadingProgress(userId, bookId);
      res.status(200).json(progress);
    } catch (error) {
      res.status(500).send('Error fetching reading progress');
    }
  };