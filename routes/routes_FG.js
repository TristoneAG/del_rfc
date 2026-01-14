const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_FG')


router.post('/MESHU', routesController.createMESHU_POST);
router.post('/MESHUMAss', routesController.createMESHUMass_POST);
router.post('/MESHURFC', routesController.createMESHURFC_POST);
router.post('/MESMaterialSearch', routesController.createMESMaterialSearch_POST);

module.exports = router;