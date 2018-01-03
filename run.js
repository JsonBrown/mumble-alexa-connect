const express = require('express');
const SoxCommand = require('sox-audio');
const MemoryStream = require('memorystream');
const alexa = require('./alexa.js');
const fs = require('fs');

var app = express();

app.post('/:samplerate', function (req, res) {
    var sampleRate = req.params['samplerate'];
    if(sampleRate != "44100") sampleRate = "48000";
    console.log(sampleRate);
    alexa.tell(toWav(req,sampleRate))
        .then(s => toPCM(s,sampleRate).pipe(res))
        .catch(e => {
            console.log(e);
            res.end();
        });
});

app.listen(3000, function () {
    console.log('Alexa Translation service loaded on port 3000');
});
function toPCM(input, sampleRate) {
    var output = new MemoryStream();
    var cmd = new SoxCommand();
    cmd.on('error', () => {});
    cmd.input(input)
        .inputFileType('mp3')
        .output(output)
        .outputSampleRate(sampleRate)
        .outputEncoding('signed')
        .outputBits(16)
        .outputChannels(1)
        .outputFileType('raw')
        .run();
    return output;
}
function toWav(input, sampleRate) {
    var cmd = new SoxCommand();
    var output = new MemoryStream();
    cmd.on('error', () => {});
    cmd.input(input)
        .inputSampleRate(sampleRate)
        .inputEncoding('signed')
        .inputBits(16)
        .inputChannels(1)
        .inputFileType('raw')
        .output(output)
        .outputSampleRate(16000)
        .outputEncoding('signed')
        .outputBits(16)
        .outputChannels(1)
        .outputFileType('wav');
    cmd.run();
    return output;
}