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

/* Example from witai uses a dynamic verify token. Changed to static for now.
let FB_VERIFY_TOKEN = null;
crypto.randomBytes(8, (err, buff) => {
  if (err) throw err;
  FB_VERIFY_TOKEN = buff.toString('hex');
  console.log(`/webhook will accept the Verify Token "${FB_VERIFY_TOKEN}"`);
});
*/

// ----------------------------------------------------------------------------
// Yelp API specific code

// Request API access: http://www.yelp.com/developers/getting_started/api_access
var Yelp = require('yelp');

var yelp = new Yelp({
  consumer_key: 'ShYtePAxJPwxsHrhFkmoRg',
  consumer_secret: 'RdZjBUZjZolSaPEQRRY84nqW6-w',
  token: 'aMWeZFE0imbyURlZFCcDJJ-YVHWqPuRf',
  token_secret: 'OmYUC2zJf183GSorTjrCx1xz-dk',
});

// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference

// General FB message for any text. ////noquickreply
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

// Generic template for one input
const fbGenericTemplate = (id, name, image_url, url, category, phone_number, rating, map_lat, map_long) => {
  const body = JSON.stringify({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
          {
            title: name,
            image_url: image_url,
            subtitle: category + ". Rating:" + rating +"/5",
            buttons: [
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
          ],
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
  entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text)
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
  getForecast({context, entities}) {
    return new Promise(function(resolve, reject) {
      var location = firstEntityValue(entities, "location")
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
};

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

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
            // Let's reply with an automatic message
            //fbMessage(sender, 'Sorry I can only process text messages for now.')
            //.catch(console.error);

            // First need to identify if attachment was a shared location
            if (attachments[0].type=="location") {

              let lat = attachments[0].payload.coordinates.lat;

              let long = attachments[0].payload.coordinates.long;

              fbMessage(sender,"received location of lat:" + lat + " long:" + long);

              // See http://www.yelp.com/developers/documentation/v2/search_api
              yelp.search({ term: 'food', ll: lat+","+long, limit: 3})
              .then(function (data) {
                var jsonString = JSON.stringify(data);
                jsonString = JSON.parse(jsonString);
                var jsonBiz = jsonString.businesses;
                var jsonName = [jsonBiz[0].name]; 
                var jsonUrl = [jsonBiz[0].url];
                var jsonCat = [''];
                var i = 0;
                if (i == jsonBiz[0].categories.length-1) {
                  jsonCat[0] = jsonBiz[0].categories[0][0];
                } else {
                  do {
                    jsonCat[0] += jsonBiz[0].categories[i][0] + ", ";
                    i++;
                  } while (i < jsonBiz[0].categories.length);
                }
                var image_url = [jsonBiz[0].image_url];
                image_url[0] = image_url[0].replace("ms.jpg","o.jpg");
                var jsonNumber = [jsonBiz[0].phone];
                var jsonRating = [jsonBiz[0].rating];
                var jsonMapLat = [jsonBiz[0].location.coordinate.latitude];
                var jsonMapLong = [jsonBiz[0].location.coordinate.longitude];

                // Store all results
                i = 0;
                if (i != jsonBiz.length-1) {
                  do {
                    jsonName[i] = jsonBiz[i].name; 
                    jsonUrl[i] = jsonBiz[i].url;
                    jsonCat[i] = '';
                    var j = 0;
                    if (j == jsonBiz[i].categories.length-1) {
                      jsonCat[i] = jsonBiz[i].categories[0][0];
                    } else {
                      do {
                        jsonCat[i] += jsonBiz[i].categories[j][0] + ", ";
                        j++;
                      } while (j < jsonBiz[i].categories.length);
                    }
                    image_url[i] = jsonBiz[i].image_url;
                    image_url[i] = image_url[i].replace("ms.jpg","o.jpg");
                    jsonNumber[i] = jsonBiz[i].phone;
                    jsonRating[i] = jsonBiz[i].rating;
                    jsonMapLat[i] = jsonBiz[i].location.coordinate.latitude;
                    jsonMapLong[i] = jsonBiz[i].location.coordinate.longitude;
                    i++;
                  } while (i < jsonBiz.length);
                }

                fbMessage(sender, "How about this?" );
                fbGenericTemplate(sender, jsonName[0], image_url[0], jsonUrl[0], jsonCat[0], jsonNumber[0], jsonRating[0], jsonMapLat[0], jsonMapLong[0]);
                var responseCounter = 0;
              })
              .catch(function (err) {
                console.error(err);
              });

            }

          } else if (text) {

            if (text=="Let's go!" || text=="I'm hungry!") {

            // Quick reply to request for location
            const body = JSON.stringify({
              recipient: {id:sender},
              message: {
                text:"Please share your location.",
                quick_replies: [
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
            }).then(rsp => rsp.json())
            .then(json => {
              if (json.error && json.error.message) {
                throw new Error(json.error.message);
              }
              return json;
            });
          } else {
            // We received a text message

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

          // This is to check for new users who will send the Get Started postback.
          let text = JSON.stringify(event.postback.payload);
          if (text=='"newConvo"') {

            // Introduction
            fbMessage(sender,"Name's James. I give you the best places to eat.")

            // Quick replies
            const body = JSON.stringify({
              recipient: {id:sender},
              message: {
                text:"Shall we begin?",
                quick_replies: [
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
            }).then(rsp => rsp.json())
            .then(json => {
              if (json.error && json.error.message) {
                throw new Error(json.error.message);
              }
              return json;
            });
          };
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
