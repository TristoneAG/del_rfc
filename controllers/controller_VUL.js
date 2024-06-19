const funcion = require('../functions/functions_VUL');

const controller = {};

controller.handlingVUL_POST = async (req, res) => {
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

        const resultHU = await funcion.sapRFC_HUVUL(storageLocation, _material, cantidad)
        if (!resultHU.HUKEY) { return res.json({ "key": `Handling unit not created ` }) }

        const result_printVul = await funcion.printLabel_VUL(station, P_material, _material, cantidad, subline, resultHU.HUKEY)
        if (result_printVul.status !== 200) { return res.json({ "key": `Label print error check Bartender Server` }) }

        res.json(resultHU)

    } catch (err) {
        return res.json(err)
    }
}


controller.postVUL_POST = async (req, res) => {
    try {
        let station = req.body.station
        let serial_num = req.body.serial_num
        let material = req.body.material
        let cantidad = req.body.cantidad
        let P_material
        let _material


        if (material.charAt(0) !== 'P') {
            P_material = 'P' + material;
            _material = material
        } else {
            P_material = material
            _material = material.substring(1)
        }

        const resultSL = await funcion.getStorageLocation(station);
        const resultPV = await funcion.getProductVersion(station);
        if (resultSL.length === 0) { return res.json({ "key": `Storage Location not set for device "${station}"` }) }
        if (resultPV.length === 0) { return res.json({ "key": `Product Version not set for device "${station}"` }) }
        const storage_location = resultSL[0].storage_location;
        const product_version = resultPV[0].product_version;

        let resultBackflush = await funcion.sapRFC_BackflushVUL(serial_num, product_version);
        if (resultBackflush.E_RETURN.TYPE !== "S") {
            if (!resultBackflush.E_RETURN.MESSAGE.toLowerCase().includes('already posted')) {
                return res.json({ "key": `${resultBackflush.E_RETURN.MESSAGE}` })
            }
        }
        let resultTBNUM = await funcion.sapRFC_TBNUM(_material, cantidad)
        let resultTransfer = await funcion.sapRFC_transferVul_TR(serial_num, cantidad, "VUL", "TEMPB_VUL", resultTBNUM[0].TBNUM);

        res.json(resultTransfer);
    } catch (err) {
        res.json(err)
    }
}

controller.reprintLabelVUL_POST = async (req, res) => {

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

        const result_printVul = await funcion.printLabel_VUL(station, P_material, _material, cantidad, subline, serial_num)
        if (result_printVul.status !== 200) { return res.json({ "key": `Label print error check Bartender Server` }) }

        res.json(result_printVul)

    } catch (err) {
        return res.json(err)
    }
}

controller.transferVulProd_POST = async (req, res) => {
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

        let resultConsultaserial = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial, 20))

        if (resultConsultaserial.length == 0) {
            return res.json({ "key": `Check Serial Number not found`, "abapMsgV1": `${serial}` })
        } else if (resultConsultaserial[0].LGTYP !== "VUL" || resultConsultaserial[0].LGORT !== storage_location) {
            return res.json({ "key": `Check SU SType: ${resultConsultaserial[0].LGTYP}, SLocation: ${resultConsultaserial[0].LGORT}`, "abapMsgV1": `${serial}` })
        } else {
            const result = await funcion.sapRFC_transferVULProd(serial, storage_location, storage_type, storage_bin);
            return res.json(result.T_LTAK[0]);
        }


    } catch (err) {
        res.json(err);
    }
};


controller.transferProdVul_POST = async (req, res) => {
    try {

        const material = req.body.material;
        const qty = req.body.qty;
        const estacion = req.body.station

        const resultSL = await funcion.getStorageLocation(estacion);
        if (resultSL.length === 0) { return res.json({ key: `Storage Location not set for device "${estacion}"` }); }
        let storage_location = resultSL[0].storage_location

        if (storage_location == "0012") {
            from_storage_type = "102"
            from_storage_bin = "103"
            to_storage_type = "VUL"
            to_storage_bin = "TEMPR_VUL"
        }
        if (storage_location == "0002") {
            from_storage_type = "100"
            from_storage_bin = "101"
            to_storage_type = "VUL"
            to_storage_bin = "TEMPR_VUL"
        }

        const result1 = await funcion.sapRFC_transferProdVul_1(material, qty, storage_location, from_storage_type, from_storage_bin);   //0012, 102, 103
        const result2 = await funcion.sapRFC_transferProdVul_2(material, qty, storage_location, to_storage_type, to_storage_bin);       //0012, VUL, TEMPR_VUL

        res.json(result2.E_LTAP);
    } catch (err) {
        res.json(err);
    }
};


controller.consultaVulProductionStock_POST = async (req, res) => {
    try {

        const material = req.body.material;
        let cantidad_actual = 0;
        let estacion = req.body.station

        const resultSL = await funcion.getStorageLocation(estacion);

        if (resultSL.length === 0) {
            return res.json({ key: `Storage Location not set for device "${estacion}"` });
        }

        let storage_location = resultSL[0].storage_location

        if (storage_location == "0012") {
            storage_type = "102"
            storage_bin = "103"
        }
        if (storage_location == "0002") {
            storage_type = "100"
            storage_bin = "101"
        }

        const result = await funcion.sapRFC_consultaMaterial_VUL("'" + material + "'", storage_type, storage_bin);
        if (result.length === 0) {
            res.json({ "qty": 0 });
        } else {
            result.forEach(element => { cantidad_actual += parseInt(element.GESME.replace(".000", "")); });
            res.json({ "qty": cantidad_actual });
        }
    } catch (err) {
        res.json(err);
    }
};


controller.auditoriaVUL_POST = async (req, res) => {
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
            const result = await funcion.sapRFC_transferVULProd(serials_array[i], storage_location, storage_type, storage_bin);
            results.push(result);
        }
        res.json(results);
    } catch (err) {
        res.json(err);
    }
};


controller.getUbicacionesVULMaterial_POST = async (req, res) => {
    try {
        let estacion = req.body.estacion
        let material = req.body.material;

        const storageLocation = await funcion.getStorageLocation(estacion);
        const storage_location = storageLocation[0].storage_location;

        const resultado = await funcion.sapRFC_consultaMaterial_ST(material, storage_location, "VUL");
        res.json(resultado);
    } catch (err) {
        res.json(err);
    }
};

controller.getUbicacionesVULMandrel_POST = async (req, res) => {
    try {
        let estacion = req.body.estacion;
        let mandrel = req.body.mandrel;

        const storageLocation = await funcion.getStorageLocation(estacion);
        const storage_location = storageLocation[0].storage_location;

        const result = await funcion.sapFromMandrel(mandrel, "vulc");

        if (result.length === 0) {
            res.json({ "key": "Check Mandrel Number" });
        } else {
            const noSap = result[0].no_sap.substring(1);
            const materialResult = await funcion.sapRFC_consultaMaterial_ST(noSap, storage_location, "VUL");
            res.json(materialResult);
        }
    } catch (err) {
        res.json(err);
    }
};

controller.getUbicacionesVULSerial_POST = async (req, res) => {
    let estacion = req.body.estacion;
    let serial = req.body.serial;
    let proceso = req.body.proceso;
    let user_id = req.body;
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

controller.transferVUL_Confirmed_POST = async (req, res) => {
    let estacion = req.body.station
    let serial = req.body.serial
    let storage_bin = req.body.storage_bin.toUpperCase()
    let max_storage_unit_bin = 10

    let serials_array = serial.split(",")
    let errorsArray = [];
    let resultsArray = [];

    try {
        const result_getStorageLocation = await funcion.getStorageLocation(estacion);
        const binExists = await funcion.sapRFC_SbinOnStypeExists("VUL", storage_bin)
        const result_consultaStorageBin = await funcion.sapRFC_consultaStorageBin(result_getStorageLocation[0].storage_location, "VUL", storage_bin);
        let serials_bin = serials_array.length + result_consultaStorageBin.length
        if (binExists.length === 0) {
            res.json([{ "key": `Storage Bin ${storage_bin} not found in Storage Type VUL`, "abapMsgV1": "ALL" }]);
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
                    const result = await funcion.sapRFC_transferVul(serial_, storage_bin);
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

controller.getBinStatusReportVUL_POST = async (req, res) => {
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

// controller.postCycleSUVUL_POST = async (req, res) => {
//     let storage_bin = req.body.storage_bin
//     let user_id = req.body.user_id
//     let storage_type = req.body.storage_type
//     let listed_storage_units = req.body.listed_storage_units == '' ? [] : req.body.listed_storage_units.split(",")
//     let unlisted_storage_units = req.body.unlisted_storage_units == '' ? [] : req.body.unlisted_storage_units.split(",")
//     let not_found_storage_units = req.body.not_found_storage_units == '' ? [] : req.body.not_found_storage_units.split(",")
//     let st = ""
//     let sb = ""
//     let listed_storage_units_promises = []
//     let unlisted_storage_units_promises = []
//     let not_found_storage_units_promises = []
//     let estacion = req.body.estacion

//     switch (storage_type) {
//         case "VUL":
//             st = storage_type
//             sb = "CICLICOVUL"
//             break;
//         default:
//             res.json(JSON.stringify({ "key": `Storage Type: "${storage_type}" not configured for Cycle Control` }))
//             break;
//     }

//     const resultSL = await funcion.getStorageLocation(estacion);

//     if (resultSL.length === 0) {
//         return res.json({ key: `Storage Location not set for device "${estacion}"` });
//     }

//     let storage_location = resultSL[0].storage_location


//     if (listed_storage_units.length > 0) {
//         listed_storage_units.forEach(element => {
//             listed_storage_units_promises.push(funcion.dBinsert_cycle_Listed_storage_units(storage_type, storage_bin.toUpperCase(), [element], user_id)
//                 .catch((err) => { return err }))
//         })
//     }

//     if (not_found_storage_units.length > 0) {
//         not_found_storage_units.forEach(element => {
//             not_found_storage_units_promises.push(funcion.sapRFC_transferSlocCheck(element, storage_location, st, sb)
//                 .catch((err) => { return err }))
//         })

//     }

//     if (unlisted_storage_units.length > 0) {
//         unlisted_storage_units.forEach(element => {
//             unlisted_storage_units_promises.push(funcion.sapRFC_transferSlocCheck(element, storage_location, storage_type, storage_bin)
//                 .catch((err) => { return err }))
//         })
//     }


//     if (listed_storage_units.length == 0 && unlisted_storage_units.length == 0 && not_found_storage_units.length == 0) {
//         funcion.dBinsert_cycle_result(storage_type, storage_bin, "", user_id, "OK-BIN", "")
//     }

//     const lsup = Promise.all(listed_storage_units_promises)
//     const nfsup = Promise.all(not_found_storage_units_promises)
//     const usup = Promise.all(unlisted_storage_units_promises)
//     let response_list = []
//     Promise.all([lsup, nfsup, usup])
//         .then(result => {
//             let lsup_result = result[0]
//             let nfsup_result = result[1]
//             let usup_result = result[2]

//             nfsup_result.forEach(element => {
//                 if (element.key) {
//                     response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
//                     funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "NOSCAN-ERROR", element.key)
//                 } else {
//                     response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
//                     funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "NOSCAN", element.E_TANUM)
//                 }

//             })

//             usup_result.forEach(element => {
//                 if (element.key) {
//                     response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
//                     funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "WRONGBIN-ERROR", element.key)
//                 } else {
//                     response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
//                     funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "WRONGBIN", element.E_TANUM)
//                 }
//             })

//             res.json(response_list)
//         })
//         .catch(err => { })
// }

controller.postCycleSUVUL_POST = async (req, res) => {
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
            case "VUL":
                st = storage_type
                sb = "CICLICOVUL"
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