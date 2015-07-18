'use strict';

require('newrelic');

var express = require('express');
var session = require('express-session');
var _ = require('lodash');
var s = require("underscore.string");
var bodyParser = require('body-parser');
var compression = require('compression');
var multer = require('multer');
var ejs = require('ejs-locals');
var MobileDetect = require('mobile-detect');
var helmet = require('helmet');
var CryptoJS = require('cryptojs');
var https = require('https');

//===============EXPRESS================
// Configure Express
var app = express();
app.set('port', (process.env.PORT || 4000));
app.use(session({
    secret: process.env.SESSION_SECRET,
    rolling: true,
    saveUninitialized: true,
    resave: false
}));
app.engine('ejs', ejs);
app.set('views', __dirname + '/views'); // Specify the folder to find templates
app.set('view engine', 'ejs'); // Set the template engine
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(multer());
app.use(express.static(__dirname + '/public'));
app.use(helmet());
//Enable cors
app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'X-Requested-With');
        next();
    })
    .options('*', function(req, res, next) {
        res.end();
    });

app.locals._ = _;

//===============ROUTES===============
var title = process.env.DEFAULT_PAGE_TITLE;
var logRequest = function(req, res, next) {
    console.log('%s %s %s', req.method, req.url, req.path);
    next();
};

var getDeviceExtension = function(ua) {
    var md = new MobileDetect(ua);

    return md.phone() ? 'phones' : md.tablet() ? 'tablets' : '';
};

var checkEnvironment = function(req, res, next) {
    // Since the session check is performed in all routes we can
    // also configure the layout
    var device = getDeviceExtension(req.headers['user-agent']);
    switch (device) {
        case 'phones':
            app.locals.LAYOUT = LAYOUT = 'phones';
            break;
        case 'tablets':
            app.locals.LAYOUT = LAYOUT = 'tablets';
            break;
        default:
            app.locals.LAYOUT = LAYOUT = 'main';
            break;
    }

    next();
};

//Main router
var CashRegister = express.Router();

CashRegister.use(logRequest);

CashRegister.post('/', function(req, res) {

    var body = request.params.body;

    if(!body){
        res.status(400).json({status: 'error'});
    }

    var options = {
        hostname: 'extdev.seqr.com',
        port: 443,
        path: '/soap/merchant/cashregister-2?wsdl',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
            'Content-Length': body.length
        }
    };

    http.request(options, function(res){

        res.on('data', function(d){
            res.status(200).json({status: 'success', data: JSON.stringify(d)});
        });
    });

    req.end();

    req.on('error', function(e){
        res.status(400).json({status: 'error', error: e});
    });
});

//Use credit OLD
app.use('/addUserCreditOLD', CashRegister);
/*===============START=================*/
app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});