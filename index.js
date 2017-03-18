'use strict';

// Messenger API integration example
// We assume you have:
// * a Wit.ai bot setup (https://wit.ai/docs/quickstart)
// * a Messenger Platform setup (https://developers.facebook.com/docs/messenger-platform/quickstart)
// You need to `npm install` the following dependencies: body-parser, express, request.
//
// 1. npm install body-parser express request
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_APP_SECRET=your_app_secret FB_PAGE_TOKEN=your_page_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/webhook` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');
const async = require('async');

let Wit = null;
let log = null;
try {
        // if running from repo
        Wit = require('../').Wit;
        log = require('../').log;
} catch (e) {
        Wit = require('node-wit').Wit;
        log = require('node-wit').log;
}

// Webserver parameter
const PORT = process.env.PORT || 8445;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

// Messenger API parameters
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
const FB_APP_SECRET = process.env.FB_APP_SECRET;
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }
const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
if (!FB_VERIFY_TOKEN) { throw new Error('missing FB_VERIFY_TOKEN') }

// Yelp API parameters
const YELP_CONSUMER_KEY = process.env.YELP_CONSUMER_KEY;
if (!YELP_CONSUMER_KEY) { throw new Error('missing YELP_CONSUMER_KEY') }
const YELP_CONSUMER_SECRET = process.env.YELP_CONSUMER_SECRET;
if (!YELP_CONSUMER_SECRET) { throw new Error('missing YELP_CONSUMER_SECRET') }
const YELP_TOKEN = process.env.YELP_TOKEN;
if (!YELP_TOKEN) { throw new Error('missing YELP_TOKEN') }
const YELP_TOKEN_SECRET = process.env.YELP_TOKEN_SECRET;
if (!YELP_TOKEN_SECRET) { throw new Error('missing YELP_TOKEN_SECRET') }

// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference

// Save latitude and longitude to global for reuse for yelp api call
var lat = '';
var long = '';

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

// Standard function to send Let's go or I'm hungry quick replies
const fbGoMessage = (id) => {
        const body = JSON.stringify({
                recipient: { id },
                message: {
                        text:"Shall we begin?",
                        quick_replies: 
                                [
                                        {
                                        "content_type":"text",
                                        "title":"Let's go!",
                                        "payload":"go"
                                        },
                                        {
                                        "content_type":"text",
                                        "title":"I'm hungry!",
                                        "payload":"go" 
                                        }
                                ]
                }
        });

        const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
        fetch('https://graph.facebook.com/me/messages?' + qs, {
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
}

// Quick reply to request for location
const fbAskForLocation = (id) => {
        const body = JSON.stringify({
                recipient: { id },
                message: {
                        text:"Please share your current location or the drop the pin in the region of where you would like to eat.",
                        quick_replies: 
                                [
                                        {
                                        "content_type":"location"
                                        }
                                ]
                }
        });

        const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
        fetch('https://graph.facebook.com/me/messages?' + qs, {
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
}
        
// Generic template for one input from Yelp Api
const fbYelpTemplate = (id, name, image_url, url, category, phone_number, rating, map_lat, map_long, is_open_now) => {
        const body = JSON.stringify({
                recipient: { id },
                message: {
                        attachment: {
                                type: "template",
                                payload: {
                                        template_type: "generic",
                                        elements: 
                                                [
                                                        {
                                                        title: name,
                                                        image_url: image_url,
                                                        subtitle: category + ". Rating:" + rating +"/5" + ". "+is_open_now,
                                                        buttons: 
                                                                [
                                                                        {
                                                                        type: "web_url",
                                                                        url: url,
                                                                        title: "View website"
                                                                        },
                                                                        {
                                                                        type: "phone_number",
                                                                        title: "Call",
                                                                        payload: phone_number
                                                                        },
                                                                        {
                                                                        type: "web_url",
                                                                        title: "Show Map",
                                                                        url: "http:\/\/maps.apple.com\/maps?q="+map_lat+","+map_long+"&z=16"           
                                                                        }
                                                                ]
                                                        }
                                                ]
                                }
                        }
                },
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

// General FB quick replies for other suggestions.
const fbNextChoice = (id) => {
        const body = JSON.stringify({
                recipient: {id},
                message: {
                        text:"Or would you like a different suggestion?",
                        quick_replies: 
                                [
                                        {
                                        "content_type":"text",
                                        "title":"Okay, show me.",
                                        "payload":"nextChoice"
                                        },
                                        {
                                        "content_type":"text",
                                        "title":"This is good! Thks!",
                                        "payload":"endConv" 
                                        }
                                ]
                }
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

// Adapted FB function to send Wit messages and quick replies
const fbWitMessage = (id, data) => {
        const body = JSON.stringify({
                recipient: { id },
                message: data,
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
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
        let sessionId;
        // Let's see if we already have a session for the user fbid
        Object.keys(sessions).forEach(k => {
                if (sessions[k].fbid === fbid) {
                // Yep, got it!
                        sessionId = k;
                }
        });
        if (!sessionId) {
                // No session found for user fbid, let's create a new one
                sessionId = new Date().toISOString();
                sessions[sessionId] = {fbid: fbid, context: {}};
        }
        return sessionId;
};

// Define function required in getForecast
const firstEntityValue = (entities, entity) => {
        const val = entities && entities[entity] &&
        Array.isArray(entities[entity]) &&
        entities[entity].length > 0 &&
        entities[entity][0].value;
        if (!val) {
                return null;
        }
        return typeof val === 'object' ? val.value : val;
};



// Our bot actions
const actions = {
        send({sessionId}, response) {
                // Our bot has something to say!
                // Let's retrieve the Facebook user whose session belongs to
                const recipientId = sessions[sessionId].fbid;
                if (recipientId) {
                        // Yay, we found our recipient!
                        // Let's forward our bot response to her.
                        // We return a promise to let our bot know when we're done sending

                        // This part of the code is adapted for quick replies
                        if (response.quickreplies) {
                        	response.quick_replies=[]; // Renamed quick reply object from Wit
                        	for (var i = 0, len = response.quickreplies.length; i < len; i++) { // Loop through quickreplies
								response.quick_replies.push({ title: response.quickreplies[i], content_type: 'text', payload: 'CUSTOM_WIT_AI_QUICKREPLY_ID' + i });
							}
							delete response.quickreplies;
                        }

                        return fbWitMessage(recipientId, response)
                        .then(() => null)
                        .catch((err) => {
                                console.error(
                                        'Oops! An error occurred while forwarding the response to',
                                        recipientId,
                                        ':',
                                        err.stack || err
                                );
                        });
                } else {
                        console.error('Oops! Couldn\'t find user for session:', sessionId);
                        // Giving the wheel back to our bot
                        return Promise.resolve()
                }
        },
        // You should implement your custom actions here
        // See https://wit.ai/docs/quickstart
		greetings({context, entities}) {
		        },
				
		getForecast({context, entities}) {
                return new Promise(function(resolve, reject) {
                        var location = firstEntityValue(entities, "location");
                        if (location) {
                                context.forecast = 'sunny in ' + location; // we should call a weather API here
                                delete context.missingLocation;
                        } else {
                                context.missingLocation = true;
                                delete context.forecast;
                        }
                        return resolve(context);
                });
        },
      
		getLocation({context, entities}) {
			return new Promise(function(resolve, reject) {        
				const fbAskForLocation = (id) => {
				        const body = JSON.stringify({
				                recipient: { id },
				                message: {
				                        text:"Please share your current location or the drop the pin in the region of where you would like to eat.",
				                        quick_replies: 
				                                [
				                                        {
				                                        "content_type":"location"
				                                        }
				                                ]
				                }
				        });

				        const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
				        fetch('https://graph.facebook.com/me/messages?' + qs, {
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
				}
		  return resolve(context);
        
                 });}
			
			,


		
	}; //must keep this 

// Setting up our bot
const wit = new Wit({
        accessToken: WIT_TOKEN,
        actions,
        logger: new log.Logger(log.INFO)
});

// ----------------------------------------------------------------------------
// Yelp API specific code

// new v3 API Codes
var Yelp = require('yelp-api-v3');
 
var yelp = new Yelp({
  app_id: "-ulP58VwFTAHGRhyxnZh_A",
  app_secret: 'BvupJdv1K4xdIKaX3vJJaejAuN9fECa5PpgIvyMJF4Lw3KfIioEKatlMf6mlDcWu'
});

// use different package for Biz search
var YelpBiz = require('node-yelp-fusion');
var yelpBiz = new YelpBiz({ id: "-ulP58VwFTAHGRhyxnZh_A", secret: 'BvupJdv1K4xdIKaX3vJJaejAuN9fECa5PpgIvyMJF4Lw3KfIioEKatlMf6mlDcWu'});

// Intialize variables that we will save to global
var responseCounter = 0; //Initialize the responseCounter
var jsonString = '';
var jsonBiz = '';
var jsonName = ''; 
var jsonUrl = '';
var jsonCat = '';
var jsonImage = '';
var jsonNumber = '';
var jsonRating = '';
var jsonMapLat = '';
var jsonMapLong = '';
var jsonId = '';
var jsonIsOpenNow = '';

// Create function to save yelp search output
const saveYelpSearchOutput = (data) => {
        jsonString = JSON.parse(data);
        jsonBiz = jsonString.businesses;
        jsonBiz = jsonString.businesses;
        jsonName = [jsonBiz[0].name]; 
        jsonUrl = [jsonBiz[0].url];
        var i = 0;
        do {
                if (i == jsonBiz[0].categories.length) {
                        jsonCat += jsonBiz[0].categories[i].title;      
                } else if (i == 0) {
                        jsonCat = [jsonBiz[0].categories[0].title];
                } else {
                        jsonCat += ", " + jsonBiz[0].categories[i].title;
                }
                i++;
        } while (i<jsonBiz[0].categories.length);
        jsonCat = [jsonCat];
        jsonImage = [jsonBiz[0].image_url];
        jsonNumber = [jsonBiz[0].phone];
        jsonRating = [jsonBiz[0].rating];
        jsonMapLat = [jsonBiz[0].coordinates.latitude];
        jsonMapLong = [jsonBiz[0].coordinates.longitude];
        jsonId = [jsonBiz[0].id];

        // Store all results
        i = 0;
        if (i != jsonBiz.length-1) {
                do {
                        jsonName[i] = jsonBiz[i].name; 
                        jsonUrl[i] = jsonBiz[i].url;
                        var j = 0;
                        do {
                                if (j == jsonBiz[i].categories.length) {
                                        jsonCat[i] += jsonBiz[i].categories[j].title;   
                                } else if (j == 0) {
                                        jsonCat[i] = jsonBiz[i].categories[0].title;
                                } else {
                                        jsonCat[i] += ", " + jsonBiz[i].categories[j].title;
                                }
                                j++;
                        } while (j<jsonBiz[i].categories.length);
                        jsonImage[i] = jsonBiz[i].image_url;
                        if (jsonImage[i]) {
                                jsonImage[i] = jsonImage[i].replace("ms.jpg","o.jpg");
                        }
                        jsonNumber[i] = jsonBiz[i].phone;
                        jsonRating[i] = jsonBiz[i].rating;
                        jsonMapLat[i] = jsonBiz[i].coordinates.latitude;
                        jsonMapLong[i] = jsonBiz[i].coordinates.longitude;
                        jsonId[i] = jsonBiz[i].id;
                        i++;
                } while (i < jsonBiz.length);
        }
        var resObj = [jsonName, jsonUrl, jsonCat, jsonImage, jsonNumber, jsonRating, jsonMapLat, jsonMapLong, jsonId];
        return resObj;
};

// Create function to save yelp business output
const saveYelpBusinessOutput = (data) => {
        jsonString = data;
        jsonBiz = jsonString.hours;
        jsonIsOpenNow = jsonBiz[0].is_open_now; 
        if (jsonIsOpenNow==true) {
                jsonIsOpenNow = "Open now."
        } else {
                jsonIsOpenNow = "Closed."
        }
        var resObj = jsonIsOpenNow;
        return resObj;
};

// Save some preference parameters
var wantsOpen = false;
var wantsHighRating = false;
var wantsLowPrice = false;

// ----------------------------------------------------------------------------

// Starting our webserver and putting it all together
const app = express();
app.use(({method, url}, rsp, next) => {
        rsp.on('finish', () => {
                console.log(`${rsp.statusCode} ${method} ${url}`);
        });
        next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook', (req, res) => {
        if (req.query['hub.mode'] === 'subscribe' &&
                req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
                res.send(req.query['hub.challenge']);
        } else {
                res.sendStatus(400);
        }
});

// Message handler
app.post('/webhook', (req, res) => {
        // Parse the Messenger payload
        // See the Webhook reference
        // https://developers.facebook.com/docs/messenger-platform/webhook-reference
        const data = req.body;

        if (data.object === 'page') {
                data.entry.forEach(entry => {
                        entry.messaging.forEach(event => {
                                if (event.message && !event.message.is_echo) {
                                        // Yay! We got a new message!
                                        // We retrieve the Facebook user ID of the sender
                                        const sender = event.sender.id;

                                        // We retrieve the user's current session, or create one if it doesn't exist
                                        // This is needed for our bot to figure out the conversation history
                                        const sessionId = findOrCreateSession(sender);

                                        // We retrieve the message content
                                        const {text, attachments} = event.message;

                                        if (attachments) {
                                                // We received an attachment
                                                // First need to identify if attachment was a shared location
                                                if (attachments[0].type=="location") {

                                                        // Save lat and long
                                                        lat = attachments[0].payload.coordinates.lat;
                                                        long = attachments[0].payload.coordinates.long;

                                                        // Run lat and long through to yelp api
                                                        // See http://www.yelp.com/developers/documentation/v2/search_api
                                                        // This are a series of promises with simple "How about this message first"
                                                        // Followed by the card of the first suggestion
                                                        // Followed by asking whether the user wants a different suggestion!
                                                        fbMessage(sender, "How about this?")
                                                        .then(function () {
                                                                return yelp.search({term: 'food', latitude: lat, longitude: long, limit: 30})
                                                        })
                                                        .then(function (data) {
                                                                saveYelpSearchOutput(data);
                                                        })
                                                        .then(function (data) {
                                                                return yelpBiz.business(jsonId[responseCounter])
                                                        })
                                                        .then(function (data) {
                                                                saveYelpBusinessOutput(data);
                                                        })
                                                        .then(function (data) {
                                                                /*
                                                                var i = responseCounter;
                                                                while (!jsonName[i] || !jsonImage[i] || !jsonUrl[i] || !jsonCat[i] || !jsonNumber[i] || !jsonRating[i]
                                                                        || !jsonMapLat[i] || !jsonMapLong[i]) {
                                                                        i++;
                                                                        responseCounter = i;
                                                                        console.log(responseCounter);
                                                                }
                                                                */
                                                                return fbYelpTemplate(
                                                                        sender,
                                                                        jsonName[responseCounter],
                                                                        jsonImage[responseCounter],
                                                                        jsonUrl[responseCounter],
                                                                        jsonCat[responseCounter],
                                                                        jsonNumber[responseCounter],
                                                                        jsonRating[responseCounter],
                                                                        jsonMapLat[responseCounter],
                                                                        jsonMapLong[responseCounter],
                                                                        jsonIsOpenNow
                                                                        );
                                                        })
                                                        .then(function (data) {
                                                                if (data) {
                                                                        console.log(jsonIsOpenNow);
                                                                        fbNextChoice(sender);
                                                                }
                                                        })                                                        
                                                        .catch(function (err) {
                                                                console.error(err);
                                                        });
                                                        
                                                } else {
                                                        // Let's reply with an automatic message
                                                        fbMessage(sender, "C'mon, I'm just a bot. I won't understand random attachments...")
                                                        .catch(console.error);
                                                }

                                        } else if (text) {
                                                // We received a text message

                                                if (text=="Let's go!" || text=="I'm hungry!") {
                                                        // This part is for the beginning conversation!
                                                        fbAskForLocation(sender);
                                                } else if (text=="Okay, show me.") {
                                                        // This part is to respond to the user's request for other recommendations!
                                                        if (responseCounter >= jsonName.length) {
                                                                fbMessage(sender, "That's all I have! Shall I go back to the first recommendation?");
                                                                responseCounter = 0;
                                                        } else {
                                                                var i = responseCounter;
                                                                console.log("i is now:"+i);
                                                                i++;
                                                                responseCounter = i;
                                                                console.log("i is then:"+i);
                                                                while (!jsonName[i] || !jsonImage[i] || !jsonUrl[i] || !jsonCat[i] || !jsonNumber[i] || !jsonRating[i]
                                                                        || !jsonMapLat[i] || !jsonMapLong[i]) {
                                                                        i++;
                                                                        if (responseCounter >= jsonName.length) {
                                                                                fbMessage(sender, "That's all I have! Shall I go back to the first recommendation?");
                                                                                responseCounter = 0;
                                                                                break;
                                                                        } else {
                                                                                responseCounter = i;
                                                                        }
                                                                        console.log(responseCounter);
                                                                }
                                                                if (responseCounter < jsonName.length && responseCounter != 0) {
                                                                        fbYelpTemplate(
                                                                                sender,
                                                                                jsonName[responseCounter],
                                                                                jsonImage[responseCounter],
                                                                                jsonUrl[responseCounter],
                                                                                jsonCat[responseCounter],
                                                                                jsonNumber[responseCounter],
                                                                                jsonRating[responseCounter],
                                                                                jsonMapLat[responseCounter],
                                                                                jsonMapLong[responseCounter]
                                                                        ).then(function(){
                                                                                fbNextChoice(sender);
                                                                        }).catch(function(err) {
                                                                                console.error(err);
                                                                        });
                                                                } 
                                                        }
                                                } else if (text=="This is good! Thks!") {
                                                        // This part is to end off the conversation.
                                                        fbMessage(sender, "No problemo! Just share your location again in the future to restart this conversation! Alternatively, you could just type Hi :). A smiley face is also preferred.");
                                                } else {
                                                        // For all other text messages
                                                        // Let's forward the message to the Wit.ai Bot Engine
                                                        // This will run all actions until our bot has nothing left to do
                                                        wit.runActions(
                                                                sessionId, // the user's current session
                                                                text, // the user's message
                                                                sessions[sessionId].context // the user's current session state
                                                        ).then((context) => {
                                                                // Our bot did everything it has to do.
                                                                // Now it's waiting for further messages to proceed.
                                                                console.log('Waiting for next user messages');

                                                                // Based on the session state, you might want to reset the session.
                                                                // This depends heavily on the business logic of your bot.
                                                                // Example:
                                                                // if (context['done']) {
                                                                //   delete sessions[sessionId];
                                                                // }

                                                                // Updating the user's current session state
                                                                sessions[sessionId].context = context;
                                                        })
                                                        .catch((err) => {
                                                                console.error('Oops! Got an error from Wit: ', err.stack || err);
                                                        })  
                                                }                                                
                                        }
                                } else if (event.postback) {
                                        // This is to handle postbacks from cards
                                        const sender = event.sender.id;

                                        // We retrieve the user's current session, or create one if it doesn't exist
                                        // This is needed for our bot to figure out the conversation history
                                        const sessionId = findOrCreateSession(sender);

                                        // Store text from payload
                                        let text = JSON.stringify(event.postback.payload);

                                        // Check if payload is a new conversation and start new conversation thread
                                        if (text=='"startConvo"') {
                                                fbMessage(sender,"Name's James. I give you the best places to eat. At any point of time, if you would like to get a new suggestion from me on places to eat, just share your location or the location around which you would like to get suggestions from!")
                                                .then(function(){
                                                        fbGoMessage(sender);
                                                })
                                                .catch(function(err){
                                                        console.error(err);
                                                });
                                        }
                                } else {
                                        console.log('received event', JSON.stringify(event));
                                }
                        });
                });
        }
        res.sendStatus(200);
});

/*
* Verify that the callback came from Facebook. Using the App Secret from
* the App Dashboard, we can verify the signature that is sent with each
* callback in the x-hub-signature field, located in the header.
*
* https://developers.facebook.com/docs/graph-api/webhooks#setup
*
*/
function verifyRequestSignature(req, res, buf) {
        var signature = req.headers["x-hub-signature"];

        if (!signature) {
                // For testing, let's log an error. In production, you should throw an
                // error.
                console.error("Couldn't validate the signature.");
        } else {
                var elements = signature.split('=');
                var method = elements[0];
                var signatureHash = elements[1];

                var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                .update(buf)
                .digest('hex');

                if (signatureHash != expectedHash) {
                        throw new Error("Couldn't validate the request signature.");
                }
        }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');