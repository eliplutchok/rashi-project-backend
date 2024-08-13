const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const ensureAdmin = require('../middlewares/ensureAdmin');
const editController = require('../controllers/editsController');
const getAllController = require('../controllers/getAllController');

router.get('/allEdits', authenticateToken, ensureAdmin, getAllController.allEdits);
router.get('/allRatings', authenticateToken, ensureAdmin, getAllController.allRatings);
router.post('/edits/publish', authenticateToken, ensureAdmin, editController.publishEdits);
router.post('/edits/approve', authenticateToken, ensureAdmin, editController.approveEdits);
router.post('/edits/reject', authenticateToken, ensureAdmin, editController.rejectEdits);
router.post('/ratings/view', authenticateToken, ensureAdmin, editController.viewRatings);
router.post('/ratings/dismiss', authenticateToken, ensureAdmin, editController.dismissRatings);



module.exports = router;