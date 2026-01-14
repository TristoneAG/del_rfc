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

// Validate and prepare RFC_READ_TABLE options before execution to prevent SAP dumps
// Automatically splits long queries that exceed SAP's 72 character limit per OPTIONS.TEXT
funcion.validateRfcReadTableOptions = (options) => {
    const errors = [];
    const MAX_QUERY_LENGTH = 72; // SAP RFC_READ_TABLE limit
    
    // Helper function to split long query text into multiple OPTIONS entries
    const splitQueryText = (queryText, maxLength = MAX_QUERY_LENGTH) => {
        if (queryText.length <= maxLength) {
            return [{ TEXT: queryText }];
        }
        
        // Split by AND clauses, preserving the AND keyword
        const andRegex = /\s+AND\s+/gi;
        const parts = queryText.split(andRegex);
        
        const splitOptions = [];
        let currentQuery = '';
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const andKeyword = i > 0 ? ' AND ' : '';
            const potentialQuery = currentQuery + andKeyword + part;
            
            if (potentialQuery.length <= maxLength) {
                currentQuery = potentialQuery;
            } else {
                // If current query is not empty, save it and start a new one
                if (currentQuery) {
                    splitOptions.push({ TEXT: currentQuery.trim() });
                }
                
                // If a single part exceeds maxLength, throw error
                if (part.length > maxLength) {
                    throw new Error(`Query part exceeds maximum length of ${maxLength} characters: ${part.substring(0, 50)}...`);
                }
                
                currentQuery = part;
            }
        }
        
        // Add the last query if it exists
        if (currentQuery) {
            splitOptions.push({ TEXT: currentQuery.trim() });
        }
        
        return splitOptions;
    };
    
    // Validate table name
    if (!options.QUERY_TABLE || typeof options.QUERY_TABLE !== 'string') {
        errors.push('QUERY_TABLE is required and must be a string');
    }
    
    // Validate delimiter
    if (!options.DELIMITER || typeof options.DELIMITER !== 'string') {
        errors.push('DELIMITER is required and must be a string');
    }
    
    // Validate OPTIONS array
    if (!options.OPTIONS || !Array.isArray(options.OPTIONS) || options.OPTIONS.length === 0) {
        errors.push('OPTIONS is required and must be a non-empty array');
    } else {
        // Process each option: validate and split if necessary
        const processedOptions = [];
        
        options.OPTIONS.forEach((option, index) => {
            if (!option.TEXT || typeof option.TEXT !== 'string') {
                errors.push(`OPTIONS[${index}].TEXT is required and must be a string`);
            } else {
                const queryText = option.TEXT;
                
                // Split query if it exceeds maximum length
                let queriesToValidate = [];
                if (queryText.length > MAX_QUERY_LENGTH) {
                    try {
                        const splitOptions = splitQueryText(queryText, MAX_QUERY_LENGTH);
                        processedOptions.push(...splitOptions);
                        queriesToValidate = splitOptions.map(opt => opt.TEXT);
                    } catch (splitError) {
                        errors.push(`OPTIONS[${index}].TEXT cannot be split: ${splitError.message}`);
                    }
                } else {
                    processedOptions.push(option);
                    queriesToValidate = [queryText];
                }
                
                // Validate each query text (original or split)
                queriesToValidate.forEach((text, textIndex) => {
                    // Check for dangerous SQL patterns that could cause dumps
                    const dangerousPatterns = [
                        /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE)/i,
                        /--/,
                        /\/\*/,
                        /UNION/i,
                        /EXEC/i,
                        /EXECUTE/i,
                        /SCRIPT/i
                    ];
                    
                    dangerousPatterns.forEach(pattern => {
                        if (pattern.test(text)) {
                            errors.push(`OPTIONS[${index}].TEXT[${textIndex}] contains potentially dangerous SQL pattern`);
                        }
                    });
                    
                    // Validate query format (should follow: FIELD EQ 'value' AND ...)
                    // Basic format check - should contain at least one field comparison
                    if (!/^\s*[A-Z0-9_]+\s+(EQ|NE|LT|LE|GT|GE|LIKE|IN)\s+/.test(text.toUpperCase())) {
                        errors.push(`OPTIONS[${index}].TEXT[${textIndex}] does not follow expected format (FIELD EQ 'value')`);
                    }
                    
                    // Check for balanced quotes
                    const singleQuotes = (text.match(/'/g) || []).length;
                    if (singleQuotes % 2 !== 0) {
                        errors.push(`OPTIONS[${index}].TEXT[${textIndex}] has unbalanced single quotes`);
                    }
                    
                    // Check individual query length
                    if (text.length > MAX_QUERY_LENGTH) {
                        errors.push(`OPTIONS[${index}].TEXT[${textIndex}] exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
                    }
                });
            }
        });
        
        // Replace OPTIONS with processed (split) options if any were split
        if (processedOptions.length !== options.OPTIONS.length) {
            options.OPTIONS = processedOptions;
        }
    }
    
    // Validate FIELDS if provided
    if (options.FIELDS !== undefined) {
        if (!Array.isArray(options.FIELDS)) {
            errors.push('FIELDS must be an array');
        } else {
            options.FIELDS.forEach((field, index) => {
                if (typeof field !== 'string' || field.trim() === '') {
                    errors.push(`FIELDS[${index}] must be a non-empty string`);
                }
            });
        }
    }
    
    if (errors.length > 0) {
        throw new Error(`RFC_READ_TABLE validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
};


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

        const packingMaterialOptions = {
            QUERY_TABLE: 'PACKPO',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${PACKNR}' AND PAITEMTYPE EQ 'P'` }],
            FIELDS: ['MATNR']
        };
        funcion.validateRfcReadTableOptions(packingMaterialOptions);
        const result_packing_material = await managed_client.call('RFC_READ_TABLE', packingMaterialOptions);

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

            const packingObjectOptions = {
                QUERY_TABLE: 'PACKKP',
                DELIMITER: ",",
                OPTIONS: [{ TEXT: `POBJID EQ '${packInstruction}'` }],
                FIELDS: ['PACKNR']
            };
            funcion.validateRfcReadTableOptions(packingObjectOptions);
            const result_packing_object = await managed_client.call('RFC_READ_TABLE', packingObjectOptions);
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
        // let printerExists = await funcion.checkPrinterExists(printer);
        // if (printerExists.data.trim() !== "TRUE") { throw new Error("Printer not found in Bartender Server"); }
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

        const packingMaterialOptions = {
            QUERY_TABLE: 'PACKPO',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${PACKNR}' AND PAITEMTYPE EQ 'P'` }],
            FIELDS: ['MATNR']
        };
        funcion.validateRfcReadTableOptions(packingMaterialOptions);
        const result_packing_material = await managed_client.call('RFC_READ_TABLE', packingMaterialOptions);

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


funcion.createMESMaterialSearch = async (material, plant) => {
    let managed_client = null
    const discardedStorageTypes = ["999", "102", "100"];
    const discardedStorageBins = ["SCHROTT", "199"];
    try {
        managed_client = await createSapRfcPool.acquire();

        const upperMaterial = material.toUpperCase();

        // Section 1: Fetch material description
        const materialDescOptions = {
            QUERY_TABLE: 'MAKT',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ '${upperMaterial}' AND SPRAS EQ 'E'` }], //TODO: Change to the correct language
            FIELDS: ['MAKTX']
        };
        funcion.validateRfcReadTableOptions(materialDescOptions);
        const materialDescResult = await managed_client.call('RFC_READ_TABLE', materialDescOptions);
        const materialDescription = materialDescResult.DATA?.length > 0 
            ? materialDescResult.DATA[0].WA.trim() 
            : '';

        // Section 2: Fetch LQUA table data
        const lquaOptions = {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ '${upperMaterial}' AND WERKS EQ '${plant}'` }]
        };
        funcion.validateRfcReadTableOptions(lquaOptions);
        const lquaResult = await managed_client.call('RFC_READ_TABLE', lquaOptions);

        // Section 3: Parse LQUA table result into array of objects
        const columns = lquaResult.FIELDS.map(field => field.FIELDNAME);
        const rows = lquaResult.DATA.map(data => data.WA.split(","));
        const lquaData = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));

        // Helper function to parse SAP numeric format (handles trailing space or dash for negative)
        const parseSapNumber = (value) => {
            if (!value) return 0;
            const str = value.toString().trim();
            if (str === '' || str === '0' || str === '0.000') return 0;
            const isNegative = str.endsWith('-');
            const numStr = isNegative ? str.slice(0, -1).trim() : str;
            const num = parseFloat(numStr) || 0;
            return isNegative ? -num : num;
        };

        // Group by storage location -> storage type -> storage bin and sum GESME
        const groupedData = lquaData.reduce((grouped, item) => {
            const storageLocation = item.LGORT?.trim() || '';
            const storageType = item.LGTYP?.trim() || '';
            const storageBin = item.LGPLA?.trim() || '';
            const gesmeValue = parseSapNumber(item.GESME);
            
            // Initialize nested structure if needed
            if (!grouped[storageLocation]) grouped[storageLocation] = {};
            if (!grouped[storageLocation][storageType]) grouped[storageLocation][storageType] = {};
            
            // Sum GESME for duplicate storage bins
            if (grouped[storageLocation][storageType][storageBin]) {
                grouped[storageLocation][storageType][storageBin].GESME += gesmeValue;
            } else {
                grouped[storageLocation][storageType][storageBin] = { GESME: gesmeValue };
            }
            
            return grouped;
        }, {});
        
        
        
        // Section 4: Remove discarded entries and clean up empty structures
        Object.keys(groupedData).forEach(storageLocation => {
            Object.keys(groupedData[storageLocation]).forEach(storageType => {
                // Remove entire storage type if it's discarded
                if (discardedStorageTypes.includes(storageType)) {
                    delete groupedData[storageLocation][storageType];
                    return;
                }
                
                // Remove discarded storage bins
                Object.keys(groupedData[storageLocation][storageType]).forEach(storageBin => {
                    if (discardedStorageBins.includes(storageBin)) {
                        delete groupedData[storageLocation][storageType][storageBin];
                    }
                });
                
                // Remove empty storage types
                if (Object.keys(groupedData[storageLocation][storageType]).length === 0) {
                    delete groupedData[storageLocation][storageType];
                }
            });
            
            // Remove empty storage locations
            if (Object.keys(groupedData[storageLocation]).length === 0) {
                delete groupedData[storageLocation];
            }
        });
        
        // Add material description to the result
        groupedData.materialDescription = materialDescription;
        
        return groupedData;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}
module.exports = funcion;