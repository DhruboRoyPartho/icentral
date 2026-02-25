const express = require('express');
const router = express.Router();
const {signup, login} = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', (req, res) => {});

module.exports = router;