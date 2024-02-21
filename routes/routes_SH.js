const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_SH')


router.post('/shipment_delivery', routesController.shipment_delivery_POST);

module.exports = router;