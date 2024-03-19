const express = require('express');
const router = express.Router();
const routesController = require('../controllers/controller_FG')


router.post('/MESHU', routesController.createMESHU_POST);

module.exports = router;