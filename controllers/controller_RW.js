const funcion = require('../functions/functions_RW');

const controller = {};

controller.transfer_rework_out_POST = async (req, res) => {
    try {
        let test = req.O_body;
        const material = req.body.material;
        const qty = req.body.qty;
        const estacion = req.body.station
        let cantidad_sap

        const resultSL = await funcion.getStorageLocation(estacion);
        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }); }
        let storage_location = resultSL[0].storage_location
        if (storage_location === "0012") {
            from_storage_type = "102"
            from_storage_bin = "RETRABAJO"
            to_storage_type = "102"
            to_storage_bin = "103"
        }
        if (storage_location === "0002") {
            from_storage_type = "100"
            from_storage_bin = "RETRABAJO"
            to_storage_type = "100"
            to_storage_bin = "101"
        }
        
        const result_consulta = await funcion.sapRFC_consultaMaterial_RW(material, storage_location, from_storage_type, from_storage_bin);
        if (result_consulta.length === 0) {
            cantidad_sap = 0
        } else {
            cantidad_sap = result_consulta.reduce((total, element) => total + parseFloat(element.GESME.trim()), 0);
        }

        if (cantidad_sap < qty) {
            err = ((qty - cantidad_sap) / cantidad_sap) * 100
            return res.json({ key: `Requested amount exceeded by ${err}% of available material` });
        } else {
            const result = await funcion.sapRFC_transferMaterial_RW(material, qty, storage_location, from_storage_type, from_storage_bin, to_storage_type, to_storage_bin);
            return res.json(result);
        }

    } catch (err) {
        res.json(err);
    }
};

controller.transfer_rework_in_POST = async (req, res) => {
    try {
        const material = req.body.material;
        const qty = req.body.qty;
        const estacion = req.body.station
        let cantidad_sap

        const resultSL = await funcion.getStorageLocation(estacion);
        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }); }
        let storage_location = resultSL[0].storage_location
        if (storage_location === "0012") {
            from_storage_type = "102"
            from_storage_bin = "103"
            to_storage_type = "102"
            to_storage_bin = "RETRABAJO"
        }
        if (storage_location === "0002") {
            from_storage_type = "100"
            from_storage_bin = "101"
            to_storage_type = "100"
            to_storage_bin = "RETRABAJO"
        }
        
        const result_consulta = await funcion.sapRFC_consultaMaterial_RW(material, storage_location, from_storage_type, from_storage_bin);
        if (result_consulta.length === 0) {
            cantidad_sap = 0
        } else {
            cantidad_sap = result_consulta.reduce((total, element) => total + parseFloat(element.GESME.trim()), 0);
        }

        if (cantidad_sap < qty) {
            err = ((qty - cantidad_sap) / cantidad_sap) * 100
            return res.json({ key: `Requested amount exceeded by ${err}% of available material` });
        } else {
            const result = await funcion.sapRFC_transferMaterial_RW(material, qty, storage_location, from_storage_type, from_storage_bin, to_storage_type, to_storage_bin);
            return res.json(result);
        }

    } catch (err) {
        res.json(err);
    }
};

module.exports = controller;