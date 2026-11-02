'use strict';
const express = require('express');
const auth = require('../controllers/authController');
const docs = require('../controllers/documentController');
const dashboard = require('../controllers/dashboardController');
const logs = require('../controllers/logController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, resendLimiter } = require('../middleware/security');
const { upload } = require('../middleware/upload');
const passwordResetRoutes = require('./passwordResetRoutes');

const router = express.Router();

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/verify-otp', authLimiter, auth.verifyOtp);
router.post('/auth/resend-otp', resendLimiter, auth.resendOtp);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);

router.use('/password-reset', passwordResetRoutes);

router.get('/dashboard', requireAuth, dashboard.summary);
router.get('/logs', requireAuth, logs.list);

router.get('/documents', requireAuth, docs.list);
router.post('/documents', requireAuth, upload.single('file'), docs.upload);
router.get('/documents/:id/download', requireAuth, docs.download);
router.post('/documents/:id/verify', requireAuth, docs.verify);
router.delete('/documents/:id', requireAuth, docs.remove);

module.exports = router;
