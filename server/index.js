import express from 'express'
import logger from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@libsql/client'

import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

const port = process.env.PORT ?? 12345

const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {}
})

const db = createClient({
    url:'libsql://chatsocket-baxx1199.aws-us-east-2.turso.io',
    authToken: process.env.DB_TOKEN
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    user TEXT,
    user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

io.on('connection', async (socket) => {
    console.log('A user has conected')

    socket.on('disconnect',  () => {
        console.log('An user has disconnected!')
    })

    socket.on('chat message', async (msg) => {
        let result
        const userObj = socket.handshake.auth.userCredential
        let message
        try {
            let user = userObj.username
            let iD_user = userObj.userID

            result = await db.execute({
                sql: 'INSERT INTO messages (content,user,user_id) VALUES (:msg,:user, :iD_user)',
                args: {msg, user, iD_user}
            });

            const inserted = await db.execute({
                sql: 'SELECT * FROM messages WHERE id = ?',
                args: [result.lastInsertRowid]
            })

            message = inserted.rows[0]
        } catch (error) {
            console.error(error)
            return
        }
        //io.emit('chat message', msg, result.lastInsertRowid.toString(), userObj)
        io.emit('chat message', message)
    })

    if(!socket.recovered){
        try {
            const result = await db.execute({
                sql:'SELECT * FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })

            result.rows.forEach(row => {
                socket.emit('chat message', row)
            })
        } catch (e) {
            console.error(e)
            return
        }
    }
})

app.use(logger('dev'))

app.get('/', (req, res) => {
    res.sendFile(process.cwd()+'/client/index.html')
})

server.listen(port, () => {
    console.log(`Server is running on port http://localhost:${port}`)
})
