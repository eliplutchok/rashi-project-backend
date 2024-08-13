const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/token', authController.token);
router.delete('/logout', authController.logout);

module.exports = router;