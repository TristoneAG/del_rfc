const funcion = require('../functions/functions_EXT');

const controller = {};

controller.handlingEXT_POST = async (req, res) => {
    console.log(req.body);
    try {
        let station = req.body.station
        let plan_id = req.body.plan_id
        let serial_num = req.body.serial_num
        let process = req.body.process
        let material = req.body.material
        let cantidad = req.body.cantidad
        let capacidad = req.body.capcacidad
        let numero_etiquetas = req.body.numero_etiquetas
        let line = req.body.line
        let impresoType = req.body.impresoType
        let operator_name = req.body.operator_name
        let operator_id = req.body.operator_id
        let processedResults = [];

        const resultSL = await funcion.getStorageLocation(station);
        if (resultSL.length === 0) { return res.json({ "key": `Storage Location not set for device "${station}"` }) }
        const storageLocation = resultSL[0].storage_location;


        for (let i = 0; i < numero_etiquetas; i++) {
            const resultHU = await funcion.sapRFC_HUEXT(storageLocation, material, cantidad)


            const labelData = await funcion.getPrinter(station);
            const materialResult = await funcion.materialEXT(material);

            const data = {
                printer: labelData[0].impre,
                no_sap: materialResult[0].no_sap,
                description: materialResult[0].description,
                cust_part: materialResult[0].cust_part,
                platform: materialResult[0].platform,
                rack: materialResult[0].rack,
                family: materialResult[0].family,
                length: materialResult[0].length,
                line: line,
                emp_num: operator_name,
                quant: cantidad,
                serial: parseInt(resultHU.HUKEY)
            };

            let printedLabel = await funcion.printLabel_EXT(data, "EXT")

            if (printedLabel.status === 200) {
                let result_update_plan_ext = await funcion.update_plan_ext(plan_id)
                let result_update_print_ext = await funcion.update_print_ext(parseInt(resultHU.HUKEY), plan_id, material, operator_id, cantidad, impresoType)
            } else {
                return res.json({ "key": `Testr` })
            }

            processedResults.push(resultHU);


        }

        res.json(processedResults)

    } catch (err) {
        res.json(err)
    }
}


controller.transferEXTRP_POST = async (req, res) => {

    let serial = req.body.serial
    let serials_array = serial.split(",")
    let promises = []
    let estacion = req.body.station;
    let errorsArray = [];
    let storage_type = ""
    let storage_bin = ""

    let resultEstacion = await funcion.getStorageLocation(estacion)
    let storage_location = resultEstacion[0].storage_location

    if (storage_location == "0012") {
        storage_type = "102"
        storage_bin = "GREEN"
    }
    if (storage_location == "0002") {
        storage_type = "100"
        storage_bin = "101"
    }

    const innerPromises = serials_array.map(async (serial_) => {
        let resultConsultaserial = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial_, 20))
        if (resultConsultaserial.length == 0) {
            errorsArray.push({ "key": `Check Serial Number not found`, "abapMsgV1": `${serial_}` })
        } else if (resultConsultaserial[0].LGTYP !== "EXT" || resultConsultaserial[0].LGORT !== storage_location) {
            errorsArray.push({ "key": `Check SU SType: ${resultConsultaserial[0].LGTYP}, SLocation: ${resultConsultaserial[0].LGORT}`, "abapMsgV1": `${serial_}` })
        } else {
            let resultTransferEXTRP = await funcion.sapRFC_transferExtRP(serial_, storage_type, storage_bin)
            promises.push(resultTransferEXTRP)
        }
    });

    await Promise.all(innerPromises);
    await Promise.all(promises);

    const newArray = promises.concat(errorsArray);
    res.json(newArray);
}


controller.transferEXTPR_POST = async (req, res) => {

    let material = req.body.material
    let cantidad = req.body.cantidad
    let cantidad_actual = 0
    let estacion = req.body.station
    let operador_name = req.body.operador_name

    let resultEstacion = await funcion.getStorageLocation(estacion)
    let storage_location = resultEstacion[0].storage_location

    if (storage_location == "0012") {
        storage_type = "102"
        storage_bin = "GREEN"
    }
    if (storage_location == "0002") {
        storage_type = "100"
        storage_bin = "101"
    }
    const materialData = await funcion.sapRFC_consultaMaterial_EXT(material, storage_location, storage_type, storage_bin);

    if (materialData.length === 0) {
        res.json({ key: "No Material available at selected location" });
    } else {
        let cantidad_actual = 0;
        materialData.forEach(element => {
            cantidad_actual += parseInt(element.GESME.replace(".000", ""));
        });

        if (cantidad_actual < parseInt(cantidad)) {
            const percentageExceeded = Math.round(
                ((parseInt(cantidad) - cantidad_actual) / cantidad_actual) * 100
            );
            res.json({
                key: `Requested amount exceeded by ${percentageExceeded}% of available material`
            });
        } else {
            const materialResult = await funcion.materialEXT(material);
            if (materialResult.length === 0) { return res.json({ key: "Material not found in Database" }) }
            const transferResult1 = await funcion.sapRFC_transferEXTPR_1(material, cantidad, storage_location, storage_type, storage_bin);
            const transferResult2 = await funcion.sapRFC_transferEXTPR_2(material, cantidad, storage_location);
            const labelData = await funcion.getPrinter(estacion);

            const data = {
                printer: labelData[0].impre,
                no_sap: materialResult[0].no_sap,
                description: materialResult[0].description,
                cust_part: materialResult[0].cust_part,
                platform: materialResult[0].platform,
                rack: materialResult[0].rack,
                family: materialResult[0].family,
                length: materialResult[0].length,
                emp_num: operador_name,
                quant: cantidad,
                serial: parseInt(transferResult2.E_LTAP.NLENR)
            };

            await funcion.printLabelTRA(data, "EXT_RE");

            res.json(transferResult2.E_LTAP);
        }
    }
}


controller.auditoriaEXT_POST = async (req, res) => {
    try {
        let serial = req.body.serial
        let serials_array = serial.split(",")
        let estacion = req.body.station
        let storage_type
        let storage_bin
        const resultSL = await funcion.getStorageLocation(estacion);

        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }) }

        let storage_location = resultSL[0].storage_location

        if (storage_location == "0012") {
            storage_type = "102"
            storage_bin = "GREEN"
        }
        if (storage_location == "0002") {
            storage_type = "100"
            storage_bin = "101"
        }

        const promises = serials_array.map(serial_ =>
            funcion.sapRFC_transferEXTProd(serial_, storage_location, storage_type, storage_bin)
                .catch(error => ({ serial: serial_, error })) // Wrap errors in an object
        );

        const results = await Promise.all(promises);
        res.json(results)
    } catch (err) {
        res.json(err);
    }
}

controller.getUbicacionesEXTMandrel_POST = async (req, res) => {
    try {
        const estacion = req.body.station;
        const mandrel = req.body.mandrel;
        const proceso = req.body.proceso;
        const user_id = req.body;

        const storageLocation = await funcion.getStorageLocation(estacion);
        const storage_location = storageLocation[0].storage_location;

        const result = await funcion.sapFromMandrel(mandrel, "extr");

        if (result.length === 0) {
            return res.json({ key: "Check Mandrel Number" });
        } else {
            const materialResult = await funcion.sapRFC_consultaMaterial_ST(result[0].no_sap, storage_location, "EXT");
            return res.json(materialResult);
        }
    } catch (err) {
        return res.json(err);
    }
};


controller.getUbicacionesEXTSerial_POST = async (req, res) => {
    const estacion = req.body.station;
    const serial = req.body.serial;
    const proceso = req.body.proceso;
    const user_id = req.body;
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


controller.postSerialsEXT_POST = async (req, res) => {
    let estacion = req.body.station
    let serial = req.body.serial
    let material = null
    let cantidad = null
    let proceso = req.body.proceso
    let storage_bin = req.body.storage_bin.toUpperCase()
    let user_id = req.body
    let max_storage_unit_bin = 5

    let serials_array = serial.split(",")
    let promises = [];
    let errorsArray = [];


    const result_getStorageLocation = await funcion.getStorageLocation(estacion);
    const binExists = await funcion.sapRFC_SbinOnStypeExists("EXT", storage_bin)
    const result_consultaStorageBin = await funcion.sapRFC_consultaStorageBin(result_getStorageLocation[0].storage_location, "EXT", storage_bin);
    let serials_bin = serials_array.length + result_consultaStorageBin.length
    if (binExists.length === 0) {
        res.json([{ "key": `Storage Bin ${storage_bin} not found in Storage Type EXT`, "abapMsgV1": "ALL" }]);
    } else if (storage_bin[0] == "r" || storage_bin[0] == "R" && serials_bin > max_storage_unit_bin) {
        res.json([{ "key": `Exceeded amount of Storage Units per Bin: ${serials_bin - max_storage_unit_bin}` }]);
    } else {
        const innerPromises = serials_array.map(async (serial_) => {
            const result_consultaStorageUnit = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial_, 20));
            if (result_consultaStorageUnit.length === 0) {
                errorsArray.push({ "key": `Check SU ${serial_}`, "abapMsgV1": `${serial_}` });
            } else if (result_consultaStorageUnit[0].LGORT !== result_getStorageLocation[0].storage_location) {
                errorsArray.push({ "key": `SU ${serial_} is in a different storage location`, "abapMsgV1": `${serial_}` });
            } else {
                promises.push(await funcion.sapRFC_transferExt(serial_, storage_bin))
            }
        });
        await Promise.all(innerPromises);
        await Promise.all(promises);
        const newArray = promises.concat(errorsArray);
        res.json(newArray);
    }
}

controller.getBinStatusReportEXT_POST = async (req, res) => {
    const estacion = req.body.estacion;
    const storage_bin = req.body.storage_bin;
    const storage_type = req.body.storage_type;

    try {
        const result = await funcion.sapRFC_SbinOnStypeExists(storage_type, storage_bin);
        if (result.length === 0) {
            return res.json({ key: `Storage Bin "${storage_bin}" does not exist at Storage Type "${storage_type}"` });
        } else {
            const resultSL = await funcion.getStorageLocation(estacion);

            if (resultSL.length === 0) {
                return res.json({ key: `Storage Location not set for device "${estacion}"` });
            }

            const storageLocation = resultSL[0].storage_location;
            const storageBinInfo = await funcion.sapRFC_consultaStorageBin(storageLocation, storage_type, storage_bin);

            const info_list = storageBinInfo.map(element => ({
                storage_unit: parseInt(element.LENUM)
            }));

            return res.json({ info_list, error: "N/A" });
        }
    } catch (err) {
        return res.json({ error: "An error occurred" });
    }
};


controller.postCycleSUEXT_POST = async (req, res) => {

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
    let estacion = req.body.estacion

    switch (storage_type) {
        case "EXT":
            st = storage_type
            sb = "CICLICOEXT"
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

    const lsup = Promise.all(listed_storage_units_promises)
    const nfsup = Promise.all(not_found_storage_units_promises)
    const usup = Promise.all(unlisted_storage_units_promises)
    let response_list = []
    Promise.all([lsup, nfsup, usup])
        .then(result => {
            let lsup_result = result[0]
            let nfsup_result = result[1]
            let usup_result = result[2]

            nfsup_result.forEach(element => {
                if (element.key) {
                    response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "NOSCAN-ERROR", element.key)
                } else {
                    response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "NOSCAN", element.E_TANUM)
                }

            })

            usup_result.forEach(element => {
                if (element.key) {
                    response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "WRONGBIN-ERROR", element.key)
                } else {
                    response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
                    funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "WRONGBIN", element.E_TANUM)
                }
            })

            res.json(response_list)
        })
        .catch(err => { })
}


controller.backflushEXT_POST = async (req, res) => {
    console.log(req.body);
    try {

        let station = req.body.station
        let serials = req.body.serials
        let serials_array = serials.split(",")
        let emp_num = req.body.user_id
        let errorsArray = [];
        let resultsArray = [];

        for (let i = 0; i < serials_array.length; i++) {


            // if (element.length === 0) {
            //     errorsArray.push({ "key": `Check Serial Number not found`, "serial": `${serial_number_10}` })
            // } else {
            let serial_number_10 = funcion.addLeadingZeros(serials_array[i], 10)
            let resultBackflush = await funcion.backflushEXT(serial_number_10);
            if (resultBackflush.E_RETURN.TYPE !== "S") {
                errorsArray.push({ "key": `${resultBackflush.E_RETURN.MESSAGE}`, "serial": `${serial_number_10}` })
            } else {
                let element = await funcion.sapRFC_HUDETAIL(funcion.addLeadingZeros(serials_array[i], 20));
                let resultTBNUM = await funcion.sapRFC_TBNUM(element.DATA[0].WA.split(",")[0], parseFloat(element.DATA[0].WA.split(",")[1]));
                let resultTransfer = await funcion.sapRFC_transferVul_TR(serial_number_10, parseFloat(element.DATA[0].WA.split(",")[1]), "EXT", "TEMPB_EXT", resultTBNUM[0].TBNUM);
                if (resultTransfer.E_TANUM) {
                    await funcion.update_acred_ext("Acreditado", resultTransfer.E_TANUM, emp_num, serial_number_10)
                    resultsArray.push(resultTransfer)
                } else {
                    await funcion.update_acred_ext("Impreso", resultTransfer.E_TANUM, emp_num, serial_number_10)
                    errorsArray.push({ "key": `Check ${serial_number_10}`, "serial": `${serial_number_10}` })
                }
            }
            // }

        }

        const newArray = resultsArray.concat(errorsArray);
        res.json(newArray);

    } catch (err) {
        res.json(err)
    }
}

module.exports = controller;