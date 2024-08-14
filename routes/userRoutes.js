const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const editsController = require('../controllers/editsController');
const infoController = require('../controllers/infoController');

router.post('/edits', authenticateToken, editsController.submitEdit);
router.post('/ratings', authenticateToken, editsController.submitRating);
router.post('/comparisons', authenticateToken, editsController.submitComparison);
router.get('/page', authenticateToken, infoController.getPage);
router.get('/comparisonPage', authenticateToken, infoController.getComparisonPage);
router.get('/bookInfo', authenticateToken, infoController.getBookInfo);

module.exports = router;