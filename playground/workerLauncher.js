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



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//THD Graph worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const THDGraphWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
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
const THDPercentWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
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
const detailedFFTWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
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



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Buffer worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const audioBufferWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
let audioBufferWorkerBusy = false;
audioBufferWorker.onmessage = function(event) {
    const { data } = event;
    audioBufferWorkerBusy = false;    
    if (data.error) {
      console.error(`There was an error calling the Audio Buffer function: ${data.error}`);
    } else
    if (data.type=="ABN") {
        audioBufferCallback(data.bufferA, data.bufferB, data.bufferNull);
    }
    else if (data.type=="Mushra") {
        mushraBufferCallback(data.buffers);
    }
    checkForCachedAudioBuffer();
  }; 
  audioBufferWorker.onerror = function(error) {
    audioBufferWorkerBusy=false;
    console.error(`An error occurred in the Audio Buffer worker: ${error.message}`);
    checkForCachedAudioBuffer()
  }
let audioBufferCallback = (bufferA, bufferB, bufferNull)=>{};
export function setAudioBufferCallback( callback ) {
    audioBufferCallback = callback;
}
let mushraBufferCallback = (buffers)=>{};
export function setMushraBufferCallback( callback ) {
    mushraBufferCallback = callback;
}
let audioBufferCached = null;
export function calculateAudioBuffer( patchesToUse, sampleRate, isStereo, isNormToLoudest, sampleName ) {
    if (audioBufferWorkerBusy){
        audioBufferCached = {patchesToUse, sampleRate, isStereo, isNormToLoudest, sampleName};
        return;
    }
    audioBufferCached=null;
    audioBufferWorkerBusy=true;
    audioBufferWorker.postMessage({
        action: 'getAudioBuffers',
        patchesToUse:patchesToUse,
        sampleRate:sampleRate,
        isStereo:isStereo,
        isNormToLoudest:isNormToLoudest,
        sampleName:sampleName
      });
}

let mushraBufferCached = null;
export function calculateMushraBuffer( patchList, sampleRate, isNormToLoudest ) {
    if (audioBufferWorkerBusy){
        mushraBufferCached = {patchList, sampleRate, isNormToLoudest};
        return;
    }
    mushraBufferCached=null;
    audioBufferWorkerBusy=true;
    audioBufferWorker.postMessage({
        action: 'getMushraBuffers',
        patchList:patchList,
        sampleRate:sampleRate,
        isNormToLoudest:isNormToLoudest
      });
}

function checkForCachedAudioBuffer(){
    if (audioBufferCached){
        calculateAudioBuffer(
            audioBufferCached.patchesToUse, 
            audioBufferCached.sampleRate, 
            audioBufferCached.isStereo,
            audioBufferCached.isNormToLoudest,
            audioBufferCached.sampleName);
    }
    else if (mushraBufferCached){
        calculateMushraBuffer(
            mushraBufferCached.patchList, 
            mushraBufferCached.sampleRate, 
            mushraBufferCached.isNormToLoudest);
    }
}


export function setAudioEngineSampleBuffers(buffers){
    let transferList = [];
    if (buffers) buffers.forEach((buffer)=>transferList.push(buffer.buffer));
    audioBufferWorker.postMessage({
        action: 'setSampleBuffers',
        buffers:buffers
      },
      transferList);
}






//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//preview worker calls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const previewWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
let previewWorkerBusy = false;
previewWorker.onmessage = function(event) {
    const { data } = event;
    previewWorkerBusy = false;    
    if (data.error) {
      console.error(`There was an error calling the Preview function: ${data.error}`);
    } else {
        previewCallback(data.preview);
    }
    checkForCachedPreview();
  }; 
previewWorker.onerror = function(error) {
    previewWorkerBusy=false;
    console.error(`An error occurred in the Preview worker: ${error.message}`);
    checkForCachedPreview()
  }
let previewCallback = (previewData)=>{};
export function setPreviewCallback( callback ) {
    previewCallback = callback;
}
let previewCached = null;
export function calculatePreview( referencePatch, filterPreviewSubject, sampleRate ) {
    if (previewWorkerBusy){
        previewCached = {referencePatch, filterPreviewSubject, sampleRate};
        return;
    }
    previewCached=null;
    previewWorkerBusy=true;
    previewWorker.postMessage({
        action: 'getPreview',
        referencePatch:referencePatch,
        filterPreviewSubject:filterPreviewSubject,
        sampleRate:sampleRate
      });
}
function checkForCachedPreview(){
    if (previewCached){
        calculatePreview(
            previewCached.referencePatch, 
            previewCached.filterPreviewSubject, 
            previewCached.sampleRate);
    }
}



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//digitalPreview worker calls - dither and jitter visualisations
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const digitalPreviewWorker = new Worker('../sharedAudio/audioWorker.js', { type: 'module' });
let digitalPreviewWorkerBusy = false;
digitalPreviewWorker.onmessage = function(event) {
    const { data } = event;
    digitalPreviewWorkerBusy = false;    
    if (data.error) {
      console.error(`There was an error calling the digitalPreview function: ${data.error}`);
    } else {
        digitalPreviewCallback(data.digitalPreview);
    }
    checkForCachedDigitalPreview();
  }; 
digitalPreviewWorker.onerror = function(error) {
    digitalPreviewWorkerBusy=false;
    console.error(`An error occurred in the digitalPreview worker: ${error.message}`);
    checkForCachedDigitalPreview()
  }
let digitalPreviewCallback = (digitalPreviewData)=>{};
export function setDigitalPreviewCallback( callback ) {
    digitalPreviewCallback = callback;
}
let digitalPreviewCached = null;
export function calculateDigitalPreview( referencePatch, sampleRate ) {
    if (digitalPreviewWorkerBusy){
        digitalPreviewCached = {referencePatch, sampleRate};
        return;
    }
    digitalPreviewCached=null;
    digitalPreviewWorkerBusy=true;
    digitalPreviewWorker.postMessage({
        action: 'getDigitalPreview',
        patch:referencePatch,
        sampleRate:sampleRate
      });
}
function checkForCachedDigitalPreview(){
    if (digitalPreviewCached){
        calculateDigitalPreview(
            digitalPreviewCached.referencePatch,digitalPreviewCached.sampleRate);
    }
}


