const funcion = {};

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');
const dbShip = require('../connections/db/connection_embarques');
const axios = require('axios');

funcion.addLeadingZeros = (num, totalLength) => {
    return String(num).padStart(totalLength, '0');
}

funcion.getStorageLocation = async (station) => {
    try {
        const result = await dbB10(`
            SELECT storage_location
            FROM b10.station_conf
            WHERE no_estacion = '${station}'
        `);
        return result;
    } catch (error) {
        throw error;
    }
}

funcion.getDelivery = async (delivery) => {
    try {
        const result = await dbShip(`
            SELECT *
            FROM embarque_delivery
            WHERE delivery_delivery = '${delivery}'
        `);
        return result;
    } catch (error) {
        throw error;
    }
}

funcion.insertDelivery = async (deliveries) => {
    try {
        const result = await dbShip(`
            INSERT INTO embarque_delivery (delivery_embarque, delivery_delivery, delivery_master, delivery_single)
            VALUES ?
        `, [deliveries]);
        return result;
    }
    catch (error) {
        throw error;
    }
}


funcion.shipment_delivery = async (delivery, stock, embarque) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        let deliveryCaptured = await funcion.getDelivery(delivery);
        if (deliveryCaptured.length !== 0) { return { "result": "N/A", error: `Delivery previously captured: ${delivery}` }; }
        let totalQuantityHUITEM = 0;

        const deliveryResult = await managed_client.call('BAPI_DELIVERY_GETLIST', {
            IS_DLV_DATA_CONTROL: {
                BYPASSING_BUFFER: "X",
                HEAD_STATUS: "X",
                HEAD_PARTNER: "X",
                ITEM: "X",
                ITEM_STATUS: "X",
                DOC_FLOW: "X",
                FT_DATA: "X",
                HU_DATA: "X",
                SERNO: "X",
            },
            IT_VBELN: [
                {
                    SIGN: 'I',
                    OPTION: 'EQ',
                    DELIV_NUMB_LOW: funcion.addLeadingZeros(delivery, 10),
                    DELIV_NUMB_HIGH: funcion.addLeadingZeros(delivery, 10),

                }
            ],
        });
        if (deliveryResult.ET_HU_HEADER.length === 0) { return { "result": "N/A", error: `Verify delivery: ${delivery}` } }

        let deliveryHUList = deliveryResult.ET_HU_HEADER.map(hu => hu.EXIDV);
        const result_hus_history = await managed_client.call('BAPI_HU_GETLIST', {
            NOTEXT: '',
            ONLYKEYS: '',
            HUNUMBERS: deliveryHUList
        });

        function createConsolidatedObject(input) {
            const pallets = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU === "");
            const lowerLevelHUs = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU !== "");
            totalQuantityHUITEM = input.HUITEM.reduce((acc, item) => acc + Number(item.PACK_QTY), 0);
            const consolidatedData = pallets.map(pallet => {
                const lowerLevelHU = lowerLevelHUs.filter(item => item.HIGHER_LEVEL_HU === pallet.HU_ID);
                const updatedLowerLevelHU = lowerLevelHU.map(item => {
                    const matchingHUITEM = input.HUITEM.find(huitem => huitem.HU_EXID === item.HU_EXID);
                    return {
                        ...item,
                        Z_HUITEM: matchingHUITEM
                    };
                });
                return {
                    ...pallet,
                    Z_LOWER_LEVEL_HU: updatedLowerLevelHU
                };
            });

            return {
                consolidatedData
            };
        }
        const consolidatedResult = createConsolidatedObject(result_hus_history);

        if (totalQuantityHUITEM !== Number(stock)) { return { "result": "N/A", error: `Quantity Entered: ${stock}, Delivery Quantity: ${totalQuantityHUITEM}` } }

        let array_of_arrays = [];
        for (let i = 0; i < consolidatedResult.consolidatedData.length; i++) {
            const pallet = consolidatedResult.consolidatedData;
            for (let j = 0; j < pallet[i].Z_LOWER_LEVEL_HU.length; j++) {
                const lowerLevelHU = pallet[i].Z_LOWER_LEVEL_HU;
                let master = `${parseInt(pallet[i].HU_EXID)}`;
                let single = `${parseInt(lowerLevelHU[j].HU_EXID)}`;
                array_of_arrays.push([embarque, delivery, master, single]);
            }

            if (pallet[i].Z_LOWER_LEVEL_HU.length === 0) {
                let master = `${parseInt(pallet[i].HU_EXID)}`;
                array_of_arrays.push([embarque, delivery, master, master]);
            }
        }

        let insertDelivery = await funcion.insertDelivery(array_of_arrays);
        if (insertDelivery.affectedRows === 0) { return { "result": "N/A", error: `Error inserting delivery: ${delivery}` } }

        return { "result": consolidatedResult, "error": `N/A` };

    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.shipment_multiple_delivery = async (delivery, stock, embarque) => {
    let managed_client;
    try {
        managed_client = await createSapRfcPool.acquire();
        const deliveries = delivery.split(',').map(d => d.trim());  // Split the delivery string into an array

        let totalQuantityHUITEM = 0;
        let allConsolidatedResults = [];
        let array_of_arrays = [];

        let capturedDeliveries = [];
        for (let singleDelivery of deliveries) {
            let deliveryCaptured = await funcion.getDelivery(singleDelivery);
            if (deliveryCaptured.length !== 0) {
                capturedDeliveries.push(singleDelivery);
            }
        }
        if (capturedDeliveries.length !== 0) {
            return { "result": "N/A", error: `Deliverie(s) previously captured: ${capturedDeliveries.join(", ")}` };
        }

        for (let singleDelivery of deliveries) {


            const deliveryResult = await managed_client.call('BAPI_DELIVERY_GETLIST', {
                IS_DLV_DATA_CONTROL: {
                    BYPASSING_BUFFER: "X",
                    HEAD_STATUS: "X",
                    HEAD_PARTNER: "X",
                    ITEM: "X",
                    ITEM_STATUS: "X",
                    DOC_FLOW: "X",
                    FT_DATA: "X",
                    HU_DATA: "X",
                    SERNO: "X",
                },
                IT_VBELN: [
                    {
                        SIGN: 'I',
                        OPTION: 'EQ',
                        DELIV_NUMB_LOW: funcion.addLeadingZeros(singleDelivery, 10),
                        DELIV_NUMB_HIGH: funcion.addLeadingZeros(singleDelivery, 10),
                    }
                ],
            });

            if (deliveryResult.ET_HU_HEADER.length === 0) {
                return { "result": "N/A", error: `Verify delivery: ${singleDelivery}` };
            }

            let deliveryHUList = deliveryResult.ET_HU_HEADER.map(hu => hu.EXIDV);
            const result_hus_history = await managed_client.call('BAPI_HU_GETLIST', {
                NOTEXT: '',
                ONLYKEYS: '',
                HUNUMBERS: deliveryHUList
            });

            function createConsolidatedObject(input) {
                const pallets = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU === "");
                const lowerLevelHUs = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU !== "");
                totalQuantityHUITEM += input.HUITEM.reduce((acc, item) => acc + Number(item.PACK_QTY), 0);
                const consolidatedData = pallets.map(pallet => {
                    const lowerLevelHU = lowerLevelHUs.filter(item => item.HIGHER_LEVEL_HU === pallet.HU_ID);
                    const updatedLowerLevelHU = lowerLevelHU.map(item => {
                        const matchingHUITEM = input.HUITEM.find(huitem => huitem.HU_EXID === item.HU_EXID);
                        return {
                            ...item,
                            Z_HUITEM: matchingHUITEM
                        };
                    });
                    return {
                        ...pallet,
                        Z_LOWER_LEVEL_HU: updatedLowerLevelHU
                    };
                });

                return {
                    consolidatedData
                };
            }

            const consolidatedResult = createConsolidatedObject(result_hus_history);
            allConsolidatedResults.push(consolidatedResult);



            for (let i = 0; i < consolidatedResult.consolidatedData.length; i++) {
                const pallet = consolidatedResult.consolidatedData;
                for (let j = 0; j < pallet[i].Z_LOWER_LEVEL_HU.length; j++) {
                    const lowerLevelHU = pallet[i].Z_LOWER_LEVEL_HU;
                    let master = `${parseInt(pallet[i].HU_EXID)}`;
                    let single = `${parseInt(lowerLevelHU[j].HU_EXID)}`;
                    array_of_arrays.push([embarque, singleDelivery, master, single]);
                }

                if (pallet[i].Z_LOWER_LEVEL_HU.length === 0) {
                    let master = `${parseInt(pallet[i].HU_EXID)}`;
                    array_of_arrays.push([embarque, singleDelivery, master, master]);
                }
            }
        }

        if (totalQuantityHUITEM !== Number(stock)) {
            return { "result": "N/A", error: `Quantity Entered: ${stock}, Delivery Quantity: ${totalQuantityHUITEM}` };
        }
        let insertDelivery = await funcion.insertDelivery(array_of_arrays);
        if (insertDelivery.affectedRows === 0) {
            return { "result": "N/A", error: `Error inserting delivery` };
        }

        return { "result": allConsolidatedResults, "error": "N/A" };

    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => {
            if (managed_client.alive) {
                createSapRfcPool.release(managed_client);
            }
        }, 500);
    }
};


funcion.shipment_delivery_print = async (delivery, emp_num, printer) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        let deliveryCaptured = await funcion.getDelivery(delivery);
        if (deliveryCaptured.length === 0) { return { "result": "N/A", error: `Delivery not captured: ${delivery}` }; }
        let totalQuantityHUITEM = 0;

        const deliveryResult = await managed_client.call('BAPI_DELIVERY_GETLIST', {
            IS_DLV_DATA_CONTROL: {
                BYPASSING_BUFFER: "X",
                HEAD_STATUS: "X",
                HEAD_PARTNER: "X",
                ITEM: "X",
                ITEM_STATUS: "X",
                DOC_FLOW: "X",
                FT_DATA: "X",
                HU_DATA: "X",
                SERNO: "X",
            },
            IT_VBELN: [
                {
                    SIGN: 'I',
                    OPTION: 'EQ',
                    DELIV_NUMB_LOW: funcion.addLeadingZeros(delivery, 10),
                    DELIV_NUMB_HIGH: funcion.addLeadingZeros(delivery, 10),

                }
            ],
        });


        if (deliveryResult.ET_HU_HEADER.length === 0) { return { "result": "N/A", error: `Verify delivery: ${delivery}` } }

        let deliveryHUList = deliveryResult.ET_HU_HEADER.map(hu => hu.EXIDV);
        const result_hus_history = await managed_client.call('BAPI_HU_GETLIST', {
            NOTEXT: '',
            ONLYKEYS: '',
            HUNUMBERS: deliveryHUList
        });

        function createConsolidatedObject(input) {
            const pallets = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU === "");
            const lowerLevelHUs = input.HUHEADER.filter(item => item.HIGHER_LEVEL_HU !== "");
            totalQuantityHUITEM = input.HUITEM.reduce((acc, item) => acc + Number(item.PACK_QTY), 0);
            const consolidatedData = pallets.map(pallet => {
                const lowerLevelHU = lowerLevelHUs.filter(item => item.HIGHER_LEVEL_HU === pallet.HU_ID);
                const updatedLowerLevelHU = lowerLevelHU.map(item => {
                    const matchingHUITEM = input.HUITEM.find(huitem => huitem.HU_EXID === item.HU_EXID);
                    return {
                        ...item,
                        Z_HUITEM: matchingHUITEM
                    };
                });
                return {
                    ...pallet,
                    Z_LOWER_LEVEL_HU: updatedLowerLevelHU
                };
            });

            return {
                consolidatedData
            };
        }
        const consolidatedResult = createConsolidatedObject(result_hus_history);

        // if (totalQuantityHUITEM !== Number(stock)) { return { "result": "N/A", error: `Quantity Entered: ${stock}, Delivery Quantity: ${totalQuantityHUITEM}` } }

        // let array_of_arrays = [];
        for (let i = 0; i < consolidatedResult.consolidatedData.length; i++) {
            const pallet = consolidatedResult.consolidatedData[i];
            let totalQuantityHUITEM = 0;
            for (let j = 0; j < pallet.Z_LOWER_LEVEL_HU.length; j++) {
                // Search for the material in the tables

                let resultSearch = await funcion.searchUnion(`P${pallet.Z_LOWER_LEVEL_HU[j].Z_HUITEM.MATERIAL}`);
                if (!resultSearch) { throw new Error("Material not found in the database, contact IT & Logistics"); }

                let data = resultSearch[0][0];
                let table = resultSearch[1];
                totalQuantityHUITEM += Number(pallet.Z_LOWER_LEVEL_HU[j].Z_HUITEM.PACK_QTY);
                data["printer"] = `${printer}`;
                data["real_quant"] = `${pallet.Z_LOWER_LEVEL_HU[j].Z_HUITEM.PACK_QTY}`;
                data["emp_num"] = `${emp_num}`;
                // data["station"] = `test`;
                data["serial_num"] = parseInt(pallet.Z_LOWER_LEVEL_HU[j].Z_HUITEM.HU_EXID, 10);

                const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
                    QUERY_TABLE: 'PACKKP',
                    DELIMITER: ",",
                    OPTIONS: [{ TEXT: `PACKNR EQ '${pallet.Z_LOWER_LEVEL_HU[j].PACKG_INSTRUCT}'` }],
                    FIELDS: ['POBJID']
                });

                if (result_packing_object.DATA.length === 0) { throw new Error("Packing Instruction not found, contact Logistics"); }
                let POBJID = result_packing_object.DATA[0].WA


                if (POBJID.endsWith("AC")) {
                    data["alternate_container"] = "YES";
                } else if (POBJID.endsWith("AP1")) {
                    data["alternate_container"] = "YES2";
                } else {
                    data["alternate_container"] = "NO";
                }



                console.log(parseInt(pallet.HU_EXID), parseInt(pallet.Z_LOWER_LEVEL_HU[j].Z_HUITEM.HU_EXID, 10), POBJID);
                // let printedLabel = await funcion.printLabel(data, table);
                // if (printedLabel.status !== 200) { throw new Error("Label not printed"); }

                // // const lowerLevelHU = pallet.Z_LOWER_LEVEL_HU;
                // // let master = `${parseInt(pallet.HU_EXID)}`;
                // // let single = `${parseInt(lowerLevelHU[j].HU_EXID)}`;
                // // array_of_arrays.push([embarque, delivery, master, single]);
            }



            const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
                QUERY_TABLE: 'PACKKP',
                DELIMITER: ",",
                OPTIONS: [{ TEXT: `PACKNR EQ '${pallet.PACKG_INSTRUCT}'` }],
                FIELDS: ['POBJID']
            });

            if (result_packing_object.DATA.length === 0) { throw new Error("Packing Instruction not found, contact Logistics"); }
            let POBJID = result_packing_object.DATA[0].WA

            let cleanedPOBJID = POBJID.replace(/AC|UM|AP1/g, '');
            let resultSearch = await funcion.searchUnion(`P${cleanedPOBJID}`);
            if (!resultSearch) { throw new Error("Material not found in the database, contact IT & Logistics"); }

            let data = resultSearch[0][0];
            let table = resultSearch[1];

            if (POBJID.endsWith("AC")) {
                data["alternate_container"] = "YES";
            } else if (POBJID.endsWith("AP1")) {
                data["alternate_container"] = "YES2";
            } else {
                data["alternate_container"] = "NO";
            }

            data["real_quant"] = `${totalQuantityHUITEM}`;
            data["serial_num"] = parseInt(pallet.HU_EXID, 10);
            let printedLabel = await funcion.printLabel(data, `${table}`);
            if (printedLabel.status !== 200) { throw new Error("Label not printed"); }



            // // if (pallet.Z_LOWER_LEVEL_HU.length === 0) {
            // //     let master = `${parseInt(pallet.HU_EXID)}`;
            // //     // array_of_arrays.push([embarque, delivery, master, master]);
            // // }
        }


        // let insertDelivery = await funcion.insertDelivery(array_of_arrays);
        // if (insertDelivery.affectedRows === 0) { return { "result": "N/A", error: `Error inserting delivery: ${delivery}` } }


        return { "result": consolidatedResult, "error": `N/A` };

    } catch (err) {
        if (managed_client) { await createSapRfcPool.destroy(managed_client) }
        throw err;
    } finally {
        setTimeout(() => { if (managed_client && managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.searchUnion = async (noSap) => {
    try {
        const tables = await funcion.selectTables();
        for (let table of tables) {
            const query = `SELECT * FROM ${process.env.DB_B10_BARTENDER_DBNAME}.${table.table_name} WHERE no_sap = "${noSap}"`;
            const results = await dbB10(query);
            if (results.length !== 0) {
                const resultSearch = await dbB10(`SELECT * FROM ${process.env.DB_B10_BARTENDER_DBNAME}.${table.table_name} WHERE no_sap = "${noSap}"`);
                return [resultSearch, table.table_name];
            }
        }
    } catch (error) {
        throw error;
    }
}

funcion.selectTables = async () => {
    try {
        const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = "${process.env.DB_B10_BARTENDER_DBNAME}"`;
        const tables = await dbB10(query);
        return tables;
    } catch (error) {
        console.error(error);
        throw error;
    }
}


funcion.printLabel = async (data, labelType) => {
    try {
        const printedLabel = await axios({
            method: 'POST',
            url: `http://${process.env.BARTENDER_SERVER}:${process.env.BARTENDER_PORT}/Integration/${labelType}/Execute/`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: JSON.stringify(data)
        });
        return printedLabel;
    } catch (error) {
        throw error;
    }
}

module.exports = funcion;