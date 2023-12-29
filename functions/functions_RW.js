const funcion = {};

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


funcion.sapRFC_consultaMaterial_RW = async (material_number, storage_location, storage_type, storage_bin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
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
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};


funcion.sapRFC_transferMaterial_RW = async (material, cantidad, fromStorageLocation, fromStorageType, fromStorageBin, toStorageType, toStorageBin) => {
    let sapRFCPool
    let managed_client
    try {
        sapRFCPool = await createSapRfcPool();
        managed_client = await sapRFCPool.acquire();
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
        throw err;
    } finally {
        if (managed_client) { managed_client.release() };
    }
};

module.exports = funcion;