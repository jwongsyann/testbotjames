'use strict';

// ----------------------------------------------------------------------------
// Load required packages
// ----------------------------------------------------------------------------
var mongoose = require('mongoose');
var schema = mongoose.Schema;

var db = mongoose.connect("mongodb://heroku_hq3t2972:2l84bugq42te0t69tq97h2qtvu@ds145370.mlab.com:45370/heroku_hq3t2972");

// ----------------------------------------------------------------------------
// Set up database
// ----------------------------------------------------------------------------
// Defining a schema for Business
var userSessionSchema = new schema({
    fbid : String,
    firstName: String,
    created_at: Date,
    updated_at: Date
});

// on every save, add the date
userSessionSchema.pre('save', function(next) {
  // get the current date
  var currentDate = new Date();
  
  // change the updated_at field to current date
  this.updated_at = currentDate;

  // if created_at doesn't exist, add to that field
  if (!this.created_at)
    this.created_at = currentDate;

  next();
});


// Add model to mongoose
var userSession = mongoose.model('userSession', userSessionSchema);

/*
var newUser = userSession({
	fbid: "02",
	firstName: "Justin"
})


// call the built-in save method to save to the database
newUser.save(function(err) {
  if (err) throw err;

  console.log('User saved successfully!');
});
*/




// Find user, otherwise save new user
// Setup stuff
var query = { fbid:'02' },
    update = { fbid:'02', firstName: "Justin", $setOnInsert:{created_at: new Date()}, updated_at: new Date() },
    options = { upsert: true, returnNewDocument: true };

// Find the document
userSession.findOneAndUpdate(query, update, options, function(error, result) {
	if (error) throw err;
	if (result) {
		console.log("Updated!");
	} else {
		console.log("User session created!")
	}
});

/*
userSession.find({fbid:'03'},function(err,user){
	if (err) throw err;
})
.then(function(user) {
	if (!user.length) {
		var newUser = new userSession({
				fbid: "03",
				firstName: "Selene"
		});
		console.log(newUser);
		newUser.save(function(err){
			if (err) throw err;
			console.log("saved!")
		})
		return true;		
	} else {
		return false;
	}
})
*/
/*
// get the user starlord55
userSession.find({ fbid: "02" }, function(err, user) {
  	if (user.length) {
  		console.log(user.length);
  		var newUser = userSession({
			fbid: "03",
			firstName: "Selene"
		});
  		// call the built-in save method to save to the database
		newUser.save(function(err) {
		if (err) throw err;
		console.log('User saved successfully!');
		});
  	} else {
  		console.log(user[0].firstName);
  	}
	
})
*/

/*
.then(function(data){
	console.log(data[0].firstName);
	const newUser = userSession({
        fbid: "03",
        firstName: "Selene"
    });

    // call the built-in save method to save to the database
    newUser.save(function(err) {
        if (err) throw err;
        console.log('User saved successfully!');
        return true;
    });
});
*/
db.disconnect();