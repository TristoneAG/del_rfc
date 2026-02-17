const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_EXCEL')

// Routes used by EXCEL APP's
// Rutas control de gastos
router.post("/RFC_REQUISITION", routesController.RFC_REQUISITION_POST);
router.post("/RFC_PO", routesController.RFC_PO_POST);
router.post("/RFC_VENDOR", routesController.RFC_VENDOR_POST);
router.post("/RFC_ACCOUNT", routesController.RFC_ACCOUNT_POST);
// Rutas logistica
router.post("/L_TO_CREATE_SINGLE", routesController.L_TO_CREATE_SINGLE_POST);
router.post("/RFC_MB1A", routesController.RFC_MB1A_POST);
router.post("/RFC_MB1A_711_712", routesController.RFC_MB1A_711_712_POST);



module.exports = router;