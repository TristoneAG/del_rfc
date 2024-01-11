const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_SEM')

// Routes used by JAVA APP's
router.post("/handlingSEM", routesController.handlingSEM_POST);
router.post("/postSEM", routesController.postSEM_POST);
router.post('/reprintLabelSEM',routesController.reprintLabelSEM_POST);
router.post('/transferSemProd', routesController.transferSemProd_POST);
router.post('/transferProdSem', routesController.transferProdSem_POST);
router.post('/consultaSemProduccionStock', routesController.consultaSemProductionStock_POST);
// Routes used by WEB APP's
router.post("/auditoriaSEM", routesController.auditoriaSEM_POST);
router.post("/getUbicacionesSEMMaterial", routesController.getUbicacionesSEMMaterial_POST);
router.post("/getUbicacionesSEMMandrel", routesController.getUbicacionesSEMMandrel_POST);
router.post("/getUbicacionesSEMSerial", routesController.getUbicacionesSEMSerial_POST);
router.post("/transferSEM_Confirmed", routesController.transferSEM_Confirmed_POST);
router.post("/getBinStatusReportSEM", routesController.getBinStatusReportSEM_POST);
router.post("/postCycleSUSEM", routesController.postCycleSUSEM_POST);

module.exports = router;