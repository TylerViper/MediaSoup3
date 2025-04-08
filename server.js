/**
 * integrating mediasoup server with a node.js application
 */

/* Please follow mediasoup installation requirements */
/* https://mediasoup.org/documentation/v3/mediasoup/installation/ */

import 'dotenv/config';
import express from 'express'
const app = express()

import https from 'httpolyglot'
import fs from 'fs'
import path from 'path'
const __dirname = path.resolve()

import { Server } from 'socket.io'
import { createWorker, setupSocketHandlers } from './mediasoup-handler.js'

// Import các module xử lý streaming và watching
import * as streaming from './streaming.js';
import * as watching from './watching.js';

app.get('*', (req, res, next) => {
  const path = '/sfu/'

  if (req.path.indexOf(path) == 0 && req.path.length > path.length) return next()

  res.send(`You need to specify a room name in the path e.g. 'https://127.0.0.1/sfu/room'`)
})

app.use('/sfu/:room', express.static(path.join(__dirname, 'public')))

// SSL cert for HTTPS access
const options = {
  key: fs.readFileSync('./server/ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./server/ssl/cert.pem', 'utf-8')
}

const port = process.env.PORT || 3000;
const httpsServer = https.createServer(options, app);

httpsServer.listen(port, '0.0.0.0', () => {
  console.log(`Listening on port: ${port}`);
});
const io = new Server(httpsServer)

// socket.io namespace (could represent a room?)
const connections = io.of('/mediasoup')

// We create a Worker as soon as our application starts
createWorker()

connections.on('connection', async socket => {
  setupSocketHandlers(socket)
})