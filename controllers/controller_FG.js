const controller = {};
const funcion = require('../functions/functions_FG');


controller.createMESHU_POST = async (req, res) => {
    try {
        const { material, quantity, employee, station, plant, packInstruction, PACKNR, printer } = req.body;
        const result = await funcion.createMESHU(material, quantity, employee, station, plant, packInstruction, PACKNR, printer );
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json( {"error": error.message});
    }
};

module.exports = controller;



module.exports = controller;