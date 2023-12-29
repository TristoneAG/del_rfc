const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_RW')


router.post('/transfer_rework_out', routesController.transfer_rework_out_POST);
router.post('/transfer_rework_in', routesController.transfer_rework_in_POST);
// router.post('/consultaSemProduccionStock', routesController.consultaSemProductionStock_POST);
// router.post("/handlingSEM", routesController.handlingSEM_POST);
// router.post("/postSEM", routesController.postSEM_POST);
// router.post('/reprintLabelSEM',routesController.reprintLabelSEM_POST);

module.exports = router;