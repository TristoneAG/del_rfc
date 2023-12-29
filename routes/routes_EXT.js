const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_EXT')


router.post("/handlingEXT", routesController.handlingEXT_POST);
router.post("/transferEXTRP", routesController.transferEXTRP_POST);
router.post('/transferEXTPR',routesController.transferEXTPR_POST);
router.post('/auditoriaEXT', routesController.auditoriaEXT_POST);
router.post('/getUbicacionesEXTMandrel', routesController.getUbicacionesEXTMandrel_POST);
router.post('/getUbicacionesEXTSerial', routesController.getUbicacionesEXTSerial_POST);
router.post('/postSerialesEXT', routesController.postSerialsEXT_POST);
router.post("/getBinStatusReportEXT", routesController.getBinStatusReportEXT_POST);
router.post("/postCycleSUEXT", routesController.postCycleSUEXT_POST);
router.post("/backflushEXT", routesController.backflushEXT_POST);

module.exports = router;