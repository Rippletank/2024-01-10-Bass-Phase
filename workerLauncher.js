//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Launch webworkers to handle audio processing on separate threads
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
    getAudioBuffer, //Two references, one for each sound A & B in  audioAPI.js updateBuffers

    getPreview,  //One reference in audioAPI.js updatePreview

    getDetailedFFT, //one reference in audioAPI.js updateDetailedFFT
    getTHDPercent, //one reference in audioAPI.js updateTHDPercent
    getTHDGraph  //one reference in audioAPI.js updateTHDGraph
}
from './audio.js';










let detailedFFTCallback = (fft)=>{};
export function setDetailedFFTCallback( callback ) {
    detailedFFTCallback = callback;
}
export function calculateDetailedFFT( sampleRate, patch, filterPreviewSubject ) {
    detailedFFTCallback( getDetailedFFT( sampleRate, patch, filterPreviewSubject ) );
}

let THDGraphCallback = (fft)=>{};
export function setTHDGraphCallback( callback ) {
    THDGraphCallback = callback;
}
export function calculateTHDGraph( referencePatch ) {
    THDGraphCallback( getTHDGraph( referencePatch ) );
}

let THDPercentCallback = (fft)=>{};
export function setTHDPercentCallback( callback ) {
    THDPercentCallback = callback;
}
export function calculateTHDPercent( referencePatch ) {
    THDPercentCallback( getTHDPercent( referencePatch ) );
}

let previewCallback = (preview)=>{};
export function setPreviewCallback( callback ) {
    previewCallback = callback;
}
export function calculatePreview( referencePatch, filterPreviewSubject, sampleRate ) {
    previewCallback( getPreview( referencePatch, filterPreviewSubject, sampleRate ) );
}
