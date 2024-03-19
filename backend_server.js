require('dotenv').config('../.env')
const express = require('express')
const app = express()
const morgan = require('morgan')

// Validate environment variables
if (!process.env.BACKEND_PORT) { console.error('Missing environment variable: BACKEND_PORT'); process.exit(1);}
const portNumber = process.env.BACKEND_PORT || process.env.BACKEND_PORT || 5000

app.use(morgan('dev')) // Morgan needs to be before the routes declaration
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

const routes_EXT = require('./routes/routes_EXT')
const routes_VUL = require('./routes/routes_VUL')
const routes_SEM = require('./routes/routes_SEM')
const routes_RW = require('./routes/routes_RW')
const routes_SH = require('./routes/routes_SH')
const routes_FG = require('./routes/routes_FG')

app.use(routes_EXT)
app.use(routes_VUL)
app.use(routes_SEM)
app.use(routes_RW)
app.use(routes_SH)
app.use(routes_FG)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

let server = app.listen(portNumber, function () {
  console.info('Express node_env: ' + process.env.NODE_ENV + " Port: " + server.address().port);
  server.on('connection', () => { server.setTimeout(20 * 60 * 1000) })
})

