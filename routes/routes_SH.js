const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_SH')


router.post('/shipment_delivery', routesController.shipment_delivery_POST);
router.post('/shipment_multiple_delivery', routesController.shipment_multiple_delivery_POST);
router.post('/shipment_delivery_print', routesController.shipment_delivery_print_POST);
module.exports = router;