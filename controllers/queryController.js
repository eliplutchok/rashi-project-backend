const axios = require('axios');
const logger = require('../config/logger');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';
const PYTHON_API_KEY = process.env.PYTHON_API_KEY;
exports.queryTalmud = async (req, res) => {
    const query = req.query.query;

    console.log("url and key", PYTHON_API_URL, PYTHON_API_KEY);

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const response = await axios.get(`${PYTHON_API_URL}/query`, {
            params: { query },
            headers: { 'X-API-Key': PYTHON_API_KEY }
        });

        logger.info(`Queried Talmud: ${query}`);
        res.json(response.data);
    } catch (error) {
        logger.error('Error querying Talmud:', error);
        res.status(500).json({ error: 'Error querying Talmud' });
    }
};

exports.submitFeedback = async (req, res) => {
    const { score, comment, run_id } = req.query;

    if (!score || !run_id) {
        return res.status(400).json({ error: 'Score and run_id are required' });
    }

    try {
        const response = await axios.get(`${PYTHON_API_URL}/feedback`, {
            params: { score, comment, run_id },
            headers: { 'X-API-Key': PYTHON_API_KEY }
        });

        logger.info(`Submitted feedback for run_id: ${run_id}`);
        res.json(response.data);
    } catch (error) {
        logger.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Error submitting feedback' });
    }
};
