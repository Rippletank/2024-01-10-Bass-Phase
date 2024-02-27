//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Launch webworkers to handle separate threads for calls to the audio.js functions
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






const THDGraphWorker = new Worker('audioWorker.js', { type: 'module' });
THDGraphWorker.onmessage = function(event) {
    const { data } = event;
  
    // Check if there's an error
    if (data.error) {
      console.error(`There was an error calling the THD Graph function: ${data.error}`);
    } else {
        // Handle the result
        THDGraphCallback(data.graphData);
    }
  };   
let THDGraphCallback = (graphData)=>{};
export function setTHDGraphCallback( callback ) {
    THDGraphCallback = callback;
}
export function calculateTHDGraph( referencePatch ) {
    THDGraphWorker.postMessage({
        action: 'getTHDGraph',
        referencePatch: referencePatch,
      });
}








const THDPercentWorker = new Worker('audioWorker.js', { type: 'module' });
THDPercentWorker.onmessage = function(event) {
    const { data } = event;
  
    // Check if there's an error
    if (data.error) {
      console.error(`There was an error calling the THD Percent function: ${data.error}`);
    } else {
        // Handle the result
        THDPercentCallback(data.THDPercent);
    }
  }; 
let THDPercentCallback = (THDPercent)=>{};
export function setTHDPercentCallback( callback ) {
    THDPercentCallback = callback;
}
export function calculateTHDPercent( referencePatch ) {
    THDPercentWorker.postMessage({
        action: 'getTHDPercent',
        referencePatch: referencePatch,
      });
}






let detailedFFTCallback = (fft)=>{};
export function setDetailedFFTCallback( callback ) {
    detailedFFTCallback = callback;
}
export function calculateDetailedFFT( sampleRate, patch, filterPreviewSubject ) {
    detailedFFTCallback( getDetailedFFT( sampleRate, patch, filterPreviewSubject ) );
}
let previewCallback = (previewData)=>{};
export function setPreviewCallback( callback ) {
    previewCallback = callback;
}
export function calculatePreview( referencePatch, filterPreviewSubject, sampleRate ) {
    previewCallback( getPreview( referencePatch, filterPreviewSubject, sampleRate ) );
}

let audioBufferCallback = (bufferA, bufferB, bufferNull)=>{};
export function setAudioBufferCallback( callback ) {
    audioBufferCallback = callback;
}
export function calculateAudioBuffer( patchesToUse, sampleRate, isStereo, isNormToLoudest ) {
    const maxPreDelay = preMaxCalcStartDelay([patchesToUse.A, patchesToUse.B, patchesToUse.AR,patchesToUse.BR], sampleRate);

    let audioBufferA = getAudioBuffer(
        sampleRate, 
        patchesToUse.A,
        isStereo? patchesToUse.AR: null,
        maxPreDelay
    );

    let audioBufferB = getAudioBuffer(
        sampleRate, 
        patchesToUse.B,
        isStereo? patchesToUse.BR: null,
        maxPreDelay
    );

    let nullTestBuffer = scaleAndGetNullBuffer(audioBufferA, audioBufferB, isNormToLoudest);


    audioBufferCallback(  audioBufferA, audioBufferB, nullTestBuffer  );
}