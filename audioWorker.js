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



self.onerror = function(error) {
    // Handle any errors that occur in the worker
    console.error(`An error occurred in the worker: ${error.message}`);
};

// If you need to load external scripts, you can do so with importScripts
// importScripts('script1.js', 'script2.js');

self.onmessage = function(event) {
    try {
        switch (event.data.action) {
            case 'getTHDGraph':
                doTHDGraphData(event.data.referencePatch);
                break;
            case 'getTHDPercent':
                doTHDPercent(event.data.referencePatch);
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
    var graphData = getTHDGraph( referencePatch );
    self.postMessage({ graphData },  [graphData.thd.buffer, graphData.frequencies.buffer]);
}

function doTHDPercent(referencePatch) {
    var THDPercent = getTHDPercent( referencePatch );
    self.postMessage({ THDPercent });
}

export function thisIsAModule(){}