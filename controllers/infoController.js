const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { stat } = require('fs');

const getPassagesFromDB = async (book, page, version='all') => {
    const client = await pool.connect();
    try {
        let result;
        if (version === 'published') {
            result = await client.query(`
                SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.text AS english_text, translations.translation_id, books.length, passages.page_id
                FROM passages
                JOIN pages ON passages.page_id = pages.page_id
                JOIN books ON pages.book_id = books.book_id
                LEFT JOIN translations ON passages.passage_id = translations.passage_id AND translations.status = 'published'
                WHERE books.name = $1 AND pages.page_number = $2
            `, [book, page]);
        } else if (version !== 'all') {
            result = await client.query(`
                SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.text AS english_text, translations.translation_id, books.length, passages.page_id
                FROM passages
                JOIN pages ON passages.page_id = pages.page_id
                JOIN books ON pages.book_id = books.book_id
                LEFT JOIN translations ON passages.passage_id = translations.passage_id AND translations.version_name = $3
                WHERE books.name = $1 AND pages.page_number = $2
            `, [book, page, version]);
        } else {
            result = await client.query(`
                SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.text AS english_text, translations.translation_id, books.length, passages.page_id
                FROM passages
                JOIN pages ON passages.page_id = pages.page_id
                JOIN books ON pages.book_id = books.book_id
                LEFT JOIN translations ON passages.passage_id = translations.passage_id
                WHERE books.name = $1 AND pages.page_number = $2
            `, [book, page]);
        }

        return result.rows.map(row => ({
            id: row.passage_id,
            page_id: row.page_id,
            hebrew_text: row.hebrew_text,
            english_text: row.english_text || '', // Default to empty string if no translation is found
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
    const version = req.query.translation_version || 'all';
    try {
        const textObject = await getPassagesFromDB(book, page, version);
        logger.info(`Fetched page: ${textObject.length}`);
        // log ids of passages
        res.json(textObject);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching page' });
    }
};

const getPassageForComparison = async (book, page) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT passages.passage_id, passages.hebrew_text, passages.passage_number, translations.translation_id, translations.text AS english_text, translations.version_name, translations.status, books.length
            FROM passages
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
            LEFT JOIN translations ON passages.passage_id = translations.passage_id
            WHERE books.name = $1 AND pages.page_number = $2
        `, [book, page]);

        const passagesMap = {};

        result.rows.forEach(row => {
            if (!passagesMap[row.passage_id]) {
                passagesMap[row.passage_id] = {
                    id: row.passage_id,
                    hebrew_text: row.hebrew_text,
                    passage_number: row.passage_number,
                    translations: [],
                    length: row.length, 
                    status: row.status
                };
            }
            if (row.translation_id) {
                passagesMap[row.passage_id].translations.push({
                    translation_id: row.translation_id,
                    text: row.english_text,
                    version_name: row.version_name,
                    status: row.status
                });
            }
        });

        return Object.values(passagesMap);
    } catch (error) {
        logger.error('Error fetching passages from database:', error);
        throw error;
    } finally {
        client.release();
    }
};

exports.getComparisonPage = async (req, res) => {
    const book = req.query.book;
    const page = req.query.page;
    try {
        const textObject = await getPassageForComparison(book, page);
        logger.info(`Fetched page: ${textObject.length}`);
        res.json(textObject);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching page' });
    }
};

const getTranslationVersionsForBookAndPage = async (book, page) => {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT DISTINCT translations.version_name
            FROM translations
            JOIN passages ON translations.passage_id = passages.passage_id
            JOIN pages ON passages.page_id = pages.page_id
            JOIN books ON pages.book_id = books.book_id
            WHERE books.name = $1 AND pages.page_number = $2
        `, [book, page]);

        return result.rows.map(row => row.version_name);
    } catch (error) {
        logger.error('Error fetching translation versions for book and page from database:', error);
        throw error;
    } finally {
        client.release();
    }
};

exports.getTranslationVersions = async (req, res) => {
    const book = req.query.book;
    const page = req.query.page;

    if (!book || !page) {
        return res.status(400).json({ error: 'Book name and page number are required' });
    }

    try {
        const versions = await getTranslationVersionsForBookAndPage(book, page);
        logger.info(`Fetched ${versions.length} translation versions for book: ${book} and page: ${page}`);
        res.json(versions);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching translation versions' });
    }
};