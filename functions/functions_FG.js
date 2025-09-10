const funcion = {};

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');
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

funcion.getPrinter = async (station) => {
    try {
        const result = await dbB10(`
            SELECT impre
            FROM b10.station_conf
            WHERE no_estacion = '${station}'
        `);
        return result;
    } catch (error) {
        throw error;
    }
}

funcion.getPrinter_alt = async (station) => {
    try {
        const result = await dbB10(`
            SELECT impre_alt
            FROM b10.station_conf
            WHERE no_estacion = '${station}'
        `);
        return result;
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


funcion.insertEtiquetasImpresas = async (material, employee, station, serial_num, packInstruction, printer) => {
    try {
        let processed_printer = printer.replace(/\\/g, '\\\\');
        const query =
            `
                INSERT INTO b10.etiquetas_impresas (np, emp_num, linea, no_serie, packInstruction, printer) 
                VALUES ('${material}', '${employee}', '${station}', '${serial_num}', '${packInstruction}', '${processed_printer}')
            `;
        const result = await dbB10(query);
        return result;

    } catch (error) {
        throw error;
    }
}


funcion.sapRFC_HUFG = async (material, cantidad, PACKNR, plant_code) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();



        const result_packing_material = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKPO',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${PACKNR}' AND PAITEMTYPE EQ 'P'` }],
            FIELDS: ['MATNR']
        });

        const result_hu_create = await managed_client.call('BAPI_HU_CREATE', {
            HEADERPROPOSAL: {
                PACK_MAT: result_packing_material.DATA[0].WA,
                HU_GRP3: 'UC11',
                PACKG_INSTRUCT: PACKNR,
                PLANT: plant_code,
                L_PACKG_STATUS_HU: '2',
                HU_STATUS_INIT: 'A',
            },
            ITEMSPROPOSAL: [{
                HU_ITEM_TYPE: '1',
                MATERIAL: material,
                PACK_QTY: cantidad,
                PLANT: plant_code,
            }],
        });

        const result_commit = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        const result_hu_change_header = await managed_client.call('BAPI_HU_CHANGE_HEADER', {
            HUKEY: result_hu_create.HUKEY,
            HUCHANGED: {
                CLIENT: '200',
                PACK_MAT_OBJECT: '07',
                WAREHOUSE_NUMBER: plant_code.slice(0, -1),
                HU_STOR_LOC: 'A'
            },
        });

        const result_commit2 = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        return result_hu_create
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
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

funcion.checkPrinterExists = async (printer) => {
    try {
        const printerExistsOutput = await axios({
            method: 'POST',
            url: `http://${process.env.BARTENDER_SERVER}:${process.env.BARTENDER_PORT}/Integration/CHECK_PRINTER/Execute/`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: {printer}
        });
        return printerExistsOutput;
    } catch (error) {
        throw error;
    }
}

//TODO Utilizar transaccion VD53 en esta transaccion se ven los numeros de SAP y el shipto al que se dirigen
//TODO Crear tabla en SAP donde se asigne modelo de etiqueta a ship to
//TODO creat tabla en SAP para informacion adicional a los numeros de parte que no se encuentre en SAP

funcion.createMESHU = async (material, quantity, employee_id, station, plant_code, packInstruction, PACKNR, printer) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        let printerExists = await funcion.checkPrinterExists(printer);
        if (printerExists.data.trim() !== "TRUE") { throw new Error("Printer not found in Bartender Server"); }

        // Search for the material in the tables
        const resultSearch = await funcion.searchUnion(`P${material}`);
        if (!resultSearch) { throw new Error("Material not found in the database, contact IT & Logistics"); }
        // Assign the value of resultSearch to the variable called data
        let data = resultSearch[0][0];
        let table = resultSearch[1];

        if (packInstruction.endsWith("AC")) {
            data["alternate_container"] = "YES";
        } else if (packInstruction.endsWith("AP1")) {
            data["alternate_container"] = "YES2";
        } else {
            data["alternate_container"] = "NO";
        }

        data["printer"] = `${printer}`;
        data["real_quant"] = `${quantity}`;
        data["emp_num"] = `${employee_id}`;
        data["station"] = `${station}`;

        const resultHU = await funcion.sapRFC_HUFG(material, quantity, PACKNR, plant_code)
        if (!resultHU.HUKEY) { throw new Error(`Handling unit not created: ${resultHU.RETURN[0].MESSAGE}`); }
        data["gross_weight"] = parseFloat(resultHU.HUHEADER.TOTAL_WGHT)
        data["serial_num"] = parseInt(resultHU.HUKEY, 10);


        let printedLabel = await funcion.printLabel(data, table);
        if (printedLabel.status !== 200) { throw new Error("Label not printed"); } else{ funcion.insertEtiquetasImpresas(material, employee_id, station, data["serial_num"], packInstruction, printer)}

        return data
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        if (err.code === "ERR_BAD_REQUEST") { throw `Error: ${err.message} - ${err.config.url}` }
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.createMESHUMass = async (employee_id, station, plant_code, packInstruction, printer, labels) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        let material = packInstruction.substring(2, 14);
        let response_array = []
        for (let i = 0; i < labels; i++) {

            // Search for the material in the tables
            const resultSearch = await funcion.searchUnion(`P${material}`);
            if (!resultSearch) { throw new Error("Material not found in the database, contact IT & Logistics"); }
            // Assign the value of resultSearch to the variable called data
            let data = resultSearch[0][0];
            let table = resultSearch[1];
            let quantity = data.std_pack

            if (packInstruction.endsWith("AC")) {
                data["alternate_container"] = "YES";
            } else if (packInstruction.endsWith("AP1")) {
                data["alternate_container"] = "YES2";
            } else {
                data["alternate_container"] = "NO";
            }

            data["printer"] = `${printer}`;
            data["real_quant"] = `${quantity}`;
            data["emp_num"] = `${employee_id}`;
            data["station"] = `${station}`;

            const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
                QUERY_TABLE: 'PACKKP',
                DELIMITER: ",",
                OPTIONS: [{ TEXT: `POBJID EQ '${packInstruction}'` }],
                FIELDS: ['PACKNR']
            });
            if (result_packing_object.DATA.length === 0) { throw new Error("Packing Instruction not found, contact Logistics"); }
            let PACKNR = result_packing_object.DATA[0].WA

            const resultHU = await funcion.sapRFC_HUFG(material, quantity, PACKNR, plant_code)
            if (!resultHU.HUKEY) { throw new Error(`Handling unit not created: ${resultHU.RETURN[0].MESSAGE}`); }
            data["serial_num"] = parseInt(resultHU.HUKEY, 10);


            let printedLabel = await funcion.printLabel(data, table);
            if (printedLabel.status !== 200) { throw new Error("Label not printed"); } else{ funcion.insertEtiquetasImpresas(material, employee_id, station, data["serial_num"], packInstruction, printer)}

            response_array.push(data)

        }


        return response_array
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        if (err.code === "ERR_BAD_REQUEST") { throw `Error: ${err.message} - ${err.config.url}` }
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.createMESHURFC = async (material, quantity, employee_id, station, plant_code, packInstruction, PACKNR, printer) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        let printerExists = await funcion.checkPrinterExists(printer);
        if (printerExists.data.trim() !== "TRUE") { throw new Error("Printer not found in Bartender Server"); }
        let data = {}
        // // Search for the material in the tables
        // const resultSearch = await funcion.searchUnion(`P${material}`);
        // if (!resultSearch) { throw new Error("Material not found in the database, contact IT & Logistics"); }
        // // Assign the value of resultSearch to the variable called data
        // let data = resultSearch[0][0];
        // let table = resultSearch[1];

        if (packInstruction.endsWith("AC")) {
            data["alternate_container"] = "YES";
        } else if (packInstruction.endsWith("AP1")) {
            data["alternate_container"] = "YES2";
        } else {
            data["alternate_container"] = "NO";
        }

        data["printer"] = `${printer}`;
        data["real_quant"] = `${quantity}`;
        data["emp_num"] = `${employee_id}`;
        data["station"] = `${station}`;

        const resultHU = await funcion.sapRFC_HURFC(material, quantity, PACKNR, plant_code)
        if (!resultHU.HUKEY) { throw new Error(`Handling unit not created: ${resultHU.RETURN[0].MESSAGE}`); }
        data["serial_num"] = parseInt(resultHU.HUKEY, 10);


        // let printedLabel = await funcion.printLabel(data, table);
        // if (printedLabel.status !== 200) { throw new Error("Label not printed"); } else{ funcion.insertEtiquetasImpresas(material, employee_id, station, data["serial_num"], packInstruction, printer)}
        const result_tmes_fm_hu_labels = await managed_client.call('ZPP_TMES_FM_HU_LABELS', {

            HANDLING_UNIT:resultHU.HUKEY,
            PLANT: plant_code,
            PRINTER: printer
            
        });
        console.log(result_tmes_fm_hu_labels);
        const result_tmes_commit = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" })
       
        
        return data
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        if (err.code === "ERR_BAD_REQUEST") { throw `Error: ${err.message} - ${err.config.url}` }
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.sapRFC_HURFC = async (material, cantidad, PACKNR, plant_code) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();



        const result_packing_material = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKPO',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${PACKNR}' AND PAITEMTYPE EQ 'P'` }],
            FIELDS: ['MATNR']
        });

        const result_hu_create = await managed_client.call('BAPI_HU_CREATE', {
            HEADERPROPOSAL: {
                PACK_MAT: result_packing_material.DATA[0].WA,
                HU_GRP3: 'UC11',
                PACKG_INSTRUCT: PACKNR,
                PLANT: plant_code,
                L_PACKG_STATUS_HU: '2',
                HU_STATUS_INIT: 'A',
            },
            ITEMSPROPOSAL: [{
                HU_ITEM_TYPE: '1',
                MATERIAL: material,
                PACK_QTY: cantidad,
                PLANT: plant_code,
            }],
        });

        const result_commit = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        const result_hu_change_header = await managed_client.call('BAPI_HU_CHANGE_HEADER', {
            HUKEY: result_hu_create.HUKEY,
            HUCHANGED: {
                CLIENT: '200',
                PACK_MAT_OBJECT: '07',
                WAREHOUSE_NUMBER: plant_code.slice(0, -1),
                HU_STOR_LOC: 'A'
            },
        });

        const result_commit2 = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        return result_hu_create
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

module.exports = funcion;