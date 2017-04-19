var database = require("./database");
var mongoose = require('mongoose');

mongoose.connect("mongodb://heroku_hq3t2972:2l84bugq42te0t69tq97h2qtvu@ds145370.mlab.com:45370/heroku_hq3t2972");

var userSession = mongoose.model("UserSession",database.userSession);

var newUser = userSession({
	id: "01",
	firstName: "Justin"
})

// call the built-in save method to save to the database
newUser.save(function(err) {
  if (err) throw err;

  console.log('User saved successfully!');
});