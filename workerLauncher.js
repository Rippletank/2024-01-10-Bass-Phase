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



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//THD Graph worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const THDGraphWorker = new Worker('audioWorker.js', { type: 'module' });
let THDGraphWorkerBusy = false;
THDGraphWorker.onmessage = function(event) {
    const { data } = event;
    THDGraphWorkerBusy = false;
  
    if (data.error) {
      console.error(`There was an error calling the THD Graph function: ${data.error}`);
    } else {
        THDGraphCallback(data.graphData);
    }
    checkForCachedTHDGraph()
  };  
THDGraphWorker.onerror = function(error) {
    THDGraphWorkerBusy = false;
    console.error(`An error occurred in the THD Graph worker: ${error.message}`);
    checkForCachedTHDGraph();
  } 
let THDGraphCallback = (graphData)=>{};
export function setTHDGraphCallback( callback ) {
    THDGraphCallback = callback;
}
let THDGraphCachedPatch = null;
export function calculateTHDGraph( referencePatch ) {
    if (THDGraphWorkerBusy){
        THDGraphCachedPatch = referencePatch;
        return;
    }
    THDGraphCachedPatch=null;
    THDGraphWorkerBusy = true;
    THDGraphWorker.postMessage({
        action: 'getTHDGraph',
        referencePatch: referencePatch,
      });
}
function checkForCachedTHDGraph(){
    if (THDGraphCachedPatch){
        calculateTHDGraph(THDGraphCachedPatch);
    }
}





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//THD Percent worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const THDPercentWorker = new Worker('audioWorker.js', { type: 'module' });
let THDPercentWorkerBusy = false;
THDPercentWorker.onmessage = function(event) {
    THDPercentWorkerBusy=false;
    const { data } = event;
    if (data.error) {
      console.error(`There was an error calling the THD Percent function: ${data.error}`);
    } else {
        THDPercentCallback(data.THDPercent);
    }    
    checkForCachedTHDPercent()
  }; 
THDPercentWorker.onerror = function(error) {
    THDPercentWorkerBusy=false;
    console.error(`An error occurred in the THD Percent worker: ${error.message}`);
    checkForCachedTHDPercent()
}
let THDPercentCallback = (THDPercent)=>{};
export function setTHDPercentCallback( callback ) {
    THDPercentCallback = callback;
}
let THDPercentCachedPatch = null;
export function calculateTHDPercent( referencePatch ) {
    if (THDPercentWorkerBusy){
        THDPercentCachedPatch = referencePatch;
        return;
    }
    THDPercentCachedPatch=null;
    THDPercentWorkerBusy=true;
    THDPercentWorker.postMessage({
        action: 'getTHDPercent',
        referencePatch: referencePatch,
      });
}
function checkForCachedTHDPercent(){
    if (THDPercentCachedPatch){
        calculateTHDPercent(THDPercentCachedPatch);
    }
}





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Detailed FFT worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const detailedFFTWorker = new Worker('audioWorker.js', { type: 'module' });
let detailedFFTWorkerBusy = false;
detailedFFTWorker.onmessage = function(event) {
    const { data } = event;
    detailedFFTWorkerBusy = false;    
    if (data.error) {
      console.error(`There was an error calling the detailed FFT function: ${data.error}`);
    } else {
        detailedFFTCallback(data);
    }
    checkForCachedDetailedFFT();
  }; 
detailedFFTWorker.onerror = function(error) {
    detailedFFTWorkerBusy=false;
      console.error(`An error occurred in the detailed FFT worker: ${error.message}`);
      checkForCachedDetailedFFT()
  }
let detailedFFTCallback = (data)=>{};
export function setDetailedFFTCallback( callback ) {
    detailedFFTCallback = callback;
}
let detailedFFTCached = null;
export function calculateDetailedFFT( sampleRate, patch, filterPreviewSubject ) {
    if (detailedFFTWorkerBusy){
        detailedFFTCached = {sampleRate, patch, filterPreviewSubject};
        return;
    }
    detailedFFTCached=null;
    detailedFFTWorkerBusy=true;
    detailedFFTWorker.postMessage({
        action: 'getDetailedFFT',
        sampleRate: sampleRate,
        patch: patch,
        filterPreviewSubject: filterPreviewSubject
      });
}
function checkForCachedDetailedFFT(){
    if (THDPercentCachedPatch){
        calculateDetailedFFT(
            detailedFFTCached.SampleRate, 
            detailedFFTCached.Patch, 
            detailedFFTCached.FilterPreviewSubject);
    }
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