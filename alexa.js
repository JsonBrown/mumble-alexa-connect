'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const https = require('https');
const fs = require('fs');
const streamToBuffer = require('stream-to-buffer');
const streamifier = require('streamifier');
const httpParser = require('http-message-parser');
const TOKEN_PATH = './config/token.json';
const AUTH_PATH = './config/auth.json';

const ERROR_CODES = {
    INVALID_TOKEN: 'com.amazon.alexahttpproxy.exceptions.InvalidAccessTokenException'
};

var token = require(TOKEN_PATH);
var auth = require(AUTH_PATH);

function getNewToken() {
    const URL = `https://${auth.server}:${auth.port}/device/accesstoken/${auth.product_id}/${auth.device_serial}/${auth.device_secret}`;
    return new Promise((resolve,reject) => {
        https.get(URL, (res) => {
            console.log('statusCode: ', res.statusCode);
            console.log('headers: ', res.headers);

            res.on('data', (buffer) => {
                var tokenStr = buffer.toString('utf8');
                fs.writeFile(TOKEN_PATH, tokenStr, () =>  {
                    token = JSON.parse(tokenStr);
                    resolve();
                });
            });
        }).on('error', (e) => {
            console.error(e);
            reject();
        });
    });
}
const processors = {
    'audio/mpeg': (buffer) => fs.writeFile('data/output.mp3', buffer, 'binary'),
    'application/json' : (buffer) => console.log(JSON.parse(buffer.toString('utf8')))
};


function post(audioBuffer) {
    const BOUNDARY = 'MYIQIS55';
    const BOUNDARY_DASHES = '--';
    const NEWLINE = '\r\n';
    const METADATA_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="metadata"';
    const METADATA_CONTENT_TYPE = 'Content-Type: application/json; charset=UTF-8';
    const AUDIO_CONTENT_TYPE = 'Content-Type: audio/L16; rate=16000; channels=1';
    const AUDIO_CONTENT_DISPOSITION = 'Content-Disposition: form-data; name="audio"';

    const headers = {
        'Authorization' : 'Bearer ' + token.access,
        'Content-Type':'multipart/form-data; boundary=' + BOUNDARY
    };

    const metadata = {
        messageHeader: {},
        messageBody: {
            profile: 'alexa-close-talk',
            locale: 'en-us',
            'format': 'audio/L16; rate=16000; channels=1'
        }
    };

    const postDataStart = [
        NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE, METADATA_CONTENT_DISPOSITION, NEWLINE, METADATA_CONTENT_TYPE,
        NEWLINE, NEWLINE, JSON.stringify(metadata), NEWLINE, BOUNDARY_DASHES, BOUNDARY, NEWLINE,
        AUDIO_CONTENT_DISPOSITION, NEWLINE, AUDIO_CONTENT_TYPE, NEWLINE, NEWLINE
    ].join('');

    const postDataEnd = [NEWLINE, BOUNDARY_DASHES, BOUNDARY, BOUNDARY_DASHES, NEWLINE].join('');

    const options = {
        hostname: 'access-alexa-na.amazon.com',
        port: 443,
        path: '/v1/avs/speechrecognizer/recognize',
        method: 'POST',
        headers: headers,
        encoding: 'binary'
    };
    return new Promise((resolve,reject) => {
        const req = https.request(options,res => {
            streamToBuffer(res, (err, buffer) => {
                if (err) {
                    console.error('error', err);
                    reject();
                }
                var errorCode;
                try {
                    errorCode = JSON.parse(buffer.toString('utf8')).error.code;
                    console.log(errorCode);
                    reject(errorCode);
                } catch (e) {}
                const parsedMessage = httpParser(buffer);
                resolve(parsedMessage.multipart);
            });
        });

        req.write(postDataStart);
        req.write(audioBuffer);
        req.write(postDataEnd);
        req.end();
    });
}
exports.tell = function(inStream) {
    return new Promise((resolve, reject) => {
        streamToBuffer(inStream, (e,buffer) => {
            post(buffer)
                .catch((e) => {
                    if(e === ERROR_CODES.INVALID_TOKEN) {
                        return getNewToken().then(() => post(buffer))
                    } else {
                        console.log(e);
                    }
                })
                .then((buffer) => {
                    if(buffer && Array.isArray(buffer)) {
                        resolve(streamifier.createReadStream(Buffer.concat(buffer.map(p => p.body))));
                        /*buffer.forEach(function(part) {
                            var contentType = part.headers['Content-Type'];
                            var bodyBuffer = part.body;
                            if (bodyBuffer) processors[contentType](bodyBuffer);
                        });*/
                    } else {
                        reject(buffer);
                    }
                });
        });
    });
};