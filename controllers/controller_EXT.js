const funcion = require('../functions/functions_EXT');

const controller = {};

controller.handlingEXT_POST = async (req, res) => {
    // console.log("handlingEXT_POST",  req.body);
    try {
        let station = req.body.station
        let plan_id = req.body.plan_id
        let material = req.body.material.toUpperCase()
        let cantidad = req.body.cantidad
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

            if (!resultHU.HUKEY) { return res.json({ "key": `Check SAP RFC HUEXT` }) }

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
                await funcion.update_plan_ext(plan_id)
                await funcion.update_print_ext(parseInt(resultHU.HUKEY), plan_id, material, operator_id, cantidad, impresoType)
            } else {
                return res.json({ "key": `Testr` })
            }

            processedResults.push(resultHU);


        }

        res.json(processedResults)

    } catch (err) {
        console.error("handlingEXT_POST", err);
        res.json(err)
    }
}

controller.transferEXTRP_POST = async (req, res) => {
    try {
        const { serial, station } = req.body;
        const serialsArray = serial.split(",");
        const errorsArray = [];
        const promises = [];

        // Fetch storage location based on station
        const resultEstacion = await funcion.getStorageLocation(station);
        if (!resultEstacion || resultEstacion.length === 0) {
            return res.status(400).json({ error: `Invalid station: ${station}` });
        }

        const storageLocation = resultEstacion[0].storage_location;
        const storageConfig = {
            "0012": { type: "102", bin: "GREEN" },
            "0002": { type: "100", bin: "101" }
        };

        const storageDetails = storageConfig[storageLocation];
        if (!storageDetails) {
            return res.status(400).json({ error: `Unsupported storage location: ${storageLocation}` });
        }

        for (const serial of serialsArray) {
            const paddedSerial = funcion.addLeadingZeros(serial, 20);

            try {
                // Consult SAP for storage unit details
                const resultConsultSerial = await funcion.sapRFC_consultaStorageUnit(paddedSerial);
                if (!resultConsultSerial || resultConsultSerial.length === 0) {
                    errorsArray.push({ key: `Check Serial Number not found`, abapMsgV1: serial });
                    continue;
                }

                const { LGTYP, LGORT } = resultConsultSerial[0];

                if (LGTYP !== "EXT" || LGORT !== storageLocation) {
                    errorsArray.push({ key: `Check SU SType: ${LGTYP}, SLocation: ${LGORT}`, abapMsgV1: serial });
                    continue;
                }

                // Check HU creation date
                const huCreationInfo = await funcion.sapRFC_consultaHUCreationDate(paddedSerial);
                if (huCreationInfo && huCreationInfo.length > 0) {
                    const bdate = huCreationInfo[0].TSTAMP;

                    // Parse and adjust timestamp
                    const storageDateTime = new Date(`${bdate.slice(0, 4)}-${bdate.slice(4, 6)}-${bdate.slice(6, 8)}T${bdate.slice(8, 10)}:${bdate.slice(10, 12)}:${bdate.slice(12, 14)}`);
                    storageDateTime.setHours(storageDateTime.getHours() - 6);

                    const currentTime = new Date();
                    const timeDifference = Math.abs(currentTime - storageDateTime) / (1000 * 60 * 60);

                    if (timeDifference < 12) {
                        errorsArray.push({ key: `Material not yet rested for 12 hours`, abapMsgV1: serial });
                        continue;
                    }
                }

                // Transfer storage unit
                const transferResult = await funcion.sapRFC_transferExtRP(serial, storageDetails.type, storageDetails.bin);
                promises.push(transferResult);
            } catch (error) {
                console.error(`Error processing serial ${serial}:`, error);
                errorsArray.push({ key: `Error processing serial`, abapMsgV1: serial, error: error.message });
            }
        }

        // Combine results and errors
        const results = await Promise.all(promises);
        res.json([...results, ...errorsArray]);
    } catch (error) {
        console.error("transferEXTRP_POST", error);
        res.status(500).json({ error: error.message });
    }
};


// controller.transferEXTRP_POST = async (req, res) => {
//     try {
//         // Extract request parameters
//         let serial = req.body.serial;
//         let serials_array = serial.split(",");
//         let promises = [];
//         let estacion = req.body.station;
//         let errorsArray = [];
//         let storage_type = "";
//         let storage_bin = "";

//         // Fetch storage location based on station
//         let resultEstacion = await funcion.getStorageLocation(estacion);
//         let storage_location = resultEstacion[0].storage_location;

//         // Determine storage type and bin based on storage location
//         if (storage_location == "0012") {
//             storage_type = "102";
//             storage_bin = "GREEN";
//         }
//         if (storage_location == "0002") {
//             storage_type = "100";
//             storage_bin = "101";
//         }

//         // Process each serial number
//         for (let i = 0; i < serials_array.length; i++) {
//             let serial_ = serials_array[i];

//             // Consult SAP for storage unit details
//             let resultConsultaserial = await funcion.sapRFC_consultaStorageUnit(funcion.addLeadingZeros(serial_, 20));

//             if (resultConsultaserial.length == 0) {
//                 // Handle serial number not found
//                 errorsArray.push({ "key": `Check Serial Number not found`, "abapMsgV1": `${serial_}` });
//             } else if (resultConsultaserial[0].LGTYP !== "EXT" || resultConsultaserial[0].LGORT !== storage_location) {
//                 // Validate storage type and location
//                 errorsArray.push({ "key": `Check SU SType: ${resultConsultaserial[0].LGTYP}, SLocation: ${resultConsultaserial[0].LGORT}`, "abapMsgV1": `${serial_}` });
//             } else {


//                 let hu_creation_info = await funcion.sapRFC_consultaHUCreationDate(funcion.addLeadingZeros(serial_, 20));
//                 if (hu_creation_info.length == 0) {
//                     // Transfer storage unit
//                     let resultTransferEXTRP = await funcion.sapRFC_transferExtRP(serial_, storage_type, storage_bin);
//                     promises.push(resultTransferEXTRP);
//                 } else {

//                     let bdate = hu_creation_info[0].TSTAMP
//                     // Extract and format date and time
//                     let formattedDate = `${bdate.slice(0, 4)}-${bdate.slice(4, 6)}-${bdate.slice(6, 8)}`;
//                     let hours = parseInt(bdate.slice(8, 10), 10);
//                     let minutes = parseInt(bdate.slice(10, 12), 10);
//                     let seconds = parseInt(bdate.slice(12, 14), 10);


//                     // Format adjusted time
//                     let adjustedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

//                     // Combine date and adjusted time into a Date object
//                     let storageDateTime = new Date(`${formattedDate}T${adjustedTime}`);
//                     storageDateTime.setHours(storageDateTime.getHours() - 6)
//                     let currentTime = new Date();

//                     let timeDifference = Math.abs(currentTime - storageDateTime) / (1000 * 60 * 60); // Difference in hours


//                     if (timeDifference < 12) {
//                         errorsArray.push({ "key": `Material not yet rested for 12 hours Check SU`, "abapMsgV1": `${serial_}` });
//                     } else {
//                         // Transfer storage unit
//                         let resultTransferEXTRP = await funcion.sapRFC_transferExtRP(serial_, storage_type, storage_bin);
//                         promises.push(resultTransferEXTRP);
//                     }
//                 }

//             }
//         }

//         // Combine results and errors
//         const newArray = promises.concat(errorsArray);
//         res.json(newArray);
//     } catch (err) {
//         // Handle errors
//         console.error("transferEXTRP_POST", err);
//         res.json(err);
//     }
// };



controller.transferEXTPR_POST = async (req, res) => {
    try {
        // console.log("transferEXTPR_POST", req.body)
        let material = req.body.material
        let cantidad = req.body.cantidad
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
        const materialData = await funcion.sapRFC_consultaMaterial_EXT(material, storage_type, storage_bin);

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
                await funcion.sapRFC_transferEXTPR_1(material, cantidad, storage_location, storage_type, storage_bin);
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
    } catch (err) {
        console.error("transferEXTPR_POST", err)
        res.json(err);
    }
}


controller.auditoriaEXT_POST = async (req, res) => {
    // console.log("auditoriaEXT_POST", req.body)
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

        const results = [];
        for (let i = 0; i < serials_array.length; i++) {
            const serial_ = serials_array[i];
            try {
                const result = await funcion.sapRFC_transferEXTProd(serial_, storage_location, storage_type, storage_bin);
                results.push(result);
            } catch (error) {
                results.push({ serial: serial_, error });
            }
        }
        res.json(results);
    } catch (err) {
        console.error("auditoriaEXT_POST", err)
        res.json(err)
    }
}

controller.getUbicacionesEXTMandrel_POST = async (req, res) => {
    // console.log("getUbicacionesEXTMandrel_POST", req.body)
    try {
        const estacion = req.body.station;
        const mandrel = req.body.mandrel;

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
        console.error("getUbicacionesEXTMandrel_POST", err)
        res.json(err)
    }
};


controller.getUbicacionesEXTSerial_POST = async (req, res) => {
    // console.log("getUbicacionesEXTSerial_POST", req.body)
    const estacion = req.body.station;
    const serial = req.body.serial;
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
        console.error("getUbicacionesEXTSerial_POST", err)
        res.json(err)
    }
};


controller.postSerialsEXT_POST = async (req, res) => {
    // console.log("postSerialsEXT_POST", req.body)
    let estacion = req.body.station
    let serial = req.body.serial
    let storage_bin = req.body.storage_bin.toUpperCase()
    let max_storage_unit_bin = 5

    let serials_array = serial.split(",")
    let errorsArray = [];
    let resultsArray = [];

    try {
        const result_getStorageLocation = await funcion.getStorageLocation(estacion);
        const binExists = await funcion.sapRFC_SbinOnStypeExists("EXT", storage_bin)
        const result_consultaStorageBin = await funcion.sapRFC_consultaStorageBin(result_getStorageLocation[0].storage_location, "EXT", storage_bin);
        let serials_bin = serials_array.length + result_consultaStorageBin.length
        if (binExists.length === 0) {
            res.json([{ "key": `Storage Bin ${storage_bin} not found in Storage Type EXT`, "abapMsgV1": "ALL" }]);
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
                    const result = await funcion.sapRFC_transferExt(serial_, storage_bin);
                    resultsArray.push(result);
                }
            }
            const newArray = resultsArray.concat(errorsArray);
            res.json(newArray);
        }
    } catch (err) {
        console.error("postSerialsEXT_POST", err)
        res.json(err)
    }
}

controller.getBinStatusReportEXT_POST = async (req, res) => {
    // console.log("getBinStatusReportEXT_POST", req.body)
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
        console.error("getBinStatusReportEXT_POST", err)
        res.json(err)
    }
};


controller.postCycleSUEXT_POST = async (req, res) => {
    try {
        // console.log("postCycleSUEXT_POST", req.body)
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

        // for (let i = 0; i < listed_storage_units_promises.length; i++) {
        //     try {
        //         const element = await listed_storage_units_promises[i];
        //         if (element.key) {
        //             response_list.push({ "serial_num": parseInt(element.abapMsgV1), "result": "N/A", "error": element.key })
        //             funcion.dBinsert_cycle_result(storage_type, storage_bin, element.abapMsgV1, user_id, "NOSCAN-ERROR", element.key)
        //         } else {
        //             response_list.push({ "serial_num": parseInt(element.I_LENUM), "result": element.E_TANUM, "error": "N/A" })
        //             funcion.dBinsert_cycle_result(storage_type, storage_bin, parseInt(element.I_LENUM), user_id, "NOSCAN", element.E_TANUM)
        //         }
        //     } catch (err) {
        //         // Handle error
        //     }
        // }

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
        console.error("postCycleSUEXT_POST", err)
        res.json(err)
    }
}


controller.backflushEXT_POST = async (req, res) => {
    // console.log("backflushEXT_POST", req.body)
    try {
        let station = req.body.station
        let serials = req.body.serials
        let serials_array = serials.split(",")
        let emp_num = req.body.user_id
        let errorsArray = [];
        let resultsArray = [];

        const resultPV = await funcion.getProductVersion(station);
        if (resultPV.length === 0) { return res.json({ "key": `Product Version not set for device "${station}"` }) }
        const product_version = resultPV[0].product_version;

        for (let i = 0; i < serials_array.length; i++) {


            // if (element.length === 0) {
            //     errorsArray.push({ "key": `Check Serial Number not found`, "serial": `${serial_number_10}` })
            // } else {
            let serial_number_10 = funcion.addLeadingZeros(serials_array[i], 10)
            let resultBackflush = await funcion.backflushEXT(serial_number_10, product_version);
            if (resultBackflush.E_RETURN.TYPE !== "S") {
                errorsArray.push({ "key": `${resultBackflush.E_RETURN.MESSAGE}`, "serial": `${serial_number_10}`, "time": `${new Date().toLocaleString()}` })
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
        console.error("backflushEXT_POST", err)
        res.json(err)
    }
}

module.exports = controller;