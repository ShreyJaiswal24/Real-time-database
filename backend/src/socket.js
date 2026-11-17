// src/socket.js
import { Server } from 'socket.io';
import { initKafka, consumer } from './utils/kafka.js';
import dotenv from 'dotenv';
dotenv.config();

let io;

async function setupSocket(server) {
  // 1) Initialize Socket.IO
  io = new Server(server, { //attaches socket.io to the shared http server and sets CORS options so that
    cors: { //the frontend dev server can connect  . now to line 38 of this page
      origin: process.env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });
  console.log('⚡ Socket.IO initialized');

  // 2) Handle new connections
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (!userId) {
      console.warn('⚠️ No userId in handshake, disconnecting');
      return socket.disconnect(true);
    }

    //Put this user's socket into a private room named after their userId
    socket.join(userId); //critical as other users should not see the changes happening in others' databases
    console.log(`🔌 Socket ${socket.id} joined room ${userId}`);
    
    socket.on('disconnect', () => { //disconnect hota and room leave kardeta user
      console.log(`❌ Socket ${socket.id} left room ${userId}`);
    });
  });

  // 3) Bootstrap Kafka consumer (process of getting kafka up and running so producer and consumer can exchange messages)
  await initKafka();  // connects producer & consumer and creates the topic db-change
  await consumer.subscribe({ topic: 'db-change', fromBeginning: false });

  // 4) On each Kafka message, route to the correct room
  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      const { userId, ...changeData } = payload; //the moment any message lands on kakfa, it extracts userId
                                        //and calls io.to(userId).emit
      // Emit ONLY to that user's private room
      io.to(userId).emit(`realtime-update-${userId}`, changeData);
    },
  });
}

export { setupSocket };
