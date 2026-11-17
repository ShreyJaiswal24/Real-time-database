import dotenv from "dotenv";
import { app } from "./app.js";
import mongoose from "mongoose";
import { DB_NAME } from "./constants.js";
import { setupSocket } from "./socket.js";
import http from "http";
import { resumeTrackingForActiveUsers } from "./dbTracker/Mongodb.js";

const connectDB = async () => {
    try { //connects to internal DB storing users,passwords and change histories
        console.log(`\nDB_NAME: ${DB_NAME}`)
        console.log(`\nConnecting to MongoDB at ${process.env.USER_DB_URI}${DB_NAME}`)
        const connectionInstance = await mongoose.connect(`${process.env.USER_DB_URI}${DB_NAME}`)
        console.log(`\n MongoDB connected ! DB host: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("MONGODB connection error: ", error);
        process.exit(1) //if primary application DB cant be reached , process fails immediately
    }
}

dotenv.config({
    path:"../.env"
});

const server = http.createServer(app); //wrapping in this allows both Express REST APIs and Socket.IO Websocket traffic to share the same port
console.log(process.env.USER_DB_URI)
connectDB().then(async () => {
    await resumeTrackingForActiveUsers(); //this is crash recovery mechanism to re-establish connections of users who were tracking before the shutdown
    setupSocket(server); 
    server.listen(process.env.PORT || 3000, () => { //now the server is listening and starts accepting HTTP and websocket connections.
        console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
})