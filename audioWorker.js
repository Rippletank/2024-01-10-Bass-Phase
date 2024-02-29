//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio engine webworker,  handles calls to the audio.js functions
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//This code is not optimised for performance - it is intended to be fairly easy to understand and modify
//It is not intended to be used in production code
//Copyright N.Whitehurst 2024
//https://github.com/Rippletank/2024-01-10-Bass-Phase
//MIT License - use as you wish, but no warranty of any kind, express or implied, is provided with this software
//Code was written with the help of Github Copilot, particularly for UI/CSS stuff and some mundane refactoring chores
//Web Audio API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API & https://mdn.github.io/webaudio-examples/voice-change-o-matic/ for FFT
//Wikipedia for refresher on harmonic series and related
//Quick IIF refresher and general approach for suitable smoothing values https://zipcpu.com/dsp/2017/08/19/simple-filter.html
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


import {
    getAudioBuffer, 
    preMaxCalcStartDelay,
    scaleAndGetNullBuffer,

    getPreview,    

    getDetailedFFT, 
    getTHDPercent,
    getTHDGraph, 
}
from './audio.js';


// If you need to load external scripts, you can do so with importScripts
// importScripts('script1.js', 'script2.js');

self.onmessage = function(event) {
    var data = event.data;
    try {
        switch (data.action) {
            case 'getTHDGraph':
                doTHDGraphData(data.referencePatch);
                break;
            case 'getTHDPercent':
                doTHDPercent(data.referencePatch);
                break;
            case 'getDetailedFFT':
                doDetailedFFT(data.sampleRate, data.patch, data.filterPreviewSubject );
                break;
            case 'getAudioBuffers':
                doAudioBuffer(data.patchesToUse, data.sampleRate, data.isStereo , data.isNormToLoudest);
                break;
            case 'getPreview':
                doPreview(data.referencePatch, data.filterPreviewSubject , data.sampleRate);
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    } catch (error) {
        // Send any errors back to the main thread
        self.postMessage({ error: error.message });
    }
};

function doTHDGraphData(referencePatch) {
    //let t = performance.now();
    var graphData = getTHDGraph( referencePatch );
    self.postMessage({ graphData },  [graphData.thd.buffer, graphData.frequencies.buffer]);
    //console.log('THD graph time:', performance.now()-t);
}

function doTHDPercent(referencePatch) {
    //let t = performance.now();
    var THDPercent = getTHDPercent( referencePatch );
    self.postMessage({ THDPercent });
    //console.log('THD percent time:', performance.now()-t);
}

function doDetailedFFT(sampleRate, patch, filterPreviewSubject) {
    //let t = performance.now();
    var fft = getDetailedFFT( sampleRate, patch, filterPreviewSubject );
    let magnitudes = fft.fft.magnitude;
    let virtualSampleRate = fft.virtualSampleRate;
    self.postMessage({ magnitudes, virtualSampleRate }, [magnitudes.buffer]);
    //console.log('Detailed FFT time:', performance.now()-t);
}

function doPreview(referencePatch, filterPreviewSubject, sampleRate) {
    //let t = performance.now();
    var preview = getPreview( referencePatch, filterPreviewSubject, sampleRate );
    let transferList = [
        preview.fft.magnitude.buffer, 
        preview.fft.phase.buffer,
        preview.samples.buffer,
        preview.magnitude.buffer,
        preview.phase.buffer,
        preview.distortedSamples.buffer
    ];
    if (preview.filter){
        transferList.push(preview.filter.invW0.buffer);
        transferList.push(preview.filter.lut.buffer);
    }
    self.postMessage({ preview }, transferList);
    //console.log('Preview time:', performance.now()-t);
}




function doAudioBuffer(patchesToUse, sampleRate, isStereo, isNormToLoudest) {
    //let t = performance.now();
    let patchList = [patchesToUse.A, patchesToUse.AR, patchesToUse.B, patchesToUse.BR]
    const maxPreDelay = preMaxCalcStartDelay(patchList, sampleRate);

    let bufferA = getAudioBuffer(
        sampleRate, 
        patchesToUse.A,
        isStereo? patchesToUse.AR: null,
        maxPreDelay
    );

    let bufferB = getAudioBuffer(
        sampleRate, 
        patchesToUse.B,
        isStereo? patchesToUse.BR: null,
        maxPreDelay
    );

    let bufferNull = scaleAndGetNullBuffer(bufferA, bufferB, isNormToLoudest, patchList);

    let transferList = [    ];
    getAudioBufferTransferList(transferList, bufferA)
    getAudioBufferTransferList(transferList, bufferB)
    getAudioBufferTransferList(transferList, bufferNull)

    self.postMessage({ bufferA, bufferB, bufferNull }, transferList);
    //console.log('Audio buffer time:', performance.now()-t);
}

function getAudioBufferTransferList(list, buffer){
    if (buffer.buffer){
        buffer.buffer.data.forEach((b)=>list.push(b.buffer));
    }
    if (buffer.filters){
        buffer.filters.forEach((filter)=>
        {
            list.push(filter.invW0.buffer);
            list.push(filter.lut.buffer);
        });
    }
    if (buffer.envelopes){
        buffer.envelopes.forEach((envelope)=>
        {
            list.push(envelope.buffer);
        });
    }   
}





export function thisIsAModule(){}