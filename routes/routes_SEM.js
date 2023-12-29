const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_SEM')


router.post('/transferSemProd', routesController.transferSemProd_POST);
router.post('/transferProdSem', routesController.transferProdSem_POST);
router.post('/consultaSemProduccionStock', routesController.consultaSemProductionStock_POST);
router.post("/handlingSEM", routesController.handlingSEM_POST);
router.post("/postSEM", routesController.postSEM_POST);
router.post('/reprintLabelSEM',routesController.reprintLabelSEM_POST);

module.exports = router;