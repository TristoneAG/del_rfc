const controller = {};
const funcion = require('../functions/functions_EXCEL');


controller.RFC_REQUISITION_POST = async (req, res) => {
    try {
        const { requisition_number, requisition_item } = req.body;
        const result = await funcion.RFC_REQUISITION(requisition_number, requisition_item);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.RFC_PO_POST = async (req, res) => {
    try {
        const { po_number, po_item } = req.body;
        const result = await funcion.RFC_PO(po_number, po_item);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.RFC_VENDOR_POST = async (req, res) => {
    try {
        const { vendor_number } = req.body;
        const result = await funcion.RFC_VENDOR(vendor_number);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.RFC_ACCOUNT_POST = async (req, res) => {
    try {
        const { requisition_number, requisition_item } = req.body;
        const result = await funcion.RFC_ACCOUNT(requisition_number, requisition_item);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.L_TO_CREATE_SINGLE_POST = async (req, res) => {
    try {
        const params = req.body;
        const result = await funcion.L_TO_CREATE_SINGLE(params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.RFC_MB1A_POST = async (req, res) => {
    try {
        const { scrap_material, header, scrap_reason, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date } = req.body;
        
        const result = await funcion.RFC_MB1A(scrap_material, header, scrap_reason, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};

controller.RFC_MB1A_711_712_POST = async (req, res) => {
    try {
        const { scrap_material, header, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date, movement_type } = req.body;
        
        const result = await funcion.RFC_MB1A_711_712(scrap_material, header, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date, movement_type);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ "error": error.message || error });
    }
};




module.exports = controller;
