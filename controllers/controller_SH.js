const funcion = require('../functions/functions_SH');

const controller = {};

controller.shipment_delivery_POST = async (req, res) => {
    try {
        const {delivery, stock, embarque} = req.body;
        const result = await funcion.shipment_delivery(delivery, stock, embarque);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json(error);
    }
};

controller.shipment_multiple_delivery_POST = async (req, res) => {
    try {
        const {delivery, stock, embarque} = req.body;
        const result = await funcion.shipment_multiple_delivery(delivery, stock, embarque);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json(error);
    }
};

controller.shipment_delivery_print_POST = async (req, res) => {
    try {
        const {delivery, emp_num, printer} = req.body;
        const result = await funcion.shipment_delivery_print(delivery, emp_num, printer);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json(error);
    }
};


module.exports = controller;