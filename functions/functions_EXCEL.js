const funcion = {};

//Require Node-RFC
const createSapRfcPool = require('../connections/sap/connection_SAP');

/**
 * Validates and prepares SQL query for SAP RFC_READ_TABLE
 * Validates query safety, structure, and splits into OPTIONS array if needed
 * @param {string} queryText - The SQL query text to validate and prepare
 * @param {RegExp} expectedPattern - Optional regex pattern to validate query structure
 * @returns {Array} - Array of OPTIONS objects with TEXT property (ready for RFC_READ_TABLE)
 * @throws {Error} - If query is invalid, contains dangerous patterns, or structure is wrong
 */
funcion.prepareSapSqlQuery = (queryText, expectedPattern = null) => {
    const MAX_LENGTH = 72;

    // Validate input
    if (!queryText || typeof queryText !== 'string') {
        throw new Error('SQL query must be a non-empty string');
    }

    const trimmedQuery = queryText.trim();

    if (!trimmedQuery) {
        throw new Error('SQL query cannot be empty after trimming');
    }

    // Check for SQL injection patterns and invalid characters that can break SAP OpenSQL queries
    // Comment markers, statement terminators, invalid quote types, and commas
    if (trimmedQuery.includes('--') ||
        trimmedQuery.includes('/*') ||
        trimmedQuery.includes('*/') ||
        trimmedQuery.includes(';') ||
        trimmedQuery.includes('"') ||
        trimmedQuery.includes('`') ||
        trimmedQuery.includes('´') ||
        trimmedQuery.includes(',')) {
        throw new Error(`SQL query contains potentially dangerous patterns or invalid characters: ${trimmedQuery}`);
    }

    // Validate single quotes are properly paired and used correctly
    // Count single quotes - should be even number (opening and closing for string literals)
    const singleQuoteCount = (trimmedQuery.match(/'/g) || []).length;
    if (singleQuoteCount % 2 !== 0) {
        throw new Error(`SQL query has unpaired single quotes: ${trimmedQuery}`);
    }

    // Check for escaped single quotes (two consecutive quotes) which could be used for injection
    if (trimmedQuery.includes("''")) {
        throw new Error(`SQL query contains escaped single quotes which could be dangerous: ${trimmedQuery}`);
    }

    // Validate against expected pattern if provided
    if (expectedPattern && !expectedPattern.test(trimmedQuery)) {
        throw new Error(`Invalid SQL query structure. Got: ${trimmedQuery}`);
    }

    // If query fits in one OPTIONS entry, return it
    if (trimmedQuery.length <= MAX_LENGTH) {
        return [{ TEXT: trimmedQuery }];
    }

    // Split query into multiple OPTIONS entries
    const options = [];
    // Find all positions of AND/OR operators (case insensitive)
    const operatorRegex = /\s+(AND|OR)\s+/gi;
    const breakPoints = [];
    let match;

    while ((match = operatorRegex.exec(trimmedQuery)) !== null) {
        breakPoints.push({
            position: match.index + match[0].length, // Position after the operator
            operator: match[1].toUpperCase() // AND or OR
        });
    }

    if (breakPoints.length === 0) {
        // No AND/OR found, cannot split safely - throw error
        throw new Error(`Query exceeds ${MAX_LENGTH} characters and cannot be split safely (no AND/OR operators found): ${trimmedQuery}`);
    }

    let startPos = 0;
    let currentChunk = '';

    for (let i = 0; i < breakPoints.length; i++) {
        const breakPoint = breakPoints[i];
        const segment = trimmedQuery.substring(startPos, breakPoint.position).trim();

        // Test if adding this segment to current chunk would exceed limit
        const testChunk = currentChunk ? `${currentChunk} ${segment}` : segment;

        if (testChunk.length <= MAX_LENGTH) {
            currentChunk = testChunk;
        } else {
            // Current chunk is full, save it
            if (currentChunk) {
                options.push({ TEXT: currentChunk });
            }
            // Start new chunk with the operator and segment
            currentChunk = `${breakPoint.operator} ${segment}`;

            // If even this is too long, throw error
            if (currentChunk.length > MAX_LENGTH) {
                throw new Error(`Query segment exceeds ${MAX_LENGTH} characters: ${currentChunk}`);
            }
        }

        startPos = breakPoint.position;
    }

    // Add remaining part after last break point
    const remaining = trimmedQuery.substring(startPos).trim();
    if (remaining) {
        const testChunk = currentChunk ? `${currentChunk} ${remaining}` : remaining;
        if (testChunk.length <= MAX_LENGTH) {
            currentChunk = testChunk;
        } else {
            if (currentChunk) {
                options.push({ TEXT: currentChunk });
            }
            // Add AND prefix if not first option
            currentChunk = options.length > 0 ? `AND ${remaining}` : remaining;

            // Validate remaining chunk length
            if (currentChunk.length > MAX_LENGTH) {
                throw new Error(`Query segment exceeds ${MAX_LENGTH} characters: ${currentChunk}`);
            }
        }
    }

    // Add final chunk
    if (currentChunk) {
        options.push({ TEXT: currentChunk });
    }

    return options;
};

funcion.RFC_REQUISITION = async (requisition_number, requisition_item) => {
    // Input validation
    if (!requisition_number || !requisition_item) {
        throw new Error('Both requisition_number and requisition_item are required');
    }

    // Sanitize inputs to prevent injection (remove single quotes and semicolons)
    const sanitizedReqNumber = String(requisition_number).replace(/[';]/g, '');
    const sanitizedReqItem = String(requisition_item).replace(/[';]/g, '');

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        const fieldNames = [
            'EBELN',  // PO Number
            'EBELP',  // PO Item
            'BEDAT',  // PO Creation Date
            'AFNAM',  // Requisitor
            'TXZ01',  // Description
            'MENGE',  // Quantity
            'PREIS',  // Price
            'WAERS',  // Currency
            'LIFNR',  // Vendor
            'BADAT',  // Req Date
            'LFDAT',  // Promise Date
            'FRGKZ',  // Release Indicator
            'FRGST',  // Release Strategy
            'FRGZU',  // Release State
            'LOEKZ'   // Canceled
        ];

        // Enhanced sanitization for OpenSQL safety - remove all special chars and limit length
        const safeReqNumber = String(sanitizedReqNumber).trim().replace(/[^A-Za-z0-9]/g, '').substring(0, 10);
        const safeReqItem = String(sanitizedReqItem).trim().replace(/[^0-9]/g, '').substring(0, 5);

        // Validate sanitized values are not empty
        if (!safeReqNumber || !safeReqItem) {
            throw new Error('Invalid requisition number or item after sanitization');
        }

        // Build safe query text
        const queryText = `BANFN EQ '${safeReqNumber}' AND BNFPO EQ '${safeReqItem}'`;

        // Validate and prepare SQL statement for SAP (validates safety, prevents dumps, splits if needed)
        // No pattern needed since we build the query from sanitized inputs
        const optionsArray = funcion.prepareSapSqlQuery(queryText);

        const result_req = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'EBAN',
            DELIMITER: ";",
            OPTIONS: optionsArray,
            FIELDS: fieldNames.map(name => ({ FIELDNAME: name }))
        });

        // Validate response data
        if (!result_req.DATA || result_req.DATA.length === 0) {
            return {
                found: false,
                message: 'No requisition found with the provided number and item'
            };
        }

        const dataRow = result_req.DATA[0].WA.split(';');

        // Map fields using field names for better maintainability
        const fieldMap = {
            po_number: dataRow[0],
            po_item: dataRow[1],
            po_date: dataRow[2],
            requester: dataRow[3],
            description: dataRow[4],
            quantity: dataRow[5],
            price: dataRow[6],
            currency: dataRow[7],
            vendor: dataRow[8],
            req_date: dataRow[9],
            promise_date: dataRow[10],
            release: dataRow[11],
            release_strategy: dataRow[12],
            release_state: dataRow[13],
            canceled: dataRow[14]
        };
        return {
            "found": "true",
            ...fieldMap
        };

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.RFC_PO = async (po_number, po_item) => {
    // Input validation
    if (!po_number || !po_item) {
        throw new Error('Both po_number and po_item are required');
    }

    // Sanitize inputs to prevent injection
    const sanitizedPONumber = String(po_number).replace(/[';]/g, '');
    const sanitizedPOItem = String(po_item).replace(/[';]/g, '');

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        const fieldNames = [
            'BEWTP',  // Document Category
            'ELIKZ',  // Final Invoice
            'CPUDT',  // Entry Date
            'MENGE',  // Quantity
            'BWART',  // Movement Type
            'LFBNR',  // Reference Document
            'WRBTR',  // Amount in Document Currency
            'WAERS',  // Currency
            'BELNR'   // Material Document Number
        ];

        // Enhanced sanitization for OpenSQL safety - remove all special chars and limit length
        // EBELN is typically 10 chars alphanumeric, EBELP is typically 5 chars numeric
        const safePONumber = String(sanitizedPONumber).trim().replace(/[^A-Za-z0-9]/g, '').substring(0, 10);
        const safePOItem = String(sanitizedPOItem).trim().replace(/[^0-9]/g, '').substring(0, 5);

        // Validate sanitized values are not empty
        if (!safePONumber || !safePOItem) {
            throw new Error('Invalid PO number or item after sanitization');
        }

        // Build safe query text
        const queryText = `EBELN EQ '${safePONumber}' AND EBELP EQ '${safePOItem}'`;

        // Validate and prepare SQL statement for SAP (validates safety, prevents dumps, splits if needed)
        const optionsArray = funcion.prepareSapSqlQuery(queryText);

        const result_po = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'EKBE',
            DELIMITER: ";",
            OPTIONS: optionsArray,
            FIELDS: fieldNames.map(name => ({ FIELDNAME: name }))
        });

        // Validate response data
        if (!result_po.DATA || result_po.DATA.length === 0) {
            return {
                found: false,
                message: 'No purchase order data found with the provided number and item',
                data: []
            };
        }

        // Process all records and filter out reversals
        const allRecords = result_po.DATA.map(row => {
            const dataRow = row.WA.split(';');
            return {
                category: dataRow[0],
                complete: dataRow[1],
                entry_date: dataRow[2],
                quantity: dataRow[3],
                movement_type: dataRow[4],
                reference_doc: dataRow[5],
                amount: dataRow[6],
                currency: dataRow[7],
                material_doc: dataRow[8]
            };
        });

        // Filter out records that have a matching reversal (movement type 102)
        const filteredRecords = allRecords.filter(record => {
            const hasReversal = allRecords.some(r =>
                r.reference_doc === record.reference_doc && r.movement_type === '102'
            );
            return !hasReversal;
        });

        return {
            found: true,
            data: filteredRecords
        };

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.RFC_VENDOR = async (vendor_number) => {
    // Input validation
    if (!vendor_number) {
        throw new Error('vendor_number is required');
    }

    // Sanitize inputs to prevent injection
    const sanitizedVendor = String(vendor_number).replace(/[';]/g, '');

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        // Enhanced sanitization for OpenSQL safety - remove all special chars and limit length
        // LIFNR is typically 10 chars alphanumeric
        const safeVendor = String(sanitizedVendor).trim().replace(/[^A-Za-z0-9]/g, '').substring(0, 10);

        // Validate sanitized value is not empty
        if (!safeVendor) {
            throw new Error('Invalid vendor number after sanitization');
        }

        // Build safe query text
        const queryText = `LIFNR EQ '${safeVendor}'`;

        // Validate and prepare SQL statement for SAP (validates safety, prevents dumps, splits if needed)
        const optionsArray = funcion.prepareSapSqlQuery(queryText);

        const result_vendor = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'LFA1',
            DELIMITER: ";",
            OPTIONS: optionsArray,
            FIELDS: [{ FIELDNAME: 'NAME1' }]
        });

        // Validate response data
        if (!result_vendor.DATA || result_vendor.DATA.length === 0) {
            return {
                found: false,
                message: 'No vendor found with the provided number',
                vendor_name: ''
            };
        }

        const vendor_name = result_vendor.DATA[0].WA.split(';')[0];

        return {
            found: true,
            vendor_name: vendor_name
        };

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.RFC_ACCOUNT = async (requisition_number, requisition_item) => {
    // Input validation
    if (!requisition_number || !requisition_item) {
        throw new Error('Both requisition_number and requisition_item are required');
    }

    // Sanitize inputs to prevent injection
    const sanitizedReqNumber = String(requisition_number).replace(/[';]/g, '');
    const sanitizedReqItem = String(requisition_item).replace(/[';]/g, '');

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        const fieldNames = [
            'SAKTO',  // G/L Account
            'KOSTL',  // Cost Center
            'AUFNR'   // Order Number
        ];

        // Enhanced sanitization for OpenSQL safety - remove all special chars and limit length
        // BANFN is typically 10 chars alphanumeric, BNFPO is typically 5 chars numeric
        const safeReqNumber = String(sanitizedReqNumber).trim().replace(/[^A-Za-z0-9]/g, '').substring(0, 10);
        const safeReqItem = String(sanitizedReqItem).trim().replace(/[^0-9]/g, '').substring(0, 5);

        // Validate sanitized values are not empty
        if (!safeReqNumber || !safeReqItem) {
            throw new Error('Invalid requisition number or item after sanitization');
        }

        // Build safe query text
        const queryText = `BANFN EQ '${safeReqNumber}' AND BNFPO EQ '${safeReqItem}'`;

        // Validate and prepare SQL statement for SAP (validates safety, prevents dumps, splits if needed)
        const optionsArray = funcion.prepareSapSqlQuery(queryText);

        const result_account = await managed_client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'EBKN',
            DELIMITER: ";",
            OPTIONS: optionsArray,
            FIELDS: fieldNames.map(name => ({ FIELDNAME: name }))
        });

        // Validate response data
        if (!result_account.DATA || result_account.DATA.length === 0) {
            return {
                found: false,
                message: 'No account data found with the provided requisition number and item',
                gl_account: '',
                cost_center: '',
                order_number: ''
            };
        }

        const dataRow = result_account.DATA[0].WA.split(';');

        return {
            found: true,
            gl_account: dataRow[0] ? dataRow[0].trim() : '',
            cost_center: dataRow[1] ? dataRow[1].trim() : '',
            order_number: dataRow[2] ? dataRow[2].trim() : ''
        };

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.L_TO_CREATE_SINGLE = async (params) => {
    // Input validation - check for either storage unit (I_VLENR) or storage type/bin (I_VLTYP/I_VLPLA)
    const requiredFields = ['I_BWLVS', 'I_WERKS', 'I_LGNUM', 'I_LGORT', 'I_ANFME', 'I_MATNR', 'I_NLTYP', 'I_NLPLA'];
    for (const field of requiredFields) {
        if (!params[field] && params[field] !== '0') {
            throw new Error(`${field} is required`);
        }
    }

    // Validate that either I_VLENR (from storage unit) OR I_VLTYP/I_VLPLA (from storage type/bin) is provided
    if (!params.I_VLENR && (!params.I_VLTYP || !params.I_VLPLA)) {
        throw new Error('Either I_VLENR (From Storage Unit) or I_VLTYP/I_VLPLA (From Storage Type/Bin) is required');
    }

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        // Prepare import parameters
        const importParams = {
            I_BWLVS: String(params.I_BWLVS || '').trim(),           // Movement Type
            I_WERKS: String(params.I_WERKS || '').trim(),          // Plant
            I_LGNUM: String(params.I_LGNUM || '').trim(),          // Warehouse Number
            I_LGORT: String(params.I_LGORT || '').padStart(4, '0'), // Storage Location (formatted to 4 digits)
            I_ANFME: String(params.I_ANFME || '').trim(),          // Quantity
            I_MATNR: String(params.I_MATNR || '').trim(),          // Material
            I_ALTME: String(params.I_ALTME || '').trim(),          // Alternative Unit of Measure
            I_LETYP: String(params.I_LETYP || '001').trim(),       // Storage Unit Type (default: 001)
            I_NLTYP: String(params.I_NLTYP || '').trim(),           // To Storage Type
            I_NLBER: String(params.I_NLBER || '001').trim(),       // To Storage Section (default: 001)
            I_NLPLA: String(params.I_NLPLA || '').trim()           // To Storage Bin
        };

        // Handle From Storage - either Storage Unit (I_VLENR) or Storage Type/Bin (I_VLTYP/I_VLPLA/I_VLBER)
        if (params.I_VLENR) {
            // Withdrawal from Storage Unit
            importParams.I_VLENR = String(params.I_VLENR || '').padStart(20, '0'); // From Storage Unit (formatted to 20 digits)
        } else {
            // Transfer from Storage Type/Bin
            importParams.I_VLTYP = String(params.I_VLTYP || '').trim();           // From Storage Type
            importParams.I_VLBER = String(params.I_VLBER || '001').trim();       // From Storage Section (default: 001)
            importParams.I_VLPLA = String(params.I_VLPLA || '').trim();         // From Storage Bin
        }

        // Handle To Storage - either Storage Unit (I_NLENR) or just Storage Type/Bin
        if (params.I_NLENR) {
            importParams.I_NLENR = String(params.I_NLENR || '').padStart(20, '0'); // To Storage Unit (formatted to 20 digits)
        }

        // Call the RFC function
        const result = await managed_client.call('L_TO_CREATE_SINGLE', importParams);

        // Extract the transfer order number from the result
        const transferOrderNumber = result.E_TANUM || '';

        // Check for errors in RETURN table (common SAP pattern)
        if (result.RETURN && Array.isArray(result.RETURN) && result.RETURN.length > 0) {
            const errors = result.RETURN.filter(r => r.TYPE === 'E' || r.TYPE === 'A');
            if (errors.length > 0) {
                const errorMessages = errors.map(e => e.MESSAGE || e.MESSAGE_V1 || '').join('; ');
                throw new Error(`SAP Error: ${errorMessages}`);
            }
        }

        return {
            success: true,
            transfer_order_number: transferOrderNumber,
            result: result
        };

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        throw error;
    } finally {
        setTimeout(() => { if (managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.RFC_MB1A = async (scrap_material, header, scrap_reason, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date) => {
    // Input validation
    if (!header || !scrap_reason || !storage_location || !scrap_cost_center ||
        !scrap_component || !scrap_quantity || !posting_date) {
        throw new Error('All parameters are required: scrap_material, header, scrap_reason, storage_location, scrap_cost_center, scrap_component, scrap_quantity, posting_date');
    }

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        // Format posting date (SAP expects YYYYMMDD format)
        const formattedDate = String(posting_date).replace(/-/g, '').replace(/\//g, '').substring(0, 8);

        // Format material number to SAP internal format (18 characters, left-aligned, space-padded)
        const formattedMaterial = String(scrap_component).trim().padEnd(18, ' ');
        const formattedStorageLoc = String(storage_location).padStart(4, '0');
        const formattedReference = String(scrap_material).trim();
        const costCenterInput = String(scrap_cost_center).trim();
        const formattedCostCenter = costCenterInput.length <= 10 ? costCenterInput.padStart(10, '0') : costCenterInput;

        // Prepare BAPI_GOODSMVT_CREATE parameters
        const result_goodsmvt = await managed_client.call('BAPI_GOODSMVT_CREATE', {
            GOODSMVT_CODE: {
                GM_CODE: '03' // Goods issue code (03 for goods issue)
            },
            GOODSMVT_HEADER: {
                PSTNG_DATE: formattedDate,
                DOC_DATE: formattedDate,
                HEADER_TXT: String(header).trim(),
                REF_DOC_NO: formattedReference,
            },
            GOODSMVT_ITEM: [{
                MATERIAL: formattedMaterial,
                PLANT: '5210',
                STGE_LOC: formattedStorageLoc,
                MOVE_TYPE: '551',
                ENTRY_QNT: String(scrap_quantity).trim(),
                COSTCENTER: formattedCostCenter,
                MOVE_REAS: String(scrap_reason).trim()
            }]
        });

        // Check for errors - simple check like the working example
        if (result_goodsmvt.RETURN && result_goodsmvt.RETURN[0]?.TYPE === 'E') {
            await managed_client.call('BAPI_TRANSACTION_ROLLBACK', {});
            // Format error response similar to Python version
            const errorMessage = result_goodsmvt.RETURN[0].MESSAGE || 'Unknown error';
            return {
                result: "N/A",
                error: errorMessage
            };
        } else {
            await managed_client.call('BAPI_TRANSACTION_COMMIT', {});
            // Extract document number and format response
            const documentNumber = result_goodsmvt.MATERIALDOCUMENT || result_goodsmvt.GOODSMVT_HEADRET?.MAT_DOC || '';
            if (documentNumber) {
                return { result: `Material document ${documentNumber} posted`, error: "N/A" };
            } else {
                return { result: "N/A", error: "Document created but document number not returned" };
            }
        }

    } catch (error) {
        await createSapRfcPool.destroy(managed_client);
        return { result: "N/A", error: error.message || String(error) };
    } finally {
        setTimeout(() => { if (managed_client && managed_client.alive) { createSapRfcPool.release(managed_client) } }, 500);
    }
};

funcion.RFC_MB1A_711_712 = async (
    scrap_material,
    header,
    storage_location,
    scrap_cost_center,
    scrap_component,
    scrap_quantity,
    posting_date,
    movement_type,
    issueStorageType,
    issueStorageBin
) => {
    if (!header || !storage_location || !scrap_cost_center || !scrap_component || !scrap_quantity || !posting_date || !movement_type || !issueStorageType || !issueStorageBin) {
        throw new Error('All parameters are required');
    }

    const moveType = String(movement_type).trim();
    if (moveType !== '711' && moveType !== '712') {
        return {
            result: "N/A",
            error: `Invalid movement type ${moveType}`
        };
    }

    let managed_client = null;
    try {
        managed_client = await createSapRfcPool.acquire();

        const formattedDate = String(posting_date).replace(/-/g, '').replace(/\//g, '').substring(0, 8);
        const formattedMaterial = String(scrap_component).trim().padEnd(18, ' ');
        const formattedStorageLoc = String(storage_location).padStart(4, '0');
        const formattedReference = String(scrap_material).trim();
        const formattedCostCenter = String(scrap_cost_center).trim().padStart(10, '0');

        const result_goodsmvt = await managed_client.call('BAPI_GOODSMVT_CREATE', {
            GOODSMVT_CODE: { GM_CODE: '03' },
            GOODSMVT_HEADER: {
                PSTNG_DATE: formattedDate,
                DOC_DATE: formattedDate,
                HEADER_TXT: String(header).trim(),
                REF_DOC_NO: formattedReference,
            },
            GOODSMVT_ITEM: [{
                MATERIAL: formattedMaterial,
                PLANT: '5210',
                STGE_LOC: formattedStorageLoc,
                MOVE_TYPE: moveType,
                ENTRY_QNT: String(scrap_quantity).trim(),
                COSTCENTER: formattedCostCenter,
            }]
        });

        if (result_goodsmvt.RETURN?.[0]?.TYPE === 'E') {
            await managed_client.call('BAPI_TRANSACTION_ROLLBACK', {});
            return {
                result: "N/A",
                error: result_goodsmvt.RETURN[0].MESSAGE
            };
        }
        const materialDoc = result_goodsmvt.MATERIALDOCUMENT || result_goodsmvt.GOODSMVT_HEADRET?.MAT_DOC; 
        await managed_client.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
        let sourceStorageType;
        let sourceStorageBin;
        let destStorageType;
        let destStorageBin;

        if (moveType === '711') {
            sourceStorageType = issueStorageType;
            sourceStorageBin = issueStorageBin;
            destStorageType = '999';
            destStorageBin = '0000000000';
        } else {
            sourceStorageType = '999';
            sourceStorageBin = '0000000000';
            destStorageType = issueStorageType;
            destStorageBin = issueStorageBin;
        }

        const toResult = await funcion.L_TO_CREATE_SINGLE({
            I_BWLVS: 998,
            I_WERKS: '5210',
            I_LGNUM: '521',
            I_LGORT: formattedStorageLoc,
            I_ANFME: scrap_quantity,
            I_ALTME: '',
            I_MATNR: formattedMaterial,
            I_VLTYP: sourceStorageType,
            I_VLPLA: sourceStorageBin,
            I_NLTYP: destStorageType,
            I_NLPLA: destStorageBin
        });
        return {
            result: `Material document ${materialDoc}, TO ${toResult.transfer_order_number}`,
            error: "N/A"
        };
    } catch (error) {
        if (managed_client) {
            await managed_client.call('BAPI_TRANSACTION_ROLLBACK', {});
        }
        return {
            result: "N/A",
            error: error.message
        };
    } finally {
        if (managed_client && managed_client.alive) {
            createSapRfcPool.release(managed_client);
        }
    }
};





module.exports = funcion;