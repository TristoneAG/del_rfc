const { log } = require('async');
const genericPool = require('generic-pool');
const rfc = require('node-rfc');

const sapConfig = {
  // Your SAP system configuration
  user: process.env.RFC_USER,
  passwd: process.env.RFC_PASSWD,
  ashost: process.env.RFC_ASHOST,
  sysnr: process.env.RFC_SYSNR,
  client: process.env.RFC_CLIENT,
  lang: process.env.RFC_LANG,
};

const factory = {
  create: function () {
    return new Promise((resolve, reject) => {
      const client = new rfc.Client(sapConfig);
      client.connect((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(client);
        }
      });
    });
  },
  destroy: function (client) {
    return new Promise((resolve, reject) => {
      client.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};

const opts = {
  max: 10, // maximum size of the pool
  min: 1  // minimum size of the pool
};

const sapRfcPool = genericPool.createPool(factory, opts);



module.exports = sapRfcPool;