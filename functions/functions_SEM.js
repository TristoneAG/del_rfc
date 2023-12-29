const funcion = {};
const axios = require('axios');

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');
const dbBartender = require('../connections/db/connection_bartender');

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


funcion.getPrinter = (station) => {
    return new Promise((resolve, reject) => {
        dbB10(`
        SELECT impre
        FROM b10.station_conf
        WHERE no_estacion = '${station}'
            `)
            .then((result) => { resolve(result) })
            .catch((error) => { reject(error) })
    })
}



funcion.getCurrentStockSem = async (part_number) => {
    try {
        const sql = `
            SELECT
                *
            FROM
                sem
            WHERE
                no_sap = "${part_number}"
        `;

        const result = await dbBartender(sql);
        return result;
    } catch (error) {
        throw error;
    }
};

funcion.update_sem_current_stock = async (part_number, current_stock) => {
    try {
        const sql = `
            UPDATE sem
            SET current_stock = "${current_stock}"
            WHERE no_sap = "${part_number}"
        `;

        const result = await dbBartender(sql, current_stock);
        return result;
    } catch (error) {
        throw error;
    }
};




funcion.update_sem_current_employee = async (part_number) => {
    try {
        const sql = `
            UPDATE sem
            SET current_employee = ''
            WHERE no_sap = "${part_number}"
        `;

        const result = await dbBartender(sql);
        return result;
    } catch (error) {
        throw error;
    }
};


funcion.materialSEM = (material) => {
    return new Promise((resolve, reject) => {
        dbBartender(`
        SELECT
            *
        FROM
            sem
        WHERE
            no_sap = '${material}'
        `)
            .then((result) => { resolve(result) })
            .catch((error) => { reject(error) })
    })
}



funcion.printLabel_SEM = async (station, P_material, _material, cantidad, subline, serial_num) => {
    const labelType = "SUB"
    try {
        const result_printer = await funcion.getPrinter(station);
        if (result_printer.length === 0) { return res.json({ "key": `Printer not set for device ${station}` }) }
        const materialResult = await funcion.materialSEM(P_material);
        if (materialResult.length === 0) { return res.json({ "key": `Part number not set in database ${_material}` }) }
        const data = {
            printer: result_printer[0].impre,
            no_sap: materialResult[0].no_sap,
            assembly: materialResult[0].assembly,
            cust_part: materialResult[0].cust_part,
            // platform: materialResult[0].platform,
            rack: materialResult[0].rack,
            rack_return: materialResult[0].rack_return,
            // family: materialResult[0].family,
            // length: materialResult[0].length,
            line: subline,
            std_pack: `${parseInt(materialResult[0].std_pack)}`,
            real_quant: `${parseInt(cantidad)}`,
            serial_num: `${parseInt(serial_num)}`,
            client: materialResult[0].client,
            platform: "VULC"
        };
        // let printedLabel = await funcion.printLabel_VUL(data, "VULC")
        // if (printedLabel.status !== 200) { return res.json({ "key": `Label print error check Bartender Server` }) }

        const printedLabel = await axios({
            method: 'POST',
            url: `http://${process.env.BARTENDER_SERVER}:${process.env.BARTENDER_PORT}/Integration/${labelType}/Execute/`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: JSON.stringify(data)
        });
        return printedLabel;
    } catch (err) {
        throw err;
    }
};

funcion.backflushFG = async (serial) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();

        const result = await managed_client.call('ZWM_HU_MFHU', {
            I_EXIDV: `${funcion.addLeadingZeros(serial, 20)}`,
            I_VERID: '1'
        });
        return result;
    } catch {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
}

funcion.sapRFC_TBNUM = async (material, cantidad) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LTBP',
            DELIMITER: ",",
            OPTIONS: [
                { TEXT: `LGNUM EQ '521' AND MATNR EQ '${material}' AND MENGE EQ '${cantidad}'` },
                { TEXT: `AND ELIKZ EQ ''` },
            ]
        });
        const fields = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(fields.map((key, i) => [key, row[i]])));
        res.sort((a, b) => (parseInt(b.TBNUM) - parseInt(a.TBNUM)));
        return res;
    } catch (err) {
        return err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_transferSEM_TR = async (serial_num, quantity, storage_type, storage_bin, tbnum) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        try {
            const result = await managed_client.call('L_TO_CREATE_TR', {
                I_LGNUM: '521',
                I_TBNUM: `${tbnum}`,
                IT_TRITE:
                        [{
                            TBPOS:"001",
                            ANFME:`${quantity}`,
                            ALTME:"ST",
                            NLTYP:`${storage_type}`,
                            NLBER:"001",
                            NLPLA:`${storage_bin}`,
                            NLENR:`${funcion.addLeadingZeros(serial_num, 20)}`,
                            LETYP:"001"
                        }]            
            });

            return result;
        } catch (err) {
            throw err;
        }
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_consultaStorageUnit = async (storage_unit) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();

        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `LENUM EQ '${storage_unit}' ` }]
        });

        const columns = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));

        return res;
    } catch (error) {
        throw error;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};

funcion.sapRFC_transferSemProd = async (serial, storage_type, storage_bin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();

        const parameters = {
            I_LENUM: `${funcion.addLeadingZeros(serial, 20)}`,
            I_BWLVS: `998`,
            I_LETYP: `IP`,
            I_NLTYP: `${storage_type}`,
            I_NLBER: `001`,
            I_NLPLA: `${storage_bin}`
        };

        const result = await managed_client.call('L_TO_CREATE_MOVE_SU', parameters);
        return result;
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
}

funcion.sapRFC_consultaMaterial_SEM = async (material_number, storage_location, storage_type) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ ${material_number.toUpperCase()} AND LGTYP EQ '${storage_type}' AND LGORT EQ '${storage_location}'` }]
        });

        const columns = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));

        return res;
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_transferProdSem_1 = async (material, qty, storage_location, storage_type, storage_bin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        try {
            const result = await managed_client.call('L_TO_CREATE_SINGLE', {
                I_LGNUM: '521',
                I_BWLVS: '100',
                I_MATNR: material,
                I_WERKS: '5210',
                I_ANFME: qty,
                I_LGORT: storage_location,
                I_LETYP: 'IP',
                I_VLTYP: storage_type,
                I_VLBER: '001',
                I_VLPLA: storage_bin
            });

            return result;
        } catch (err) {
            throw err;
        }
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_transferProdSem_2 = async (material, qty, storage_location, storage_type, storage_bin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        try {
            const result = await managed_client.call('L_TO_CREATE_SINGLE', {
                I_LGNUM: '521',
                I_BWLVS: '199',
                I_MATNR: material,
                I_WERKS: '5210',
                I_ANFME: qty,
                I_LGORT: storage_location,
                I_LETYP: 'IP',
                I_NLTYP: storage_type,
                I_NLBER: '001',
                I_NLPLA: storage_bin
            });

            return result;
        } catch (err) {
            throw err;
        }
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_consultaMaterial_VUL = async (material_number, storage_location, storage_type, storage_bin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ ${material_number.toUpperCase()} AND LGTYP EQ '${storage_type}' AND LGPLA EQ '${storage_bin}'` }]
            // FIELDS: ["MATNR", "LGORT", "LGTYP", "LGPLA"]
        });

        let columns = [];
        let rows = [];
        let fields = result.FIELDS;
        fields.forEach(field => {
            columns.push(field.FIELDNAME);
        });

        let data = result.DATA;
        data.forEach(data_ => {
            rows.push(data_.WA.split(","));
        });

        let res = rows.map(row => Object.fromEntries(
            columns.map((key, i) => [key, row[i]])
        ));

        return res;
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    } 
}

funcion.sapRFC_HUSEM = async (storage_location, material, cantidad) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
        
        const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKKP',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `POBJID EQ 'UC${material}'` }],
            FIELDS: ['PACKNR']
        });

        const result_packing_material = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKPO',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${result_packing_object.DATA[0].WA}' AND PAITEMTYPE EQ 'P'` }],
            FIELDS: ['MATNR']
        });

        const result_hu_create = await managed_client.call('BAPI_HU_CREATE', {
            HEADERPROPOSAL: {
                PACK_MAT: result_packing_material.DATA[0].WA,
                HU_GRP3: 'UC11',
                PACKG_INSTRUCT: result_packing_object.DATA[0].WA,
                PLANT: '5210',
                L_PACKG_STATUS_HU: '2',
                HU_STATUS_INIT: 'A',
                STGE_LOC: storage_location
            },
            ITEMSPROPOSAL: [{
                HU_ITEM_TYPE: '1',
                MATERIAL: material,
                PACK_QTY: cantidad,
                PLANT: '5210',
            }],
        });

        const result_commit = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        const result_hu_change_header = await managed_client.call('BAPI_HU_CHANGE_HEADER', {
            HUKEY: result_hu_create.HUKEY,
            HUCHANGED: {
                CLIENT: '200',
                PACK_MAT_OBJECT: '07',
                WAREHOUSE_NUMBER: '521',
                HU_STOR_LOC: 'A'
            },
        });

        const result_commit2 = await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        return result_hu_create
    } catch (err) {
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
}

module.exports = funcion;