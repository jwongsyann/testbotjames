'use strict';

// ----------------------------------------------------------------------------
// Load required packages
// ----------------------------------------------------------------------------
const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');
const async = require('async');
const Yelp = require('yelp-api-v3');
const YelpBiz = require('node-yelp-fusion');
const mongoose = require('mongoose');
const googleMapsClient = require('@google/maps').createClient({
  key: 'AIzaSyAElYZWmGet1f0oO7EjCqbEPQ1MGM09rRw'
});

let Wit = null;
let log = null;
try {
    // if running from repo
    Wit = require('../lib/').Wit;
    log = require('../lib/').log;
} catch (e) {
    Wit = require('node-wit').Wit;
    log = require('node-wit').log;
}

// ----------------------------------------------------------------------------
// Setup required parameters
// ----------------------------------------------------------------------------
// Webserver parameter
const PORT = process.env.PORT || 8445;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;
const MAX_STEPS = 25;

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

// Yelp V3 API parameters
const YELP_ID = process.env.YELP_ID;
if (!YELP_ID) { throw new Error('missing YELP_ID') }
const YELP_SECRET = process.env.YELP_SECRET;
if (!YELP_SECRET) { throw new Error('missing YELP_SECRET') }

// Mongoose API parameters
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { throw new Error('missing MONGODB_URI') }

// Google Maps API parameters
const GOOGLEMAP_KEY = process.env.GOOGLEMAP_KEY;
if (!GOOGLEMAP_KEY) { throw new Error('missing GOOGLEMAP_KEY') }

// ----------------------------------------------------------------------------
// Initialize all other parameters
// ----------------------------------------------------------------------------
// Save latitude and longitude to global for reuse for yelp api call
var lat = '';
var long = '';
var location = '';

// Intialize variables that we will save to global
var responseCounter = 0; 
var exceedResNo = false;
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
var jsonPrice = '';
var jsonIsOpenNow = '';
var recGiven = false;
var recError = false;

// Save some preference parameters
var wantsOpen = false;
var wantsHighRating = false;
var wantsLowPrice = false;
var ratingFloor = 3;
var priceCeiling = 4;
var sortBy = null;
var radius = 1000;
var offset = 0;

// Create variable to indicate newUsers for mongodb storage
var newUser = false;

// Need function to reset params after convo ends
const resetParams = () => {
    lat = '';
    long = '';
    location = '';
    responseCounter = 0;
    exceedResNo = false;
    wantsOpen = false;
    wantsHighRating = false;
    wantsLowPrice = false;
    ratingFloor = 3;
    priceCeiling = 4;
    sortBy = null;
    radius = 1000;
    offset = 0;
    newUser = false;
    recGiven = false;
    recError = false;
}

// ----------------------------------------------------------------------------
// Facebook Messenger API specific code
// ----------------------------------------------------------------------------
// Function to get user's first name.
const requestUserName = (id) => {
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/v2.8/' + encodeURIComponent(id) +'?' + qs)
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
        throw new Error(json.error.message);
    } else {
        return json.first_name;
    }
  });
};

//send typing function
const typing = (id) => {
    const body = JSON.stringify({
        recipient: { id },
        sender_action:"typing_on",
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
const fbGoMessage = (id, message) => {
    const body = JSON.stringify({
        recipient: { id },
        message: {

            text:message,
            quick_replies: 
            [
            {
                "content_type":"text",
                "title":"Yes",
                "payload":"go"
            },
            {
                "content_type":"text",
                "title":"No",
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
const fbAskForLocation = (id, message) => {
    const body = JSON.stringify({
        recipient: { id },
        message: {
			text: message,
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
const fbYelpTemplate = (id, name, image_url, url, category, phone_number, rating, map_lat, map_long, is_open_now, price) => {
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
                        subtitle: category + "\nRating:" + rating +"🌟" + "\nPricing:"+price+"💰\n"+is_open_now,
                        buttons: 
                        [
                        {
                            type: "web_url",
                            url: url,
                            title: "View website "
                        },
                         {
                         	type: "element_share"
                         },
						 // {
						 // 							 type: "phone_number",
						 // 							 title: "Call",
						 // 							 payload: phone_number
						 // },
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
            text:"Can or not?",
            quick_replies: 
            [
            {
                "content_type":"text",
                "title":"Show me sth else.",
                "payload":"nextChoice"
            },
            {
                "content_type":"text",
                "title":"can",
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


// General FB quick replies for other suggestions that includes a handler for wantsOpen, wantsLowPrice, wantsHighRating
const fbNextChoicePref = (id, pref) => {
    if (pref=="wantsOpen") {
        var quick_replies = [
        {
            "content_type":"text",
            "title":"Show me sth else.",
            "payload":"nextChoice"
        },
        {
            "content_type":"text",
            "title":"Um.. it's closed...",
            "payload":"endConv" 
        },
        {
            "content_type":"text",
            "title":"Can",
            "payload":"endConv" 
        }
        ];
    } else if (pref=="wantsLowPrice") {
        var quick_replies = [
        {
            "content_type":"text",
            "title":"Show me sth else.",
            "payload":"nextChoice"
        },
        {
            "content_type":"text",
            "title":"so expensive!",
            "payload":"endConv" 
        },
        {
            "content_type":"text",
            "title":"Can",
            "payload":"endConv" 
        }
        ];
    } else if (pref=="wantsHighRating") {
        var quick_replies = [
        {
            "content_type":"text",
            "title":"Show me sth else.",
            "payload":"nextChoice"
        },
        {
            "content_type":"text",
            "title":"Kinda badly rated no?",
            "payload":"endConv" 
        },
        {
            "content_type":"text",
            "title":"Can",
            "payload":"endConv" 
        }
        ];
    } 
    const body = JSON.stringify({
        recipient: {id},
        message: {
            text:"Can or not?",
            quick_replies: quick_replies
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

// General FB quick replies for other suggestions.
const fbRestartRecommend = (id) => {
    const body = JSON.stringify({
        recipient: {id},
        message: {
            text: "That's all I have! Shall I go back to the first recommendation? Or should I enlarge the search area?",
            quick_replies: 
            [
            {
                "content_type":"text",
                "title":"Back to first!",
                "payload":"restartRecommend"
            },
            {
                "content_type":"text",
                "title":"Enlarge search area",
                "payload":"enlargeSearch"
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

// ----------------------------------------------------------------------------
// Wit.ai bot specific code
// ----------------------------------------------------------------------------
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

// User Defined function required to extract values from context
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
    //
    saveName({sessionId, context, entities}) {
        return new Promise(function(resolve,reject) {
            const recipientId = sessions[sessionId].fbid;

            userSession.findOne({fbid:recipientId},function(err,res) {
                if (err) throw err;
                return res;
            })
            .then(function(data){
                typing(recipientId);
            })
            .then(function(data){
                return requestUserName(recipientId);
            })
            .then(function(data){
                context.name = data;
                if (newUser) {
                    context.newUser=true;
                    newUser=false;
                } else {
                    context.existingUser=true;
                }
                return resolve(context);
			});
        })
    },

    checkLocation({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('checkLocation function called');
            if (lat & long) {
                context.lat = lat;
                context.long = long;
                delete context.location;
                delete context.missingLocation;
            } else if (location) {
                context.location = location;
                delete context.lat;
                delete context.long;
                delete context.missingLocation;
            } else {
                context.missingLocation = true;
                delete context.lat;
                delete context.long;
                delete context.location;
            }
            return resolve(context);
        });
    },

	askLocation({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
        	console.log('askLocation function called');
            
            typing(recipientId)
            .then(function(data){
                fbAskForLocation(recipientId,"Use the facebook location share button below or type your location in!");
            })
            .catch(function(err) {
                console.error(err);
            })
            
            return resolve(context);
        });
    },

    saveLocation({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('saveLocation function called');
            location = firstEntityValue(entities,'location');
            if (location) {
                context.location = location;
                delete context.missingLocation;
            }
            return resolve(context);
        });
    },

    runGeocoder({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('runGeocoder function called');
            if (context.location) {
                    // Geocode an address
                    return googleMapsClient.geocode({
                      address: context.location
                    }, function(err, response) {
                        if (!err) {
                            context.lat = response.json.results[0]['geometry']['location']['lat'];
                            context.long = response.json.results[0]['geometry']['location']['lng'];
                            delete context.missingLocation;
                            delete context.location;
                            return resolve(context);
                        } else {err} {
                            context.err = true;
                            delete context.lat;
                            delete context.long;
                            return resolve(context);
                        }
                    });
            }
        });
    },
    
    deleteLocation({sessionId,context,entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('deleteLocation function called');
            location = '';
            delete context.location;
            return resolve(context);
        });
    },

    giveRec({sessionId,context, entities}) {
        console.log('giveRec function called');
        const recipientId = sessions[sessionId].fbid;
        if (context.lat && context.long) {
            return new Promise(function(resolve,reject){
                typing(recipientId)
                .then(function(data){
                    return yelp.search({term: 'food', latitude: context.lat, longitude: context.long, open_now: wantsOpen, radius: radius, price: priceRange, limit: 50})
                })
                .then(function(data){
                    if (data.businesses) {
                        return saveYelpSearchOutput(data);   
                    } else {
                        context.noRec = true;
                        delete context.recGiven;
                        delete context.missingLocation;
                        return resolve(context);
                    }
                })
                .then(function(data){
                    if (jsonName) {
                        return shuffleYelp(jsonName);   
                    } else {
                        return false;
                    }
                })
                .then(function(data){
                    if (data) {
                        while (jsonCat[responseCounter].indexOf("Supermarkets")!=-1 
                        || jsonCat[responseCounter].indexOf("Convenience")!=-1 
                        || jsonCat[responseCounter].indexOf("Grocery")!=-1
                        || jsonCat[responseCounter].indexOf("Grocer")!=-1) {
                            responseCounter += 1;
                        }
                        if (responseCounter >= jsonName.length) {
                            fbRestartRecommend(recipientId);
                            responseCounter = 0;
                            exceedResNo = true;
                        } else {
                            return yelpBiz.business(jsonId[responseCounter]);
                        }    
                    } else {
                        return false;
                    }
                    
                })
                .then(function(data){
                    if (data) {
                        return saveYelpBusinessOutput(data);   
                    } else {
                        return false;
                    }
                })
                .then(function(data){
                    if (!exceedResNo & data) {
                        return fbYelpTemplate(
                            recipientId,
                            jsonName[responseCounter],
                            jsonImage[responseCounter],
                            jsonUrl[responseCounter],
                            jsonCat[responseCounter],
                            jsonNumber[responseCounter],
                            jsonRating[responseCounter],
                            jsonMapLat[responseCounter],
                            jsonMapLong[responseCounter],
                            jsonIsOpenNow,
                            jsonPrice[responseCounter]
                        );
                    }
                })
                .then(function(data){
                    context.recGiven = true;
                    delete context.noRec;
                    delete context.missingLocation;
                    return resolve(context);
                })
                .catch(err => {
                    console.error(err);
                    return reject(context);
                });
            });
        } else {
            context.missingLocation = true;
            delete context.noRec;
            delete context.recGiven;
            return context;
        }
    },

    checkRadius({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('checkRadius function called');
            context.radius = radius;
            return resolve(context);
        });
    },

    saveRadiusPref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('saveRadiusPref function called');
            radius = firstEntityValue(entities,'distance');
            context.radius = radius;
            return resolve(context);
        });
    },

    checkForUserPref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('checkForUserPref function called');
            if (!exceedResNo & context.recGiven) {
                if (jsonIsOpenNow=="Closed.") {
                    fbNextChoicePref(recipientId,"wantsOpen");
                } else if (jsonPrice[responseCounter]>=priceCeiling) {
                    fbNextChoicePref(recipientId,"wantsLowPrice")
                } else if (jsonRating[responseCounter]<=ratingFloor) {
                    fbNextChoicePref(recipientId,"wantsHighRating")
                } else {
                    fbNextChoice(recipientId);
                }
            }
            return resolve(context);
        });
    },

    saveResult({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('saveResult function called');
            addOrUpdateUserResult(recipientId,jsonName[responseCounter],jsonCat[responseCounter]);
            context.resName=jsonName[responseCounter];
            return resolve(context);
        });
    },

    nextRec({sessionId,context, entities}) {
        console.log('nextRec function called');
        const recipientId = sessions[sessionId].fbid;

        if (responseCounter >= jsonName.length) {
            // NEED TO HANDLE THIS PART VIA WIT
            fbRestartRecommend(recipientId);
            responseCounter = 0;
        } else {
            var i = responseCounter;
            i++;
            responseCounter = i;
            while (!jsonName[i] || !jsonImage[i] || !jsonUrl[i] || !jsonNumber[i] || !jsonRating[i]
                || !jsonMapLat[i] || !jsonMapLong[i] || jsonCat[i].indexOf("Supermarkets")!=-1 
                || jsonCat[i].indexOf("Convenience")!=-1 
                || jsonCat[i].indexOf("Grocery")!=-1
                || jsonCat[i].indexOf("Grocer")!=-1) {
                i++;
                if (responseCounter >= jsonName.length) {
                    // NEED TO HANDLE THIS PART VIA WIT
                    fbRestartRecommend(recipientId);
                    responseCounter = 0;
                    break;
                } else {
                    responseCounter = i;
                }
            }
        }
        if (responseCounter < jsonName.length && responseCounter != 0) {
            return new Promise(function(resolve,reject){
                typing(recipientId)
                .then(function (data) {
                    return yelpBiz.business(jsonId[responseCounter])
                })
                .then(function(data){
                    if (data.businesses) {
                        return saveYelpSearchOutput(data);   
                    } else {
                        context.noRec = true;
                        delete context.recGiven;
                        delete context.missingLocation;
                        return resolve(context);
                    }
                })
                .then(function(data) {
                    if (!exceedResNo) {
                        return fbYelpTemplate(
                            recipientId,
                            jsonName[responseCounter],
                            jsonImage[responseCounter],
                            jsonUrl[responseCounter],
                            jsonCat[responseCounter],
                            jsonNumber[responseCounter],
                            jsonRating[responseCounter],
                            jsonMapLat[responseCounter],
                            jsonMapLong[responseCounter],
                            jsonIsOpenNow,
                            jsonPrice[responseCounter]
                        );
                    }    
                })
                .then(function(data){
                    context.recGiven = true;
                    delete context.noRec;
                    return resolve(context);
                })
                .catch(err => {
                    console.error(err);
                    context.noRec = true;
                    delete context.recGiven;
                    return resolve(context);
                });
            });
        }
    },

    changeExpensivePref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('changeExpensivePref function called');
            wantsLowPrice=true;
            if (priceCeiling==1) {
                context.lowestPrice = true;
                delete context.reducePrice;
                return resolve(context);
            } else {
                priceCeiling -= 1;
                priceRange=updatePriceRange(priceCeiling-1);
                context.reducePrice = true;
                delete context.lowestPrice;
                return resolve(context);
            }
        });
    },

    resetExpensivePref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('resetExpensivePref function called');
            wantsLowPrice=false;
            priceCeiling = 4;
            priceRange = updatePriceRange(priceCeiling);
            return resolve(context);
        });
    },

    changeOpenPref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('changeExpensivePref function called');
            wantsOpen=true;
            context.openOnly=wantsOpen;
            return resolve(context);
        });
    },

    changeRatingPref({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('changeRatingPref function called');
            wantsHighRating=true;
            sortBy = updateSortBy(true);
            context.wantsHighRating=wantsHighRating;
            return resolve(context);
        });
    },

    endConvo({sessionId,context, entities}) {
        return new Promise(function(resolve, reject) {
            const recipientId = sessions[sessionId].fbid;
            console.log('endConvo function called');
            context.done = true;
            return resolve(context);
        });
    }
}

// Setting up our bot
const wit = new Wit({
    accessToken: WIT_TOKEN,
    actions,
    logger: new log.Logger(log.INFO)
});

// ----------------------------------------------------------------------------
// Yelp API specific code
// ----------------------------------------------------------------------------
var yelp = new Yelp({
    app_id: YELP_ID,
    app_secret: YELP_SECRET
});

// use different package for Biz search
var yelpBiz = new YelpBiz({ id: YELP_ID, secret: YELP_SECRET});

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
    if (jsonBiz[0].price) {
        jsonPrice = [jsonBiz[0].price.length];   
    } else {
        jsonPrice = [""];
    }
    // Store all results
    i = 0;
    if (jsonBiz.length > 0) {
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
            if (jsonBiz[i].price) {
                jsonPrice[i] = jsonBiz[i].price.length;
            } else {
                jsonPrice[i] = "Not available";
            }
            i++;
        } while (i < jsonBiz.length);
    }
    return true;
};

// Create function to save yelp business output
const saveYelpBusinessOutput = (data) => {
    if (data.hours) {
        const jsonHours = data.hours;
        jsonIsOpenNow = jsonHours[0].is_open_now; 
        if (jsonIsOpenNow==true) {
            jsonIsOpenNow = "Open now."
        } else {
            jsonIsOpenNow = "Closed."
        }
        var resObj = jsonIsOpenNow;    
    } else {
        var resObj = "Unknown status";
    }

    return resObj;
};

const updatePriceRange = (data) => {
    var res = "";
    switch (data) {
        case 4:
            res = '1,2,3,4';
            break;
        case 3:
            res = '1,2,3';
            break;
        case 2:
            res = '1,2';
            break;
        case 1:
            res = '1';
    }
    return res;
}

const updateSortBy = (data) => {
    var res = "";
    if (data) {
        res = "rating";
    } else {
        res = "best_match";
    }
    return res;
}

var priceRange = updatePriceRange(priceCeiling);

const updateOffset = () => {
    offset += 1;
}

const shuffleYelp = (array) => {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = jsonName[i];
        var temp2 = jsonCat[i];
        var temp3 = jsonImage[i];
        var temp4 = jsonRating[i];
        var temp5 = jsonPrice[i];
        var temp6 = jsonUrl[i];
        var temp7 = jsonMapLat[i];
        var temp8 = jsonMapLong[i];
        var temp9 = jsonId[i];

        jsonName[i] = jsonName[j];
        jsonName[j] = temp;

        jsonCat[i] = jsonCat[j];
        jsonCat[j] = temp2;

        jsonImage[i] = jsonImage[j];
        jsonImage[j] = temp3;

        jsonRating[i] = jsonRating[j];
        jsonRating[j] = temp4;


        jsonPrice[i] = jsonPrice[j];
        jsonPrice[j] = temp5;


        jsonUrl[i] = jsonUrl[j];
        jsonUrl[j] = temp6;


        jsonMapLat[i] = jsonMapLat[j];
        jsonMapLat[j] = temp7;


        jsonMapLong[i] = jsonMapLong[j];
        jsonMapLong[j] = temp8;


        jsonId[i] = jsonId[j];
        jsonId[j] = temp9;
    }
    return true;
}

// ----------------------------------------------------------------------------
// Mongodb Codes
// ----------------------------------------------------------------------------
var db = mongoose.createConnection(MONGODB_URI);
var status;
db.on('error', function(err){
    if(err) throw err;
});

db.once('open', function callback () {
    console.info('Mongo db connected successfully');
    status = "live";
});

db.on('disconnected', function callback () {
    status = "dead";
});

const schema = mongoose.Schema;    
const userSessionSchema = new schema({
    fbid : String,
    firstName: String,
    created_at: Date,
    updated_at: Date
});

// Add model to mongoose
const userSession = db.model('userSession', userSessionSchema);

const addOrUpdateUser = (fbid,firstName) => {
    // if disconnected, reconnect
    console.log(status);
    if (status=="dead") {
        db.open();
    }
    // Find user, otherwise save new user
    // Setup stuff
    var query = { fbid:fbid },
        update = { fbid:fbid, firstName: firstName, $setOnInsert: {created_at: new Date()}, updated_at: new Date() },
        options = { upsert: true, returnNewDocument: true };

    // Find the document
    userSession.findOneAndUpdate(query, update, options, function(error, result) {
        if (error) throw error;
        if (result) {
            console.log("User session updated!");
        } else {
            console.log("User session created!");
            newUser = true;
        }
    });
}

const userSavedResultsSchema = new schema({
    fbid : String,
    resName: String,
    resCategory: String
});

// Add model to mongoose
const userSavedResults = db.model('userSavedResults', userSavedResultsSchema);

const addOrUpdateUserResult = (fbid,resName,resCategory) => {
    // if disconnected, reconnect
    console.log(status);
    if (status=="dead") {
        db.open();
    }
    // Find user, otherwise save new user
    // Setup stuff
    var query = { fbid:fbid },
        update = { fbid:fbid, resName: resName, resCategory:resCategory },
        options = { upsert: true, returnNewDocument: true };

    // Find the document
    userSession.findOneAndUpdate(query, update, options, function(error, result) {
        if (error) throw error;
        if (result) {
            console.log("User results updated!");
        } else {
            console.log("User results created!");
        }
    });
}

// ----------------------------------------------------------------------------
// Create standard conversation chunks
// ----------------------------------------------------------------------------
const recommendChunk = (sender, message,lat,long,location,wantsOpen,priceRange,food,sortBy,radius) => {
    if (!food) {
        food = "";
    }

    sortBy = updateSortBy(sortBy);
    
    fbMessage(sender,message)
    .then(function(data) {
        typing(sender);
        return true;
    })
    .then(function (data) {
        if (lat&long) {
                return yelp.search({term: food+'food', latitude: lat, longitude: long, open_now: wantsOpen, price: priceRange, sort_by: sortBy, radius: radius, offset: offset*50, limit: 50});
        } else if (location) {
                return yelp.search({term: food+'food', location: location, open_now: wantsOpen, priceRange, sort_by: sortBy, radius: radius, offset: offset*50, limit: 50});
        }
    })
    .then(function (data) {
        if (data) {
            saveYelpSearchOutput(data);
            return true;            
        } else {
            return false;
        }
    })
    .then(function (data) {
        if (data) {
            shuffleYelp(jsonName);
            return true;
        } else {
            return false;
        }
    })
    .then(function (data) {
        if (data) {
            while (jsonCat[responseCounter].indexOf("Supermarkets")!=-1 
            || jsonCat[responseCounter].indexOf("Convenience")!=-1 
            || jsonCat[responseCounter].indexOf("Grocery")!=-1
            || jsonCat[responseCounter].indexOf("Grocer")!=-1) {
                responseCounter += 1;
            }
            if (responseCounter >= jsonName.length) {
                fbRestartRecommend(sender);
                responseCounter = 0;
                exceedResNo = true;
            } else {
                saveYelpBusinessOutput(yelpBiz.business(jsonId[responseCounter]));
            }
            return true;
        } else {
            return false;
        }
    })
    .then(function(data) {
        if (data) {
            if (!exceedResNo) {
                fbYelpTemplate(
                    sender,
                    jsonName[responseCounter],
                    jsonImage[responseCounter],
                    jsonUrl[responseCounter],
                    jsonCat[responseCounter],
                    jsonNumber[responseCounter],
                    jsonRating[responseCounter],
                    jsonMapLat[responseCounter],
                    jsonMapLong[responseCounter],
                    jsonIsOpenNow,
                    jsonPrice[responseCounter]
                );
                recGiven = true;
            }    
        } else {
            recGiven = false;
        }
        recError = false;
        return true;
    })                               
    .catch(function (err) {
        recError = true;
        console.error(err);
        return true;
    });
}

const nextRecommendChunk = (sender) => {
    // This part is to respond to the user's request for other recommendations!
    if (responseCounter >= jsonName.length) {
        fbRestartRecommend(sender);
        responseCounter = 0;
    } else {
        var i = responseCounter;
        i++;
        responseCounter = i;
        while (!jsonName[i] || !jsonImage[i] || !jsonUrl[i] || !jsonCat[i] || !jsonNumber[i] || !jsonRating[i]
            || !jsonMapLat[i] || !jsonMapLong[i]) {
            i++;
            if (responseCounter >= jsonName.length) {
                fbRestartRecommend(sender);
                responseCounter = 0;
                break;
            } else {
                responseCounter = i;
            }
        }
        if (responseCounter < jsonName.length && responseCounter != 0) {
            fbMessage(sender, "How about this?")
            .then(function(data){
                typing(sender);
            })
            .then(function (data) {
                return yelpBiz.business(jsonId[responseCounter])
            })
            .then(function (data) {
                if (data) {
                    saveYelpBusinessOutput(data);   
                    return true;
                } else {
                    return false;
                }
            })
            .then(function(data) {
                if (data) {
                    if (!exceedResNo) {
                        fbYelpTemplate(
                            sender,
                            jsonName[responseCounter],
                            jsonImage[responseCounter],
                            jsonUrl[responseCounter],
                            jsonCat[responseCounter],
                            jsonNumber[responseCounter],
                            jsonRating[responseCounter],
                            jsonMapLat[responseCounter],
                            jsonMapLong[responseCounter],
                            jsonIsOpenNow,
                            jsonPrice[responseCounter]
                        );
                        recGiven = true;
                    }    
                } else {
                    recGiven = false;
                }
                recError = false;
                return true;
            })   
            .catch(function(err) {
                console.error(err);
                return true;
            });
        } 
    }
};

// ----------------------------------------------------------------------------
// App Main Code Body
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

                        // Update user session
                        requestUserName(sender)
                        .then(function(data){
                            addOrUpdateUser(sender,data);
                        });

                        // We retrieve the message content
                        const {text, attachments} = event.message;

                        if (attachments) {

                            // Need to initialize user session id to update wit context
                            const sessionId = findOrCreateSession(sender);

                            // We received an attachment
                            // First need to identify if attachment was a shared location
                            if (attachments[0].type=="location") {

                                // Save lat and long
                                lat = attachments[0].payload.coordinates.lat;
                                long = attachments[0].payload.coordinates.long;
                                console.log('received coords:'+"lat:"+lat+"&long:"+long);
                                
                                fbGoMessage(sender,"Ok, ready to start?");
                                /*                                
                                // Run lat and long through to yelp api
                                const message = "How about this?"
                                recommendChunk(sender, message,lat,long,null,wantsOpen,priceRange,null,sortBy,radius);
                                sessions[sessionId].context.recommendGiven = true;
                                */                      
                            } else {
                                // Let's reply with an automatic message
                                fbMessage(sender, "C'mon, I'm just a bot. I won't understand random attachments...")
                                .catch(console.error);
                            }

                        } 
						else if (text) {
                            // We received a text message

                            // We retrieve the user's current session, or create one if it doesn't exist
                            // This is needed for our bot to figure out the conversation history
                            const sessionId = findOrCreateSession(sender);
                            console.log(sessions[sessionId].context);

                            // For all other text messages
                            // Let's forward the message to the Wit.ai Bot Engine
                            // This will run all actions until our bot has nothing left to do
                            wit.runActions(
                                    sessionId, // the user's current session
                                    text, // the user's message
                                    sessions[sessionId].context, // the user's current session state
                                    MAX_STEPS
                            )
                            .then((context) => {
                                // Our bot did everything it has to do.
                                // Now it's waiting for further messages to proceed.
                                console.log('Waiting for next user messages');

                                // Based on the session state, you might want to reset the session.
                                // This depends heavily on the business logic of your bot.
                                // Example:

                                if (context.done) {
                                    delete sessions[sessionId];
                                    delete context.resName;
                                    delete context.done;
                                    resetParams();
                                } else {
                                    // Updating the user's current session state
                                    sessions[sessionId].context = context;
                                }
                                
                            })
                            .catch((err) => {
                                console.error('Oops! Got an error from Wit: ', err.stack || err);
                            })                                      
                            
                        }
                    } else if (event.postback) {
                        // This is to handle postbacks from cards
                        const sender = event.sender.id;

                        // Store text from payload
                        let text = JSON.stringify(event.postback.payload);
                        console.log(text);

                        // Check if payload is a new conversation and start new conversation thread
                        if (text=='"startConvo"') {
                            typing(sender)
                            .then(function(data){
                                return requestUserName(sender);
                            })
                            .then(function(data){
                                addOrUpdateUser(sender,data);
                            })
                            .then(function(data){
                                return requestUserName(sender);
                            })
                            .then(function(data){
                                return fbMessage(sender,"Hi "+ data + ". My name is James.");
                            })
                            .then(function(data){
                                return fbGoMessage(sender,"I can help you find places to eat near you.");
                            })
                            .catch(function(err){
                                console.error(err);
                            });
                        }
                    } else {
                        console.log('received event', JSON.stringify(event));
                    }
                })
            })
        }
    res.sendStatus(200);
})

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




