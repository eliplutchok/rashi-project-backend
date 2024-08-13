const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const getPassagesFromDB = async (book, page) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.text AS english_text, translations.translation_id, books.length
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
            translation_id: row.translation_id,
            length: row.length
        }));
    } catch (error) {
        logger.error('Error fetching passages from database:', error);
        throw error;
    } finally {
        client.release();
    }
};

exports.getBookInfo = async (req, res) => {
    const book = req.query.book;
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT * FROM books WHERE name = $1
        `, [book]);
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error fetching book info:', error);
        res.status(500).json({ error: 'Error fetching book info' });
    } finally {
        client.release();
    }
};

exports.getPage = async (req, res) => {
    const book = req.query.book;
    const page = req.query.page;
    try {
        const textObject = await getPassagesFromDB(book, page);
        logger.info(`Fetched page: ${textObject.length}`);
        res.json(textObject);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching page' });
    }
};