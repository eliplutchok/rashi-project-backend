const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const editsController = require('../controllers/editsController');
const infoController = require('../controllers/infoController');
const progressController = require('../controllers/progressController');
const passagesController = require('../controllers/passagesController');
const queryController = require('../controllers/queryController');

router.post('/edits', authenticateToken, editsController.submitEdit);
router.post('/ratings', authenticateToken, editsController.submitRating);
router.post('/comparisons', authenticateToken, editsController.submitComparison);

router.get('/page', authenticateToken, infoController.getPage);
router.get('/comparisonPage', authenticateToken, infoController.getComparisonPage);
router.get('/bookInfo', authenticateToken, infoController.getBookInfo);
router.get('/getTranslationVersions', authenticateToken, infoController.getTranslationVersions);

router.get('/getReadingProgress', authenticateToken, progressController.getReadingProgress);
router.post('/updateReadingProgress', authenticateToken, progressController.updateReadingProgress);

router.get('/getPassagesByIds', authenticateToken, passagesController.getPassagesByIds);

// New routes for queryController
router.get('/queryTalmud', authenticateToken, queryController.queryTalmud);
router.get('/submitFeedback', authenticateToken, queryController.submitFeedback);

module.exports = router;