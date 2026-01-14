const controller = {};
const funcion = require('../functions/functions_FG');


controller.createMESHU_POST = async (req, res) => {
    try {
        const { material, quantity, employee, station, plant, packInstruction, PACKNR, printer } = req.body;
        const result = await funcion.createMESHU(material, quantity, employee, station, plant, packInstruction, PACKNR, printer );
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json( {"error": error.message || error});
    }
};

controller.createMESHUMass_POST = async (req, res) => {
    try {
        const { employee_id, station, plant, packInstruction, printer, labels } = req.body;
        const result = await funcion.createMESHUMass( employee_id, station, plant, packInstruction, printer, labels );
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json( {"error": error.message || error});
    }
};

controller.createMESHURFC_POST = async (req, res) => {
    try {
        const { material, quantity, employee_id, station, plant_code, packInstruction, packnr, printer } = req.body;
        const result = await funcion.createMESHURFC(material, quantity, employee_id, station, plant_code, packInstruction, packnr, printer );
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json( {"error": error.message || error});
    }
};

controller.createMESMaterialSearch_POST = async (req, res) => {
    try {
        const { material, plant } = req.body;
        const result = await funcion.createMESMaterialSearch(material, plant);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json( {"error": error.message || error});
    }
};

module.exports = controller;



module.exports = controller;