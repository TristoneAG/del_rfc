const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_VUL')

// Routes used by JAVA APP's
router.post("/handlingVUL", routesController.handlingVUL_POST);
router.post("/postVUL", routesController.postVUL_POST);
router.post('/reprintLabelVUL',routesController.reprintLabelVUL_POST);
router.post('/transferVulProd', routesController.transferVulProd_POST);
router.post('/transferProdVul', routesController.transferProdVul_POST);
router.post('/consultaVulProduccionStock', routesController.consultaVulProductionStock_POST);
// Routes used by WEB APP's
router.post("/auditoriaVUL", routesController.auditoriaVUL_POST);
router.post("/getUbicacionesVULMaterial", routesController.getUbicacionesVULMaterial_POST);
router.post("/getUbicacionesVULMandrel", routesController.getUbicacionesVULMandrel_POST);
router.post("/getUbicacionesVULSerial", routesController.getUbicacionesVULSerial_POST);
router.post("/transferVUL_Confirmed", routesController.transferVUL_Confirmed_POST);
router.post("/getBinStatusReportVUL", routesController.getBinStatusReportVUL_POST);
router.post("/postCycleSUVUL", routesController.postCycleSUVUL_POST);


module.exports = router;