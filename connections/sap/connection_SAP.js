const Pool = require("node-rfc").Pool;
const retry = require("retry");

const abapSystem = {
  user: process.env.RFC_USER,
  passwd: process.env.RFC_PASSWD,
  ashost: process.env.RFC_ASHOST,
  sysnr: process.env.RFC_SYSNR,
  client: process.env.RFC_CLIENT,
  lang: process.env.RFC_LANG,
};

function createSapRfcPool() {
  return new Pool({
    connectionParameters: abapSystem,
    clientOptions: {},
    poolOptions: { low: 0, high: 15 },
  });
}

let node_RFC = createSapRfcPool();

async function ensureSapConnection() {
  const retry_operation = retry.operation({
    retries: 360,
    minTimeout: 10000,
  });

  return new Promise((resolve, reject) => {
    retry_operation.attempt(async function (currentAttempt) {
      try {
        const client = await node_RFC.acquire();
        client.release();
        resolve(node_RFC);
      } catch (error) {
        console.error(`Attempt ${currentAttempt}: Error acquiring connection from SAP pool:`, error);
        node_RFC = createSapRfcPool();
        if (retry_operation.retry(error)) {
          return;
        }
        reject(retry_operation.mainError());
      }
    });
  });
}

module.exports = ensureSapConnection;