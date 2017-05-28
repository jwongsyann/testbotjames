// This script is to mass broadcast to all users of James!

// TYPE MESSAGE HERE
const msg = "Hi! :)"


// ----------------------------------------------------------------------------
// Load required packages
// ----------------------------------------------------------------------------
const fetch = require('node-fetch');
const mongoose = require('mongoose');

// ----------------------------------------------------------------------------
// Setup required parameters
// ----------------------------------------------------------------------------
// Messenger API parameters
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }

// Mongoose API parameters
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { throw new Error('missing MONGODB_URI') }

// ----------------------------------------------------------------------------
// Fb Messenger Codes
// ----------------------------------------------------------------------------

// Generic function to send any message
const fbMessage = (id, text) => {
    const body = JSON.stringify({
        recipient: { id },
        message: { text },
    });
    const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
    return fetch('https://graph.facebook.com/me/messages?' + qs, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body,
    })
    .then(rsp => rsp.json())
    .then(json => {
        if (json.error && json.error.message) {
            throw new Error(json.error.message);
        }
        return json;
    });
};

// ----------------------------------------------------------------------------
// Mongodb Codes
// ----------------------------------------------------------------------------
const schema = mongoose.Schema;    
const userSessionSchema = new schema({
    fbid : String,
    firstName: String,
    created_at: Date,
    updated_at: Date
});

// Add model to mongoose
const userSession = mongoose.model('userSession', userSessionSchema);

// Create the database connection 
mongoose.connect(MONGODB_URI); 

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function () {  
  console.log('Mongoose default connection open to ' + MONGODB_URI);
}); 

// If the connection throws an error
mongoose.connection.on('error',function (err) {  
  console.log('Mongoose default connection error: ' + err);
}); 

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {  
  console.log('Mongoose default connection disconnected'); 
});

// If the Node process ends, close the Mongoose connection 
process.on('SIGINT', function() {  
  mongoose.connection.close(function () { 
    console.log('Mongoose default connection disconnected through app termination'); 
    process.exit(0); 
  }); 
}); 

// ----------------------------------------------------------------------------
// UDF Codes
// ----------------------------------------------------------------------------
// Function to get user ID
const sendMsgAllUser = () => {
    // Find the document
    userSession.find({}, function(error, result) {
        if (error) throw error;
        if (result) {
            return result;
        }
    })
    .then(function(data){
    	for (var i =  0; i <2; i++) {
    		fbMessage(data[i]['fbid'],msg);
    	}
    	console.log(data.length);
    })
    .then(function(data){
    	mongoose.disconnect();
    });
}

// ----------------------------------------------------------------------------
// Main Body Codes
// ----------------------------------------------------------------------------
sendMsgAllUser();
