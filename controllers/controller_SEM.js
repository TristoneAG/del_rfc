const funcion = require('../functions/functions_SEM');

const controller = {};

controller.transferSemProd_POST = async (req, res) => {
    try {
        const serial = req.body.serial;
        const estacion = req.body.station

        const resultSL = await funcion.getStorageLocation(estacion);
        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }); }
        let storage_location = resultSL[0].storage_location

        if (storage_location == "0012") {
            storage_type = "102"
            storage_bin = "103"
        }
        if (storage_location == "0002") {
            storage_type = "100"
            storage_bin = "101"
        }
        const result_consultaStorageUnit = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial, 20));
        const resultado_transferSemProd = await funcion.sapRFC_transferSemProd(funcion.addLeadingZeros(serial, 20), storage_type, storage_bin);
        const result_consulta = await funcion.sapRFC_consultaMaterial_SEM("'" + result_consultaStorageUnit[0].MATNR + "'", storage_location, "SEM");
        if (result_consulta.length === 0) {
            cantida_sap = 0
        } else {
            cantida_sap = result_consulta.reduce((total, element) => total + parseFloat(element.GESME.trim()), 0);
        }
        result_current_stock_db = await funcion.getCurrentStockSem(`P${result_consultaStorageUnit[0].MATNR}`);
        if (cantida_sap >= parseInt(result_current_stock_db[0].minimum_stock)) {
            await funcion.update_sem_current_stock(`P${result_consultaStorageUnit[0].MATNR}`, cantida_sap);
            await funcion.update_sem_current_employee(`P${result_consultaStorageUnit[0].MATNR}`);
        } else {
            await funcion.update_sem_current_stock(`P${result_consultaStorageUnit[0].MATNR}`, cantida_sap);
        }

        res.json(resultado_transferSemProd.T_LTAK[0]);
    } catch (err) {
        res.json(err);
    }
};


controller.transferProdSem_POST = async (req, res) => {
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
            to_storage_type = "SEM"
            to_storage_bin = "TEMPR_SEM"
        }
        if (storage_location === "0002") {
            from_storage_type = "100"
            from_storage_bin = "101"
            to_storage_type = "SEM"
            to_storage_bin = "TEMPR_SEM"
        }
        const transfer100 = await funcion.sapRFC_transferProdSem_1(material, qty, storage_location, from_storage_type, from_storage_bin);
        const transfer998 = await funcion.sapRFC_transferProdSem_2(material, qty, storage_location, to_storage_type, to_storage_bin);
        const result_consulta = await funcion.sapRFC_consultaMaterial_SEM("'" + material + "'", storage_location, to_storage_type);
        if (result_consulta.length === 0) {
            cantidad_sap = 0
        } else {
            cantidad_sap = result_consulta.reduce((total, element) => total + parseFloat(element.GESME.trim()), 0);
        }
        result_current_stock_db = await funcion.getCurrentStockSem(`P${material}`);
        if (cantidad_sap >= parseInt(result_current_stock_db[0].minimum_stock)) {
            await funcion.update_sem_current_stock(`P${material}`, cantidad_sap);
            await funcion.update_sem_current_employee(`P${material}`);
        } else {
            await funcion.update_sem_current_stock(`P${material}`, cantidad_sap);
        }
        res.json(transfer998.E_LTAP);
    } catch (err) {
        res.json(err);
    }
};


controller.consultaSemProductionStock_POST = async (req, res) => {
    try {
        const material = req.body.material;
        const estacion = req.body.station;

        const resultSL = await funcion.getStorageLocation(estacion);

        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }); }

        let storage_location = resultSL[0].storage_location;
        let storage_type, storage_bin;

        if (storage_location == "0012") {
            storage_type = "102";
            storage_bin = "103";
        } else if (storage_location == "0002") {
            storage_type = "100";
            storage_bin = "101";
        } else {
            return res.json({ key: `Invalid storage location "${storage_location}"` });
        }

        const result = await funcion.sapRFC_consultaMaterial_VUL("'" + material + "'", storage_location, storage_type, storage_bin);

        if (result.length === 0) { return res.json({ "qty": 0 }); }

        const cantidad_actual = result.reduce((total, element) => total + parseInt(element.GESME.replace(".000", "")), 0);

        res.json({ "qty": cantidad_actual });
    } catch (err) {
        res.json(err);
    }
};

controller.handlingSEM_POST = async (req, res) => {

    console.log(req.body);
    try {
        let station = req.body.station
        let material = req.body.material
        let cantidad = req.body.qty
        let subline = req.body.subline
        let P_material
        let _material


        const resultSL = await funcion.getStorageLocation(station);
        if (resultSL.length === 0) { return res.json({ "key": `Storage Location not set for device "${station}"` }) }
        const storageLocation = resultSL[0].storage_location;

        if (material.charAt(0) !== 'P') {
            P_material = 'P' + material;
            _material = material
        } else {
            P_material = material
            _material = material.substring(1)
        }

        const resultHU = await funcion.sapRFC_HUSEM(storageLocation, _material, cantidad)
        if (!resultHU.HUKEY) { return res.json({ "key": `Handling unit not created ` }) }

        const result_printSEM = await funcion.printLabel_SEM(station, P_material, _material, cantidad, subline, resultHU.HUKEY)
        if (result_printSEM.status !== 200) { return res.json({ "key": `Label print error check Bartender Server` }) }

        res.json(resultHU)

    } catch (err) {
        return res.json(err)
    }
}

controller.postSEM_POST = async (req, res) => {
    console.log(req.body);
    try {

        let station = req.body.station
        let serial_num = req.body.serial_num
        let material = req.body.material
        let cantidad = req.body.cantidad
        let P_material
        let _material
        let cantidad_sap


        if (material.charAt(0) !== 'P') {
            P_material = 'P' + material;
            _material = material
        } else {
            P_material = material
            _material = material.substring(1)
        }
        
        const resultSL = await funcion.getStorageLocation(station);
        if (resultSL.length === 0) { return res.json({ "key": `Storage Location not set for device "${station}"` }) }
        const storage_location = resultSL[0].storage_location;
        if (storage_location === "0012") {
            from_storage_type = "102"
            from_storage_bin = "103"
            to_storage_type = "SEM"
            to_storage_bin = "TEMPR_SEM"
        }
        if (storage_location === "0002") {
            from_storage_type = "100"
            from_storage_bin = "101"
            to_storage_type = "SEM"
            to_storage_bin = "TEMPR_SEM"
        }

        let current_stock = await funcion.getCurrentStockSem(P_material);
        if (current_stock.length === 0) { return res.json({ "key": `Material not found in current stock` }) }
        
        let resultBackflush = await funcion.backflushFG(serial_num);
        if (resultBackflush.E_RETURN.TYPE !== "S") {
            if (!resultBackflush.E_RETURN.MESSAGE.toLowerCase().includes('already posted')) {
                return res.json({ "key": `${resultBackflush.E_RETURN.MESSAGE}` })
            }
        }

        const result_consulta = await funcion.sapRFC_consultaMaterial_SEM("'" + _material + "'", storage_location, to_storage_type);
        if (result_consulta.length === 0) {
            cantidad_sap = 0
        } else {
            cantidad_sap = result_consulta.reduce((total, element) => total + parseFloat(element.GESME.trim()), 0);
        }

        if (parseInt(cantidad_sap) >= parseInt(current_stock[0].minimum_stock)) {
            await funcion.update_sem_current_stock(P_material, parseInt(cantidad_sap));
            await funcion.update_sem_current_employee(P_material);
        } else {
            await funcion.update_sem_current_stock(P_material, parseInt(cantidad_sap));
        }

        
        let resultTBNUM = await funcion.sapRFC_TBNUM(_material, cantidad)
        let resultTransfer = await funcion.sapRFC_transferSEM_TR(serial_num, cantidad, "SEM", "TEMPB_SEM", resultTBNUM[0].TBNUM);

        res.json(resultTransfer);
    } catch (err) {
        res.json(err)
    }
}

controller.reprintLabelSEM_POST = async (req, res) => {

    try {
        let station = req.body.station
        let material = req.body.material
        let cantidad = req.body.cantidad
        let subline = req.body.subline
        let serial_num = req.body.serial_num
        let P_material
        let _material

        const resultSL = await funcion.getStorageLocation(station);
        if (resultSL.length === 0) { return res.json({ "key": `Storage Location not set for device "${station}"` }) }
        const storageLocation = resultSL[0].storage_location;

        if (material.charAt(0) !== 'P') {
            P_material = 'P' + material;
            _material = material
        } else {
            P_material = material
            _material = material.substring(1)
        }

        const result_printSEM = await funcion.printLabel_SEM(station, P_material, _material, cantidad, subline, serial_num)
        if (result_printSEM.status !== 200) { return res.json({ "key": `Label print error check Bartender Server` }) }

        res.json(result_printSEM)

    } catch (err) {
        return res.json(err)
    }
}

module.exports = controller;