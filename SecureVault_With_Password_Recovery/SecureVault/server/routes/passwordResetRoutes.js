'use strict';
const express = require('express');
const controller = require('../controllers/passwordResetController');
const { authLimiter, resendLimiter } = require('../middleware/security');

const router = express.Router();
router.post('/request', authLimiter, controller.request);
router.post('/resend', resendLimiter, controller.resend);
router.post('/verify', authLimiter, controller.verify);
router.post('/confirm', authLimiter, controller.confirm);
module.exports = router;
