const funcion = {};
const axios = require('axios');

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');
const dbBartender = require('../connections/db/connection_bartender');
const dbEX = require('../connections/db/connection_extr');
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

funcion.materialEXT = async (material) => {
    try {
        const result = await dbBartender(`
            SELECT
                *
            FROM
                extr
            WHERE
                no_sap = '${material}'
        `);
        return result;
    } catch (error) {
        throw error;
    }
}

funcion.update_plan_ext = async (plan_id) => {
    try {
        const result = await dbEX(`
            UPDATE
                production_plan
            SET
                status = "Impreso"
            WHERE
                plan_id = '${plan_id}'
        `);
        return result;
    } catch (error) {
        throw error;
    }
};

funcion.update_print_ext = async (serial_num, plan_id, material, emp_num, cantidad, impresoType) => {
    try {
        const result = await dbEX(`
            INSERT INTO extrusion_labels (serial, plan_id, numero_parte, emp_num, cantidad, status) 
                VALUES(${serial_num},'${plan_id}', '${material}', ${emp_num}, ${cantidad}, '${impresoType}')
        `);
        return result;
    } catch (error) {
        throw error;
    }
};

funcion.update_acred_ext = async (status, result_acred, emp_num, serial) => {
    try {
        const result = await dbEX(`
            UPDATE 
                extrusion_labels 
            SET 
                status = '${status}', result_acred = '${result_acred}', emp_acred = '${emp_num}' 
            WHERE 
                serial = ${serial}
        `);
        return result;
    } catch (error) {
        throw error;
    }
};

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

funcion.dBinsert_cycle_Listed_storage_units = async (storage_type, storage_bin, storage_units, emp_num) => {
    try {
        let valores_finales = [];
        let arreglo_arreglos = [];

        for (let i = 0; i < storage_units.length; i++) {
            valores_finales = [];

            valores_finales.push(`${storage_type}`);
            valores_finales.push(`${storage_bin}`);
            valores_finales.push(`${storage_units[i]}`);
            valores_finales.push(`${emp_num}`);
            valores_finales.push(`OK`);
            arreglo_arreglos.push(valores_finales);
        }

        let sql = `INSERT INTO cycle_count (storage_type, storage_bin, storage_unit, emp_num, status) VALUES ?`;

        const result = await dbC(sql, [arreglo_arreglos]);
        return result.affectedRows;
    } catch (error) {
        throw error;
    }
}

funcion.dBinsert_cycle_result = async (storage_type, storage_bin, storage_unit, emp_num, status, sap_result) => {
    try {
        await dbC(`INSERT INTO cycle_count (storage_type, storage_bin, storage_unit, emp_num, status, sap_result) 
                VALUES ("${storage_type}", "${storage_bin}", "${storage_unit}", "${emp_num}", "${status}", "${sap_result}")`);
        return;
    } catch (error) {
        throw error;
    }
}

funcion.sapRFC_HUEXT = async (storage_location, material, cantidad) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKKP',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `POBJID EQ 'UC${material.toUpperCase()}'` }],
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
        return err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.printLabel_EXT = async (data, labelType) => {
    try {
        const result = await axios({
            method: 'POST',
            url: `http://${process.env.BARTENDER_SERVER}:${process.env.BARTENDER_PORT}/Integration/${labelType}/Execute/`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: JSON.stringify(data)
        });
        return result;
    } catch (err) {
        throw err;
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

funcion.sapRFC_consultaHUCreationDate = async (hu_number) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();

        const vekp_result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VEKP',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `EXIDV EQ '${hu_number}' ` }],
            FIELDS: ["VPOBJKEY"]
        });

        if (vekp_result.DATA.length === 0) {
            return [];
        }

        const vekp_columns = vekp_result.FIELDS.map(field => field.FIELDNAME);
        const vekp_rows = vekp_result.DATA.map(data_ => data_.WA.split(","));
        const vekp_res = vekp_rows.map(row => Object.fromEntries(vekp_columns.map((key, i) => [key, row[i]])));

        const vevw_result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VEVW',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `OBJKEY EQ '${vekp_res[0].VPOBJKEY}' ` }]
        });

        const columns = vevw_result.FIELDS.map(field => field.FIELDNAME);
        const rows = vevw_result.DATA.map(data_ => data_.WA.split(","));
        const vevw_res = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));

        return vevw_res;
    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.sapRFC_transferExtRP = async (serial, storage_type, storage_bin) => {
    let managed_client
    try {
        ;
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('L_TO_CREATE_MOVE_SU', {
            I_LENUM: `${funcion.addLeadingZeros(serial, 20)}`,
            I_BWLVS: `998`,
            I_LETYP: `IP`,
            I_NLTYP: `${storage_type.toUpperCase()}`,
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
}

funcion.sapRFC_consultaMaterial_EXT = async (material_number, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `MATNR EQ '${material_number.toUpperCase()}' AND LGTYP EQ '${storage_type}' AND LGPLA EQ '${storage_bin}'` }]
            // FIELDS: ["MATNR", "LGORT", "LGTYP", "LGPLA"]
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
}

funcion.sapRFC_transferEXTPR_1 = async (material, cantidad, fromStorageLocation, fromStorageType, fromStorageBin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('L_TO_CREATE_SINGLE', {
            I_LGNUM: `521`,
            I_BWLVS: `100`,
            I_MATNR: `${material}`,
            I_WERKS: `5210`,
            I_ANFME: `${cantidad}`,
            I_LGORT: `${fromStorageLocation.toUpperCase()}`,
            I_LETYP: `IP`,
            I_VLTYP: `${fromStorageType.toUpperCase()}`,
            I_VLBER: `001`,
            I_VLPLA: `${fromStorageBin.toUpperCase()}`
        });


        return result;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.sapRFC_transferEXTPR_2 = async (material, cantidad, toStorageLocation) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('L_TO_CREATE_SINGLE', {
            I_LGNUM: `521`,
            I_BWLVS: `199`,
            I_MATNR: `${material}`,
            I_WERKS: `5210`,
            I_ANFME: `${cantidad}`,
            I_LGORT: `${toStorageLocation.toUpperCase()}`,
            I_LETYP: `IP`,
            I_NLTYP: `EXT`,
            I_NLBER: `001`,
            I_NLPLA: `TEMPR_EXT`
        });

        return result;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
}

funcion.printLabelTRA = async (data, labelType) => {
    try {
        const result = await axios({
            method: 'POST',
            url: `http://${process.env.BARTENDER_SERVER}:${process.env.BARTENDER_PORT}/Integration/${labelType}/Execute/`,
            headers: {
                'Content-Type': 'application/json',
            },
            data: JSON.stringify(data)
        });
        return result;
    } catch (err) {
        throw err;
    }
}

funcion.sapRFC_transferEXTProd = async (serial, storage_location, storage_type, storage_bin) => {
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
};

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

funcion.sapRFC_transferExt = async (serial, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result = await managed_client.call('L_TO_CREATE_MOVE_SU', {
            I_LENUM: `${funcion.addLeadingZeros(serial, 20)}`,
            I_BWLVS: `998`,
            I_LETYP: `IP`,
            I_NLTYP: `EXT`,
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


funcion.backflushEXT = async (serial, product_version) => {
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
        // Sort by TBNUM field in descending order
        res.sort((a, b) => (parseInt(b.TBNUM) - parseInt(a.TBNUM)));
        return res;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        return err;
    } finally {
        if (managed_client) { await createSapRfcPool.release(managed_client) };
    }
};

funcion.sapRFC_transferVul_TR = async (serial_num, quantity, storage_type, storage_bin, tbnum) => {
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

funcion.sapRFC_HUDETAIL = async (hu_number) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();
        const result_vekp = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VEKP',
            DELIMITER: ',',
            OPTIONS: [{ TEXT: `EXIDV EQ '${funcion.addLeadingZeros(hu_number, 20)}'` }],
            FIELDS: ['VENUM', 'PACKVORSCHR'],
        });
        if (result_vekp.DATA.length === 0) {
            return result_vekp;
        }

        const arrayResultVEKP = result_vekp.DATA[0].WA.split(result_vekp.DELIMITER);
        const result_packing_object = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'PACKKP',
            DELIMITER: ",",
            OPTIONS: [{ TEXT: `PACKNR EQ '${arrayResultVEKP[1]}'` }],
            FIELDS: ['POBJID']
        });
        const result_vepo = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'VEPO',
            DELIMITER: ',',
            OPTIONS: [{ TEXT: `VENUM EQ '${arrayResultVEKP[0]}'` }],
            FIELDS: ['MATNR', 'VEMNG'],
        });

        const pobjid = result_packing_object.DATA[0].WA.trim();
        const arrayresult_vepo = result_vepo.DATA[0].WA.split(result_vekp.DELIMITER);

        arrayresult_vepo.push(pobjid);

        const finalResult = {
            ...result_vepo,
            DATA: [{
                WA: arrayresult_vepo.join(result_vekp.DELIMITER)
            }]
        };


        return finalResult;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

module.exports = funcion;