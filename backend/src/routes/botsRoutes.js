// src/routes/botsRoutes.js — registra webhooks dos bots Evolution
// Montado via mount('', routes.bots) no index.js, vira /api/internal-bot/webhook etc.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/botsController');

router.post('/internal-bot/webhook', ctrl.internalWebhook);
router.post('/financial-bot/webhook', ctrl.financialWebhook);

module.exports = router;
