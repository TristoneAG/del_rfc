const funcion = {};

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');
const dbB10 = require('../connections/db/connection_b10');

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


funcion.sapRFC_consultaMaterial_RW = async (material_number, storage_location, storage_type, storage_bin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();    
        const result = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LQUA',
            DELIMITER: ",",
            OPTIONS: [
                { TEXT: `MATNR EQ '${material_number.toUpperCase()}' AND LGTYP EQ '${storage_type}'` },
                { TEXT: `AND LGORT EQ '${storage_location}' AND LGPLA EQ '${storage_bin.toUpperCase()}'` }
            ]
        });


        const columns = result.FIELDS.map(field => field.FIELDNAME);
        const rows = result.DATA.map(data_ => data_.WA.split(","));
        const res = rows.map(row => Object.fromEntries(columns.map((key, i) => [key, row[i]])));

        return res;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client)}}, 500);
    }
};


funcion.sapRFC_transferMaterial_RW = async (material, cantidad, fromStorageLocation, fromStorageType, fromStorageBin, toStorageType, toStorageBin) => {
    let managed_client
    try {
        managed_client = await createSapRfcPool.acquire();   
        const result = await managed_client.call('L_TO_CREATE_SINGLE', {
            I_LGNUM: `521`,
            I_BWLVS: `998`,
            I_MATNR: `${material}`,
            I_WERKS: `5210`,
            I_LGORT: `${fromStorageLocation.toUpperCase()}`,
            I_ANFME: `${cantidad}`,
            I_LETYP: `IP`,
            I_VLTYP: `${fromStorageType.toUpperCase()}`,
            I_VLBER: `001`,
            I_VLPLA: `${fromStorageBin.toUpperCase()}`,
            I_NLTYP: `${toStorageType.toUpperCase()}`,
            I_NLBER: `001`,
            I_NLPLA: `${toStorageBin.toUpperCase()}`,
        });


        return result;
    } catch (err) {
        await createSapRfcPool.destroy(managed_client);
        throw err;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client)}}, 500);
    }
};

module.exports = funcion;