//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Links the Web Audio API, the Audio engine and getting anaylsis ready for drawing of waveforms, FFTs etc
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
//Audio/WebAudioAPI linking code  
//knows about Audio API, Audio.js and defaults.js. Calls painting.js for canvas rendering
//No knowledge of GUI controls or patch management other than names of canvas elements for requesting analysis painting 
//and names of certain div elements for inserting text reports
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++



 import {
    setDetailedFFTCallback,
    calculateDetailedFFT,

    setTHDGraphCallback,
    calculateTHDGraph,

    setTHDPercentCallback,
    calculateTHDPercent,

    setPreviewCallback,
    calculatePreview,

    setAudioBufferCallback,
    calculateAudioBuffer
 } from './workerLauncher.js'




import { 
    //Realtime FFT painting
    startFFT,
    getUseFFT,
    fftFade,
    clearFFTFrameCall, getfftFrameCall, 

    //Audio buffer painting
    paintBuffer, paintEnvelope, paintFilterEnvelope, 
    
    paintPreview,
    paintDetailedFFT, 
    paintTHDGraph
} from './painting.js';

import { getJitterFactor } from './jitter.js';


let flags = {
    //Global changed flag
    changed: true,   

    //Audio buffers
    isNormToLoudest: true,
    isStereo: false,
    
    filterPreviewSubject: 0,
    previewSubject: 0,
    previewSubjectChannel: 0,   
    
    //preview spectrums - additive section
    previewSpectrumFullWidth :false,
    previewSpectrumPolarity : true,
    previewSpectrumShowPhase : true,

    //preview spectrums - distortion section
    distortionSpectrumFullWidth :false,
    distortionSpectrumPolarity : true,
    distortionSpectrumShowPhase : true,

    
    showBufferEnvelopeOverlay:false,
    showBufferFilterOverlay:false,
 };



//web audio api objects
let audioContext = null;
let analyserNode = null;
let sourceNode = null;

//internal buffer objects - returned from audio.js
let audioBufferA = null;
let audioBufferB = null;
let nullTestBuffer = null;

function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
        analyserNode.fftSize = 4096*8;
        analyserNode.smoothingTimeConstant = 0.0;
        analyserNode.minDecibels = -90;
        analyserNode.maxDecibels = 0;
    }
}


// Play method, index 0 = A, 1 = B
function playAudio(index) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    if (flags.changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay(index);
        return;
    }
    let newSourceNode = audioContext.createBufferSource();
    newSourceNode.buffer = checkForAudioBuffer(pickPlaybackBuffer(index));
    if (getUseFFT()){
        newSourceNode.connect(analyserNode);
        analyserNode.connect(audioContext.destination);
    }
    else{
        newSourceNode.connect(audioContext.destination);
        analyserNode.disconnect();
    }
    newSourceNode.onended = ()=>{
        if (newSourceNode==sourceNode)
        {
            //delay stop to allow fft to finish decay
            setInterval(function() {
                if (newSourceNode==sourceNode) {
                    stop();
                }
            }, 500); 
            
        }   
    }
    sourceNode = newSourceNode;
    newSourceNode.start(0);
    startFFT(audioContext,analyserNode, 'fftCanvas');
}

function pickPlaybackBuffer(index){
    switch(index){
        case 0: return audioBufferA;
        case 1: return audioBufferB;
        default: return nullTestBuffer;
    }
}

function checkForAudioBuffer(audioBuffer){
    if (!audioBuffer.apiBuffer)
    {
        audioBuffer.apiBuffer = new AudioBuffer({
            length: audioBuffer.buffer.length,
            numberOfChannels: audioBuffer.buffer.numberOfChannels,
            sampleRate: audioBuffer.buffer.sampleRate
        });
        for (let i = 0; i < audioBuffer.buffer.numberOfChannels; i++) {
            audioBuffer.apiBuffer.copyToChannel(audioBuffer.buffer.data[i], i);
        }
    }
    return audioBuffer.apiBuffer;
}


function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
        cancelAnimationFrame(getfftFrameCall());
        clearFFTFrameCall();
        fftFade('fftCanvas');
    }
}

function getTrueSampleRate(){
    return audioContext ? audioContext.sampleRate: 44100;
}





let longPreview = null;
let longPreviewPatchVersion = 0;
function updateDetailedFFT(){  
    //check versions to see if already processing
    let patchesToUse =cachedPatches;//Thread safe
    let newVersion = patchesToUse.version ?? 0; 
    if (longPreviewPatchVersion == newVersion)return;
    longPreviewPatchVersion = newVersion;

    let patch =getPreviewSubjectCachedPatch(patchesToUse);
    calculateDetailedFFT(audioContext.sampleRate, patch, flags.filterPreviewSubject);
}
setDetailedFFTCallback((preview)=>{
    longPreview = preview; 
    doPaintDetailedFFT();
});

function repaintDetailedFFT(){
    if (!longPreview) 
    {
        updateDetailedFFT()
        return;
    }
    doPaintDetailedFFT();
}
function doPaintDetailedFFT(){
    //Assumes longPreview is in place and up to date
    let previewToUse = longPreview; //Threadsafety
    paintDetailedFFT(previewToUse.fft,  previewToUse.distortedSamples.length, previewToUse.virtualSampleRate, 'staticFFTCanvas');
}


// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
let buffersPatchVersion = 0;
function updateBuffersAndDisplay(indexToPlayWhenDone = -1) {
    flags.changed = false;
    
    //Avoid duplicated processing - check if this version has already been processed
    let patchesToUse =cachedPatches;//Thread safe
    if (buffersPatchVersion == patchesToUse.version) return;
    buffersPatchVersion = patchesToUse.version;


    ensureAudioContext();
    startUpdate();
    setTimeout(function() { //allow for UI to update to indicate busy
    try{
        // let t0 = performance.now();
        updateBuffers(patchesToUse);
        updateDisplay();
        updateTHDGraph(patchesToUse); 
        fftFade('fftCanvas'); 
        if (indexToPlayWhenDone>=0) playAudio(indexToPlayWhenDone);

        // let t1 = performance.now();
        // console.log("Execution time: " + (t1 - t0) + " milliseconds.");
    }
    finally{
        endUpdate();
    }},0);  
}

let fullwaves = document.querySelectorAll('.fullwave');
function startUpdate() {
    fullwaves.forEach(canvas => {
        canvas.classList.add('blur');
    });
}
function endUpdate() {
    fullwaves.forEach(canvas => {
        canvas.classList.remove('blur');
    });
}





let generatedSampleRate = 0;//Sample rate used to generate current buffers
function updateBuffers(patchesToUse) {
    //Inefficient to create two buffers independently - 
    //envelope and all higher harmonics are the same, 
    //but performance is acceptable and code is maintainable  
    let sampleRate = getTrueSampleRate();
    generatedSampleRate = sampleRate;//Store to check later, if flags.changed then regenerate buffers to prevent samplerate conversion artefacts as much as possible
     

    calculateAudioBuffer( patchesToUse, sampleRate, flags.isStereo, flags.isNormToLoudest );
}

setAudioBufferCallback((bufferA, bufferB, bufferNull)=>{
    audioBufferA = bufferA;
    audioBufferB = bufferB;
    nullTestBuffer = bufferNull;
    doPaintBuffersAndNull();
});





function doPaintBuffersAndNull(){
    if (!audioBufferA || !audioBufferB || !nullTestBuffer) return;
    let maxLength = Math.max(audioBufferA.buffer.length, audioBufferB.buffer.length, nullTestBuffer.buffer.length);
    paintBuffer(audioBufferA.buffer, maxLength, "waveformA");
    paintBuffer(audioBufferB.buffer, maxLength, "waveformB");
    paintBuffer(nullTestBuffer.buffer, maxLength, "waveformNull");
    if (flags.showBufferEnvelopeOverlay){    
        paintEnvelope(audioBufferA.envelopes, maxLength, "waveformA");
        paintEnvelope(audioBufferB.envelopes, maxLength, "waveformB");
    }
    if (flags.showBufferFilterOverlay){
        paintFilterEnvelope(audioBufferA.filters, maxLength, "waveformA");
        paintFilterEnvelope(audioBufferB.filters, maxLength, "waveformB");
    }


    let nullTest = document.getElementById('nullTestdb');
    nullTest.textContent = "Peak Level: " + nullTestBuffer.maxValueDBL.toFixed(1) + "dB";
}

let THDGraphData = null;
function updateTHDGraph(patchesToUse){
    let patch =getPreviewSubjectCachedPatch(patchesToUse);
    calculateTHDGraph(patch);
}
setTHDGraphCallback((graphData)=>{
    THDGraphData = graphData; 
    doPaintTHDGraph();
});
function doPaintTHDGraph(){
    if (!THDGraphData) return;
    paintTHDGraph(THDGraphData, 'THDGraphCanvas');
}


function updateDisplay(){
    doPaintBuffersAndNull();    
    doPaintPreview();
    doPaintTHDGraph();
}



let jitterReport = 'Jitter is off';
let suspendPreviewUpdates = true;
let previewPatchVersion = 0;
function updatePreview(){
    if (suspendPreviewUpdates) return;

    //Avoid duplicated processing - check if this version has already been previewed
    let patchesToUse =cachedPatches;//Thread safe
    const newVersion = patchesToUse.version ?? 0;
    if (previewPatchVersion == newVersion)return;
    previewPatchVersion = newVersion;

    ensureAudioContext();

    const previewPatch = getPreviewSubjectCachedPatch(patchesToUse);

    calculatePreview(previewPatch, flags.filterPreviewSubject, audioContext.sampleRate);        
    getTHDReport(previewPatch);
    jitterReport = 
                    previewPatch.jitterADC==0 && previewPatch.jitterDAC==0  && previewPatch.jitterPeriodic==0 ? "Jitter is off" :
                    ("Jitter (rms): " +
                        "ADC: " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterADC) + ', ' +
                        "Periodic : " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterPeriodic) + ', ' +
                        "DAC: " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterDAC) +
                        ", Sample period: " + (1000000/audioContext.sampleRate).toFixed(2) + "µs")
}


let previewResult = null;
setPreviewCallback((preview)=>{
    previewResult = preview; 
    doPaintPreview();
});



let previewTHDReport = 'Distortion is off';
function getTHDReport(patch){
    if (patch.distortion==0)
    {
        previewTHDReport = "Distortion is off";
        updateTHDMeasurementReport();
    }
    else
    {
        calculateTHDPercent(patch);
    }
}
setTHDPercentCallback((THDPercent)=>{
    previewTHDReport = "THD: " + THDPercent.toFixed(3)+"% ["+previewPatchName()+"]"; 
    updateTHDMeasurementReport();
});



function getJitterTimeReport(sampleRate, amount){
    return (getJitterFactor() * Math.sqrt(2) * amount * 1000000 / sampleRate).toFixed(2)+"µs "; //root 2 for standard deviation to rms
}


let cachedPatches =
{
    Cmn :null,
    A:null,
    AR:null,
    B:null,
    BR:null,
    version:0
}
function getCachedPatches(){
    return cachedPatches;
}
let cachedPatchVersion =0;
function setCachedPatches(newCachedPatches){
    newCachedPatches.version = ++cachedPatchVersion
    cachedPatches = newCachedPatches;
}
function forceBufferRegeneration(){
    cachedPatches.version = ++cachedPatchVersion
}

function previewPatchName(){
    switch(flags.previewSubject){
        case 0: 
            return "Common";
            break;
        case 1: 
            return "Sound "+(!flags.isStereo? "A" : (flags.previewSubjectChannel==0? "A-L" : "A-R"));
            break;  
        case 2: 
            return "Sound "+(!flags.isStereo? "B" : (flags.previewSubjectChannel==0? "B-L" : "B-R"));
            break;  
    }
    return cachedPatch;
}


function getPreviewSubjectCachedPatch(patchesToUse) {
    let cachedPatch;
    switch(flags.previewSubject){
        case 0: 
            cachedPatch = patchesToUse.Cmn;
            break;
        case 1: 
            cachedPatch =!flags.isStereo || flags.previewSubjectChannel==0? patchesToUse.A : patchesToUse.AR;
            break;  
        case 2: 
            cachedPatch =  !flags.isStereo || flags.previewSubjectChannel==0? patchesToUse.B : patchesToUse.BR;
            break;  
    }
    return cachedPatch;
}


function doPaintPreview(){
    if (!previewResult) return;
    paintPreview(
        'wavePreview',
        previewResult.samples,
        previewResult.magnitude,
        previewResult.phase,
        previewResult.filter,
        previewResult.patch,
        previewResult.min,
        previewResult.max,
        flags.previewSpectrumFullWidth,
        flags.previewSpectrumPolarity,
        flags.previewSpectrumShowPhase,
        flags.filterPreviewSubject);

    paintPreview(
        'distortionPreview',
        previewResult.distortedSamples,
        previewResult.fft.magnitude,
        previewResult.fft.phase,
        previewResult.filter,
        previewResult.patch,
        previewResult.min,
        previewResult.max,
        flags.distortionSpectrumFullWidth,
        flags.distortionSpectrumPolarity,
        flags.distortionSpectrumShowPhase,
        flags.filterPreviewSubject);

        updateMeasurementReports();
    
}

let THDReportElement = document.querySelectorAll('.THDReport');
let oversamplingReportElements = document.querySelectorAll('.oversamplingReport');
let jitterReportElements = document.querySelectorAll('.jitterReport');
function updateMeasurementReports(){
    if (audioBufferA && audioBufferB) 
    {
        let oversamplingReports = compareStringArrays(audioBufferA.oversamplingReports, audioBufferB.oversamplingReports);
        let oversamplingReport = "<p>No oversampling</p>";
        if (oversamplingReports.length==1){
            oversamplingReport = "<p>"+oversamplingReports[0] + "</p>";
        }
        else if (flags.isStereo && oversamplingReports.length==4){
            oversamplingReport = "<p>A Left: "+oversamplingReports[0] + "</p><p> A Right:"+oversamplingReports[1] + "</p>"
                                + "<p>B Left: "+oversamplingReports[1] + "</p><p> B Right:"+oversamplingReports[2] + "</p>";
        }
        else if (!flags.isStereo && oversamplingReports.length==2){
            oversamplingReport = "<p>A: "+oversamplingReports[0]
                                + "<p>B: "+oversamplingReports[1] ;
        }

        oversamplingReportElements.forEach((element) =>element.innerHTML = oversamplingReport);
    }

    updateTHDMeasurementReport();
    jitterReportElements.forEach((element) =>element.textContent = jitterReport);
}

function updateTHDMeasurementReport(){
    THDReportElement.forEach((element) =>element.textContent = previewTHDReport);
}

function compareStringArrays(array1, array2) {
    const allStringsSame = array1.every((value, index) => value === array2[index]) 
                            && array2.every((value, index) => value === array1[index]);

    return allStringsSame ? [array1[0]] : [...array1, ...array2];
}




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Buffer manipulation
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getBufferMax(buffer){
    let max = 0;
    for(let chan=0;chan<buffer.numberOfChannels;chan++){
        let b = buffer.data[chan];
        let bufferSize = b.length;
        for (let i = 0; i < bufferSize; i++) {
            let val = Math.abs( b[i]);
            if (val>max) max = val;
        }
    }
    return max;
}






//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setters and getters for export
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function startSuspendPreviewUpdates(){ suspendPreviewUpdates = true;}
function endSuspendPreviewUpdates(){ suspendPreviewUpdates = false;}


function getFlags(){
    return flags;
}

export {
    playAudio,
    getTrueSampleRate,

    updateBuffersAndDisplay,
    updateDisplay,
    updatePreview,
    doPaintPreview,
    
    updateDetailedFFT, 
    repaintDetailedFFT,

    getCachedPatches,
    setCachedPatches,
    forceBufferRegeneration,

    //Common variables
    getFlags,

    startSuspendPreviewUpdates,
    endSuspendPreviewUpdates
}