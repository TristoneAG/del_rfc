const mysql = require('mysql');

if (!process.env.DB_B10_HOST || !process.env.DB_B10_USER || !process.env.DB_B10_PASS || !process.env.DB_CONN_B10) {
  throw new Error('Missing required environment variables for database connection');
}

const pool = mysql.createPool({
  connectionLimit: 10,
  supportBigNumbers: true,
  host: process.env.DB_B10_HOST,
  user: process.env.DB_B10_USER,
  password: process.env.DB_B10_PASS,
  database: process.env.DB_CONN_B10
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle MySQL connection', err);
});

function query(sql, args) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }
      connection.query(sql, args, (err, results) => {
        connection.release();
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  });
}

module.exports = query;