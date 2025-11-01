const express = require('express');
const router = express.Router();
const { createReceipt } = require('../controllers/receiptController');

router.post('/', createReceipt);

module.exports = router;
