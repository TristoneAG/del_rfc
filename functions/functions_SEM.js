const funcion = {};
const axios = require('axios');

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');
const dbBartender = require('../connections/db/connection_bartender');
const dbC = require('../connections/db/connection_cycle');

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

funcion.getProductVersion = async (station) => {
    try {
        const result = await dbB10(`
            SELECT product_version
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

funcion.sapFromMandrel = async (mandrel, table) => {
    try {
        const result = await dbBartender(`
            SELECT
                no_sap
            FROM
                ${table}
            WHERE
                cust_part = "${mandrel}"
        `);
        return result;
    } catch (error) {
        throw error;
    }
}

funcion.dBinsert_cycle_Listed_storage_units = (storage_type, storage_bin, storage_units, emp_num) => {
    return new Promise((resolve, reject) => {
        let valores_finales = []
        let arreglo_arreglos = []

        for (let i = 0; i < storage_units.length; i++) {
            valores_finales = []

            valores_finales.push(`${storage_type}`)
            valores_finales.push(`${storage_bin}`)
            valores_finales.push(`${storage_units[i]}`)
            valores_finales.push(`${emp_num}`)
            valores_finales.push(`OK`)
            arreglo_arreglos.push(valores_finales)
        }

        let sql = `INSERT INTO cycle_count (storage_type, storage_bin, storage_unit, emp_num, status) VALUES ?`;

        dbC(sql, [arreglo_arreglos])
            .then((result) => {
                resolve(result.affectedRows)
            })
            .catch((error) => { reject(error) })

    })

}

funcion.dBinsert_cycle_result = (storage_type, storage_bin, storage_unit, emp_num, status, sap_result) => {
    return new Promise((resolve, reject) => {



        dbC(`INSERT INTO cycle_count (storage_type, storage_bin, storage_unit, emp_num, status, sap_result) 
                VALUES ("${storage_type}", "${storage_bin}", "${storage_unit}", "${emp_num}", "${status}", "${sap_result}")`)
            .then((result) => { resolve(result) })
            .catch((error) => { reject(error) })

    })

}

funcion.dBinsertListed_OKBIN = (storage_type, storage_bin, storage_units, emp_num) => {
    return new Promise((resolve, reject) => {


        let sql = `INSERT INTO cycle_count (storage_type, storage_bin, storage_unit, emp_num, status) VALUES ?`;

        dbC(sql, [[storage_type, storage_bin, "", emp_num, ""]])
            .then((result) => {
                resolve(result.affectedRows)
            })
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
            platform: "SEM"
        };
        // let printedLabel = await funcion.printLabel_SEM(data, "SEM")
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

funcion.sapRFC_consultaMaterial = async (material_number, storage_location) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ '${material_number}'   AND LGORT EQ '${storage_location}'` }]
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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_transferSEM = async (serial, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('L_TO_CREATE_MOVE_SU', {
            I_LENUM: `${funcion.addLeadingZeros(serial, 20)}`,
            I_BWLVS: `998`,
            I_LETYP: `IP`,
            I_NLTYP: `SEM`,
            I_NLBER: `001`,
            I_NLPLA: `${storage_bin.toUpperCase()}`
        });

        return result;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.sapRFC_consultaStorageBin = async (storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `LGORT EQ '${storage_location}' AND LGTYP EQ '${storage_type}' AND LGPLA EQ '${storage_bin.toUpperCase()}'` }]
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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.backflushSEM = async (serial, product_version) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        const result = await managed_client.call('ZWM_HU_MFHU', {
            I_EXIDV: `${funcion.addLeadingZeros(serial, 20)}`,
            I_VERID: `${product_version}`
        });
        return result;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_TBNUM = async (material, cantidad) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
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
        await createSapRfcPool.destroy(managed_client);
        return err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.sapRFC_transferSEM_TR = async (serial_num, quantity, storage_type, storage_bin, tbnum) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        try {
            const result = await managed_client.call('L_TO_CREATE_TR', {
                I_LGNUM: '521',
                I_TBNUM: `${tbnum}`,
                IT_TRITE:
                    [{
                        TBPOS: "001",
                        ANFME: `${quantity}`,
                        ALTME: "ST",
                        NLTYP: `${storage_type}`,
                        NLBER: "001",
                        NLPLA: `${storage_bin}`,
                        NLENR: `${funcion.addLeadingZeros(serial_num, 20)}`,
                        LETYP: "001"
                    }]
            });

            return result;
        } catch (err) {
            throw err;
        }
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.sapRFC_consultaStorageUnit = async (storage_unit) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

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
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.sapRFC_transferSemProd = async (serial, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_consultaMaterial_SEM = async (material_number, storage_location, storage_type) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.sapRFC_transferProdSem_1 = async (material, qty, storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.sapRFC_transferProdSem_2 = async (material, qty, storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};


funcion.sapRFC_consultaMaterial_SEM2 = async (material_number, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
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
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_HUSEM = async (storage_location, material, cantidad) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

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

        await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        await managed_client.call('BAPI_HU_CHANGE_HEADER', {
            HUKEY: result_hu_create.HUKEY,
            HUCHANGED: {
                CLIENT: '200',
                PACK_MAT_OBJECT: '07',
                WAREHOUSE_NUMBER: '521',
                HU_STOR_LOC: 'A'
            },
        });

        await managed_client.call("BAPI_TRANSACTION_COMMIT", { WAIT: "X" });

        return result_hu_create
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_transferSlocCheck = async (serial, storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result_suCheck = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `LENUM EQ '${funcion.addLeadingZeros(serial, 20)}'` }]
        });
        const columns = result_suCheck.FIELDS.map(field => field.FIELDNAME);
        const rows = result_suCheck.DATA.map(data_ => data_.WA.split(","));

        const res = rows.map(row => Object.fromEntries(
            columns.map((key, i) => [key, row[i]])
        ));

        if (res.length === 0) {
            return ({ "key": "SU_DOESNT_EXIST", "abapMsgV1": `${serial}` });

        } else if (res[0].LGORT !== storage_location) {
            return ({ "key": "Storage Locations do not match", "abapMsgV1": `${serial}` });
        } else {
            const inputParameters = {
                I_LENUM: funcion.addLeadingZeros(serial, 20),
                I_BWLVS: '998',
                I_NLTYP: storage_type,
                I_NLBER: '001',
                I_NLPLA: storage_bin.toUpperCase()
            };
            const result = await managed_client.call('L_TO_CREATE_MOVE_SU', inputParameters);
            return result;
        }
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.sapRFC_transferSEMProd = async (serial, storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        const result_suCheck = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `LENUM EQ '${funcion.addLeadingZeros(serial, 20)}'` }]
        });
        const columns = result_suCheck.FIELDS.map(field => field.FIELDNAME);
        const rows = result_suCheck.DATA.map(data_ => data_.WA.split(","));

        const res = rows.map(row => Object.fromEntries(
            columns.map((key, i) => [key, row[i]])
        ));

        if (res.length === 0) {
            return ({ "key": "SU_DOESNT_EXIST", "abapMsgV1": `${serial}` });

        } else if (res[0].LGTYP !== "SEM" || res[0].LGORT !== storage_location) {
            return ({ "key": `Check SU SType: ${res[0].LGTYP}, SLocation: ${res[0].LGORT}`, "abapMsgV1": `${serial}` });
        } else {
            const result = await managed_client.call('L_TO_CREATE_MOVE_SU', {
                I_LENUM: `${funcion.addLeadingZeros(serial, 20)}`,
                I_BWLVS: '998',
                I_LETYP: 'IP',
                I_NLTYP: storage_type.toUpperCase(),
                I_NLBER: '001',
                I_NLPLA: storage_bin.toUpperCase()
            });
            return result;
        }
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_consultaMaterial_ST = async (material_number, storage_location, storage_type) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const options = {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ '${material_number.toUpperCase()}' AND LGORT EQ '${storage_location}' AND LGTYP EQ '${storage_type}' ` }]
        };

        const result = await managed_client.call('RFC_READ_TABLE', options);
        const columns = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));
        return res;
    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_SbinOnStypeExists = async (storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LAGP',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `LGNUM EQ 521 AND LGTYP EQ '${storage_type}' AND LGPLA EQ '${storage_bin}'` }]
            // FIELDS: ["MATNR", "LGORT", "LGTYP", "LGPLA"]
        });
        const fields = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(fields.map((key, i) => [key, row[i]])));
        return res;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

module.exports = funcion;