import { MongoClient } from 'mongodb';
import { User } from '../models/user.model.js';
import { producer } from '../utils/kafka.js';



function parseChange(change) {
  const timestamp = new Date(change.clusterTime.getHighBits() * 1000); // Convert BSON timestamp to JS Date

  return {
    collectionName: change.ns.coll,
    documentId: change.documentKey._id.toString(),
    operationType: change.operationType,
    time: timestamp.toISOString()
  };
}

const activeStreams = new Map(); //registering streams in-memory

//issue - if we scale out to multiple servers behind a load balancer , server A will not know what streams server B is running
//because activeStreams is stored in-memory in this server so a coordinater like Redid PubSub is needed

async function startTracking(userId, connectionString, database) {
  if (activeStreams.has(userId)) {
    console.log('Already tracking this user');
    return;
  }
  const client = new MongoClient(connectionString);
  await client.connect();
  const db = client.db(database); 
  const changeStream = db.watch(); //watches changes across all collections within that database

  changeStream.on('change', async (change) => { //register the event listener
  

    const updateData = parseChange(change);
    console.log(updateData);
    await User.findByIdAndUpdate(
      userId,
      { $push: { dbUpdates: updateData } },
      { new: true }
    )

    await producer.send({
      topic: 'db-change',
      messages: [{
        // include userId so the consumer can route
        value: JSON.stringify({ userId, 
          collectionName:updateData.collectionName, documentId:updateData.documentId, operationType:updateData.operationType, time:updateData.time 
        })
      }]
    });
  });

  activeStreams.set(userId, { client, changeStream }); //save references(client,changeStream) so we can close them later
}

async function stopTracking(userId) {
  const stream = activeStreams.get(userId);
  const user = await User.findById(userId);
  if (stream) {
    await stream.changeStream.close(); //closes the tailable Oplog watcher cursor
    await stream.client.close(); //closes the mongoClient TCP connection pool
    activeStreams.delete(userId); //Removes reference from in-memory Map
    user.isTracking = false;
    await user.save();
  }
}
const resumeTrackingForActiveUsers = async () => { //to query all users who has tracking on before server shutdown
  const activeUsers = await User.find({ isTracking: true });

  console.log(`Resuming tracking for ${activeUsers.length} users`);

  for (const user of activeUsers) { //and re-established their change streams.
    try {
      await startTracking(user._id, user.dbString,user.dbName); //the server will wait for all connections to establish and only after this
      console.log(`Tracking resumed for user ${user._id}`); //does it start listening to web requests which can be a potential problem in production
    } catch (error) {
      console.error(`Failed to resume tracking for user ${user._id}:`, error);
    }
  } //in production the for loop may cause a bottleneck so the solutions are 1) worker queue like BullMQ so that this can be processed in background while the server starts
}; //2)separate the app into two independent microservices : 1) web service for handling APIs and logins 2)Change Data Stream (CDC) to manage client connections and change streams and pushing updates to kafka
//or just call them in smaller batch sizes.

function isTracking(userId) {
  return activeStreams.has(userId);
}

export { startTracking, stopTracking, isTracking ,resumeTrackingForActiveUsers};
