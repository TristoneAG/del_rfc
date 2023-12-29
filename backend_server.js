require('dotenv').config('../.env')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const morgan = require('morgan')

const routes_VUL = require('./routes/routes_VUL')
const routes_EXT = require('./routes/routes_EXT')
const routes_SEM = require('./routes/routes_SEM')
const routes_RW = require('./routes/routes_RW')
const routes_RABBITMQ = require('./routes/routes_RABBITMQ')
const portNumber = process.env.port || process.env.PORT || 5000

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(morgan('dev')) // Morgan needs to be before the routes declaration

app.use(routes_VUL)
app.use(routes_EXT)
app.use(routes_SEM)
app.use(routes_RW)
app.use(routes_RABBITMQ)

let server = app.listen(portNumber, function () {
  console.info('Express node_env: ' + process.env.NODE_ENV + " Port: " + server.address().port);
  server.on('connection', () => { server.setTimeout(20 * 60 * 1000) })
})
