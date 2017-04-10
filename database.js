'use strict';

// ----------------------------------------------------------------------------
// Load required packages
// ----------------------------------------------------------------------------
var mongoose = require('mongoose');
var schema = mongoose.Schema;

// ----------------------------------------------------------------------------
// Set up database
// ----------------------------------------------------------------------------
// Defining a schema for Business
var businessSchema = new mongoose.Schema({
    rating : String,
    name: String,
    url: String,
    categories:Object,
    phone: String,
    image_url: String,
    display_phone: String,
    id: String,
    location:Object 
});

// Add model to mongoose
mongoose.model('Business', businessSchema);

