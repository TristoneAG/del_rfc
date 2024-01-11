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

        const result = await funcion.sapRFC_consultaMaterial_SEM("'" + material + "'",  storage_type, storage_bin);

        if (result.length === 0) { return res.json({ "qty": 0 }); }

        const cantidad_actual = result.reduce((total, element) => total + parseInt(element.GESME.replace(".000", "")), 0);

        res.json({ "qty": cantidad_actual });
    } catch (err) {
        res.json(err);
    }
};

controller.handlingSEM_POST = async (req, res) => {
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



controller.auditoriaSEM_POST = async (req, res) => {
    try {
        let serial = req.body.serial;
        let serials_array = serial.split(",");
        let estacion = req.body.station;
        let storage_type;
        let storage_bin;
        
        const resultSL = await funcion.getStorageLocation(estacion);
        if (resultSL.length === 0) {return res.json({ key: `Storage Location not set for device "${estacion}"` });}
        let storage_location = resultSL[0].storage_location;

        if (storage_location == "0012") {
            storage_type = "102";
            storage_bin = "103";
        }
        if (storage_location == "0002") {
            storage_type = "100";
            storage_bin = "101";
        }
        let results = [];
        for (let i = 0; i < serials_array.length; i++) {
            const result = await funcion.sapRFC_transferSEMProd(serials_array[i], storage_location, storage_type, storage_bin);
            results.push(result);
        }
        res.json(results);
    } catch (err) {
        res.json(err);
    }
};

controller.getUbicacionesSEMMaterial_POST = async (req, res) => {
    try {
        let estacion = req.body.estacion
        let material = req.body.material;

        const storageLocation = await funcion.getStorageLocation(estacion);
        const storage_location = storageLocation[0].storage_location;

        const resultado = await funcion.sapRFC_consultaMaterial_ST(material, storage_location, "SEM");
        res.json(resultado);
    } catch (err) {
        res.json(err);
    }
};

controller.getUbicacionesSEMMandrel_POST = async (req, res) => {
    try {
        let estacion = req.body.estacion;
        let mandrel = req.body.mandrel;

        const storageLocation = await funcion.getStorageLocation(estacion);
        const storage_location = storageLocation[0].storage_location;

        const result = await funcion.sapFromMandrel(mandrel, "sem");

        if (result.length === 0) {
            res.json({ "key": "Check Mandrel Number" });
        } else {
            const noSap = result[0].no_sap.substring(1);
            const materialResult = await funcion.sapRFC_consultaMaterial_ST(noSap, storage_location, "SEM");
            res.json(materialResult);
        }
    } catch (err) {
        res.json(err);
    }
};

controller.getUbicacionesSEMSerial_POST = async (req, res) => {
    let estacion = req.body.estacion;
    let serial = req.body.serial;
    try {

        const storageLocation = await funcion.getStorageLocation(estacion);
        const serialResult = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial, 20));
        const storage_location = storageLocation[0].storage_location;
        if (serialResult.length === 0) {
            return res.json({ key: "Check Serial Number" });
        } else if (serialResult[0].LGORT !== storage_location) {
            return res.json({ "key": "Storage Locations do not match", "abapMsgV1": `${serial}` });
        } else {
            const materialResult = await funcion.sapRFC_consultaMaterial(serialResult[0].MATNR, storage_location);
            return res.json(materialResult);
        }
    } catch (err) {
        return res.json(err);
    }
};

controller.transferSEM_Confirmed_POST = async (req, res) => {
    let estacion = req.body.station
    let serial = req.body.serial
    let storage_bin = req.body.storage_bin.toUpperCase()
    let max_storage_unit_bin = 5

    let serials_array = serial.split(",")
    let errorsArray = [];
    let resultsArray = [];

    try {
        const result_getStorageLocation = await funcion.getStorageLocation(estacion);
        const binExists = await funcion.sapRFC_SbinOnStypeExists( "SEM", storage_bin)
        const result_consultaStorageBin = await funcion.sapRFC_consultaStorageBin(result_getStorageLocation[0].storage_location, "SEM", storage_bin);
        let serials_bin = serials_array.length + result_consultaStorageBin.length
        if (binExists.length === 0) {
            res.json([{ "key": `Storage Bin ${storage_bin} not found in Storage Type SEM`, "abapMsgV1": "ALL" }]);
        } else if (storage_bin[0] == "r" || storage_bin[0] == "R" && serials_bin > max_storage_unit_bin) {
            res.json([{ "key": `Exceeded amount of Storage Units per Bin: ${serials_bin - max_storage_unit_bin}` }]);
        } else {
            for (const serial_ of serials_array) {
                const result_consultaStorageUnit = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial_, 20));
                if (result_consultaStorageUnit.length === 0) {
                    errorsArray.push({ "key": `Check SU ${serial_}`, "abapMsgV1": `${serial_}` });
                } else if (result_consultaStorageUnit[0].LGORT !== result_getStorageLocation[0].storage_location) {
                    errorsArray.push({ "key": `SU ${serial_} is in a different storage location`, "abapMsgV1": `${serial_}` });
                } else {
                    const result = await funcion.sapRFC_transferSEM(serial_, storage_bin);
                    resultsArray.push(result);
                }
            }
            const newArray = resultsArray.concat(errorsArray);
            res.json(newArray);
        }
    } catch (err) {
        res.json(err)
    }
}

controller.getBinStatusReportSEM_POST = async (req, res) => {
    let estacion = req.body.estacion;
    let storage_bin = req.body.storage_bin;
    let storage_type = req.body.storage_type;

    try {
        const storageBinExists = await funcion.sapRFC_SbinOnStypeExists(storage_type, storage_bin);
        if (storageBinExists.length === 0) {
            res.json({ "key": `Storage Bin "${storage_bin}" does not exist at Storage Type "${storage_type}"` });
        } else {
            const resultSL = await funcion.getStorageLocation(estacion);

            if (resultSL.length === 0) {
                return res.json({ "key": `Storage Location not set for device "${estacion}"` });
            }
            const storageLocation = resultSL[0].storage_location;
            const result = await funcion.sapRFC_consultaStorageBin(storageLocation, storage_type, storage_bin);
            const info_list = result.map(element => { return { "storage_unit": parseInt(element.LENUM) }; });
            res.json({ "info_list": info_list, "error": "N/A" });


        }
    } catch (err) {
        res.json({ "error": "An error occurred" });
    }
};

controller.postCycleSUSEM_POST = async (req, res) => {
    try {
        let storage_bin = req.body.storage_bin
        let user_id = req.body.user_id
        let storage_type = req.body.storage_type
        let listed_storage_units = req.body.listed_storage_units == '' ? [] : req.body.listed_storage_units.split(",")
        let unlisted_storage_units = req.body.unlisted_storage_units == '' ? [] : req.body.unlisted_storage_units.split(",")
        let not_found_storage_units = req.body.not_found_storage_units == '' ? [] : req.body.not_found_storage_units.split(",")
        let st = ""
        let sb = ""
        let listed_storage_units_promises = []
        let unlisted_storage_units_promises = []
        let not_found_storage_units_promises = []
        let response_list = []
        let estacion = req.body.estacion

        switch (storage_type) {
            case "SEM":
                st = storage_type
                sb = "CICLICOSEM"
                break;
            default:
                res.json(JSON.stringify({ "key": `Storage Type: "${storage_type}" not configured for Cycle Control` }))
                break;
        }

        const resultSL = await funcion.getStorageLocation(estacion);

        if (resultSL.length === 0) {
            return res.json({ key: `Storage Location not set for device "${estacion}"` });
        }

        let storage_location = resultSL[0].storage_location


        if (listed_storage_units.length > 0) {
            listed_storage_units.forEach(element => {
                listed_storage_units_promises.push(funcion.dBinsert_cycle_Listed_storage_units(storage_type, storage_bin.toUpperCase(), [element], user_id)
                    .catch((err) => { return err }))
            })
        }

        if (not_found_storage_units.length > 0) {
            not_found_storage_units.forEach(element => {
                not_found_storage_units_promises.push(funcion.sapRFC_transferSlocCheck(element, storage_location, st, sb)
                    .catch((err) => { return err }))
            })

        }

        if (unlisted_storage_units.length > 0) {
            unlisted_storage_units.forEach(element => {
                unlisted_storage_units_promises.push(funcion.sapRFC_transferSlocCheck(element, storage_location, storage_type, storage_bin)
                    .catch((err) => { return err }))
            })
        }


        if (listed_storage_units.length == 0 && unlisted_storage_units.length == 0 && not_found_storage_units.length == 0) {
            funcion.dBinsert_cycle_result(storage_type, storage_bin, "", user_id, "OK-BIN", "")
        }

        for (let i = 0; i < not_found_storage_units_promises.length; i++) {
            try {
                const element = await not_found_storage_units_promises[i];
                if (element.key) {
                    response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "NOSCAN-ERROR", element.key)
                } else {
                    response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "NOSCAN", element.E_TANUM)
                }
            } catch (err) {
                // Handle error
            }
        }

        for (let i = 0; i < unlisted_storage_units_promises.length; i++) {
            try {
                const element = await unlisted_storage_units_promises[i];
                if (element.key) {
                    response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "WRONGBIN-ERROR", element.key)
                } else {
                    response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "WRONGBIN", element.E_TANUM)
                }
            } catch (err) {
                // Handle error
            }
        }

        res.json(response_list);
    } catch (err) {
        res.json(err)
    }
}

module.exports = controller;