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
var http = require('https');
var parseString = require('xml2js').parseString;
var parse = require('xml2json');
var events = require("events");

//Create an event browdcaster for the CashRegister transactions
var Cash = (function () {
    var eventEmitter = new events.EventEmitter();

    return {
        EventEmitter:eventEmitter  // The event broadcaster
    };
})();

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
    //Check attrs
    if(!req.body.clientReference || !req.body.invoiceReference){
        res.status(400).json({status: 'error', message: 'payementstatus requires clientReference and invoiceReference arguments.'});
    }

    var clientReference = req.body.clientReference;
    var invoiceReference = req.body.invoiceReference;
    var envelope = _.template("<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ext=\"http://external.interfaces.ers.seamless.com/\">\n"
                               + "<soapenv:Body>\n"
                               + "<ext:getPaymentStatus>\n"
                               + "<context>\n"
                               + "<channel>slickappsWS</channel>\n"
                               + "<clientReference><%= clientReference %></clientReference>\n"
                               + "<initiatorPrincipalId>\n"
                               + "<id>slickapps_terminal</id>\n"
                               + "<userId>9900</userId>\n"
                               + "<type>TERMINALID</type>\n"
                               + "</initiatorPrincipalId>\n"
                               + "<password>784536</password>"
                               + "</context>\n"
                               + "<invoiceReference><%= invoiceReference %></invoiceReference>\n"
                               + "</ext:getPaymentStatus>\n"
                               + "</soapenv:Body>\n"
                               + "</soapenv:Envelope>\n")({clientReference: clientReference, invoiceReference: invoiceReference});
    
    var options = {
        hostname: 'extdev.seqr.com',
        port: 443,
        path: '/soap/merchant/cashregister-2?wsdl',
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'Content-Length': envelope.length
        },
        keepAliveMsecs: '2000',
        keepAlive: true
    };
    //Track start time
    var request;
    var initTime = (new Date())*1;
    //Create an interval
    var interval = setInterval(function() {
        request = http.request(options, function (r) {
            console.log('request initiated');
            var body = '';
            var endTime;

            //Concatenate data
            r.on('data', function (chunk) {
                body += chunk;
            });

            r.on('end', function () {
                var parsed = parse.toJson(body, {object: true});
                var status;
                
                try{
                    //Try checking status
                    status = parsed["soap:Envelope"]["soap:Body"]["ns2:getPaymentStatusResponse"]["return"]["status"];

                    switch(status){
                    case 'PAID':
                    case 'CANCELLED':
                    case 'ISSUED':
                        //Just kill it
                        clearInterval(interval);
                        res.status(200).json({status: 'success', paymentStatus: status});
                        break;
                    default:
                        endTime = (new Date())*1;
                        console.log('check at: ' + endTime, initTime);
                        console.log('status', status);
                        console.log('response', parsed);
                        //If we have been polling for more than 3 minutes just kill the interval and response
                        if((endTime - initTime) > 180000){
                            clearInterval(interval);
                            res.status(200).json({status: 'success', paymentStatus: status});
                        }
                    }
                    
                }catch(e){
                    //IF an error happens then we can just kill it
                    clearInterval(interval);
                    res.json({status: 'error', message: e.message});
                }
            });
        });

        request.write(envelope);
        request.end();
    }, 2000);
});

//Use CashRegister router
app.use('/addUserCreditOLD', CashRegister);

/*===============START=================*/
app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});