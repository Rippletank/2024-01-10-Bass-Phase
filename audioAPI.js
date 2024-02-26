//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio API link Code
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
//No knowledge of GUI controls or patch management
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++



import { 
    //Build the actual audio buffer for playback
    preMaxCalcStartDelay,
    getAudioBuffer,     

    //Process buffers
    getBufferMax, 
    scaleBuffer, 
    buildNullTest, 
    
    //Quick preview
    getPreview,

    //More detailed analysis
    getBufferForLongFFT,
    measureTHDPercent, 
    calculateTHDGraph
 } from './audio.js';


import { 
    //Realtime FFT painting
    startFFT,
    fftFade,
    clearFFTFrameCall, getfftFrameCall, 
    getUseFFT,

    //Audio buffer painting
    paintBuffer, paintEnvelope, paintFilterEnvelope, 
    
    //Quick preview painting
    doPreviewPaint,

    //Detailed analysis painting
    paintDetailedFFT, 
    paintTHDGraph
} from './painting.js';

import { getJitterTimeReport } from './jitter.js';
import { getFFT1024 } from './basicFFT.js';
import { getOversamplingReport } from './distortion.js';






let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let audioBufferA = null;
let audioBufferB = null;
let nullTestBuffer = null;
let nullTestMax = 0;

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
function playAudio(index, patchA, patchB, patchAR, patchBR) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    let newSourceNode = audioContext.createBufferSource();
    if (flags.changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay(patchA, patchB, patchAR, patchBR);
    }
    newSourceNode.buffer = index==0 ? audioBufferA.buffer : (index==1 ? audioBufferB.buffer: nullTestBuffer);
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



let longPreview = null;
function updateDetailedFFT(){  
    longPreview = getBufferForLongFFT(audioContext.sampleRate, getPreviewSubjectCachedPatch(), flags.filterPreviewSubject);
    paintDetailedFFT(longPreview.distortedSamples, longPreview.virtualSampleRate, 'staticFFTCanvas');
}
function repaintDetailedFFT(){
    if (!longPreview) 
    {
        updateDetailedFFT()
        return;
    }
    paintDetailedFFT(longPreview.distortedSamples, longPreview.virtualSampleRate, 'staticFFTCanvas');
}


// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
function updateBuffersAndDisplay(patchA, patchB, patchAR, patchBR) {
    flags.changed = false;
    startUpdate();
    setTimeout(function() { //allow for UI to update to indicate busy
    try{
        ensureAudioContext();
        let t0 = performance.now();
    
        updateBuffers(patchA, patchB, patchAR, patchBR);
        updateDisplay();
        fftFade('fftCanvas');
    
        let t1 = performance.now();
        console.log("Execution time: " + (t1 - t0) + " milliseconds.");
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
function updateBuffers(patchA, patchB, patchAR, patchBR) {
    //Inefficient to create two buffers independently - 
    //envelope and all higher harmonics are the same, 
    //but performance is acceptable and code is maintainable  

    let sampleRate = getTrueSampleRate();
    generatedSampleRate = sampleRate;//Store to check later, if flags.changed then regenerate buffers to prevent samplerate conversion artefacts as much as possible
     
    const maxPreDelay = preMaxCalcStartDelay([patchA, patchB, patchAR, patchBR], sampleRate);

    audioBufferA = getAudioBuffer(
        sampleRate, 
        patchA,
        flags.isStereo? patchAR: null,
        maxPreDelay
    );

    audioBufferB = getAudioBuffer(
        sampleRate, 
        patchB,
        flags.isStereo? patchBR: null,
        maxPreDelay
    );

    nullTestBuffer = buildNullTest(audioBufferA.buffer, audioBufferB.buffer);


    let scaleA =0.99 /Math.max(getBufferMax(audioBufferA.buffer), 0.000001);
    let scaleB =0.99 /Math.max(getBufferMax(audioBufferB.buffer), 0.000001);
    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = Math.min(scaleA, scaleB);

    scaleBuffer(audioBufferA.buffer, flags.isNormToLoudest? scale: scaleA);
    scaleBuffer(audioBufferB.buffer, flags.isNormToLoudest? scale: scaleB);

    //normalise null test buffer if above threshold
    let nullMax = getBufferMax(nullTestBuffer);
    nullTestMax = 20 * Math.log10(nullMax);//convert to dB
    if (nullTestMax>-100){//avoid scaling if null test is close to silent (>-100db)
        scaleBuffer(nullTestBuffer, 0.99 / nullMax);
    }
    updateTHDGraph();
}

let THDGraphData = null;
function updateTHDGraph(){
    THDGraphData = calculateTHDGraph(getPreviewSubjectCachedPatch());
}


function updateDisplay(){
    if (!audioBufferA || !audioBufferB || !nullTestBuffer) return;
    let maxLength = Math.max(audioBufferA.buffer.length, audioBufferB.buffer.length, nullTestBuffer.length);
    paintBuffer(audioBufferA.buffer, maxLength, "waveformA");
    paintBuffer(audioBufferB.buffer, maxLength, "waveformB");
    paintBuffer(nullTestBuffer, maxLength, "waveformNull");
    if (flags.showBufferEnvelopeOverlay){    
        paintEnvelope(audioBufferA.envelopes, maxLength, "waveformA");
        paintEnvelope(audioBufferB.envelopes, maxLength, "waveformB");
    }
    if (flags.showBufferFilterOverlay){
        paintFilterEnvelope(audioBufferA.filters, maxLength, "waveformA");
        paintFilterEnvelope(audioBufferB.filters, maxLength, "waveformB");
    }
    paintPreview()
    let nullTest = document.getElementById('nullTestdb');
    nullTest.textContent = "Peak Level: " +nullTestMax.toFixed(1) + "dB";

    
    paintTHDGraph(THDGraphData, 'THDGraphCanvas');
}


let previewResult = null;
let previewTHDReport = 'Distortion is off';
let jitterReport = 'Jitter is off';
let suspendPreviewUpdates = true;
function updatePreview(){
    if (suspendPreviewUpdates) return;
    ensureAudioContext();
    const previewPatch = getPreviewSubjectCachedPatch();
    previewResult = getPreview(previewPatch, flags.filterPreviewSubject, audioContext.sampleRate);
    previewResult.fft = getFFT1024(previewResult.distortedSamples);
    
    previewTHDReport = previewPatch.distortion>0 ? "THD: " + measureTHDPercent(previewPatch).toFixed(3)+"% ["+previewPatchName()+"]" : "Distortion is off";
    jitterReport = 
    previewPatch.jitterADC==0 && previewPatch.jitterDAC==0  && previewPatch.jitterPeriodic==0 ? "Jitter is off" :
    ("Jitter (rms): " +
        "ADC: " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterADC) + ', ' +
        "Periodic : " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterPeriodic) + ', ' +
        "DAC: " + getJitterTimeReport(audioContext.sampleRate, previewPatch.jitterDAC) +
        ", Sample period: " + (1000000/audioContext.sampleRate).toFixed(2) + "µs")
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

let cachedPatches =
{
    Cmn :null,
    A:null,
    AR:null,
    B:null,
    BR:null
}

function getPreviewSubjectCachedPatch() {
    let cachedPatch;
    switch(flags.previewSubject){
        case 0: 
            cachedPatch = cachedPatches.Cmn;
            break;
        case 1: 
            cachedPatch =!flags.isStereo || flags.previewSubjectChannel==0? cachedPatches.A : cachedPatches.AR;
            break;  
        case 2: 
            cachedPatch =  !flags.isStereo || flags.previewSubjectChannel==0? cachedPatches.B : cachedPatches.BR;
            break;  
    }
    return cachedPatch;
}


function paintPreview(){
    if (!previewResult) return;
    doPreviewPaint(
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

    doPreviewPaint(
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

        putOversamplingReport();
    
}

let THDReportElement = document.querySelectorAll('.THDReport');
let oversamplingReportElements = document.querySelectorAll('.oversamplingReport');
let jitterReportElements = document.querySelectorAll('.jitterReport');
function putOversamplingReport(){
    oversamplingReportElements.forEach((element) =>element.textContent = getOversamplingReport());
    THDReportElement.forEach((element) =>element.textContent = previewTHDReport);
    jitterReportElements.forEach((element) =>element.textContent = jitterReport);
}





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setters and getters for export
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function startSuspendPreviewUpdates(){ suspendPreviewUpdates = true;}
function endSuspendPreviewUpdates(){ suspendPreviewUpdates = false;}

function getCachedPatches(){
    return cachedPatches;
}
function getFlags(){
    return flags;
}

export {
    playAudio,
    getTrueSampleRate,

    updateBuffersAndDisplay,
    updateDisplay,
    updatePreview,
    paintPreview,
    
    updateDetailedFFT, 
    repaintDetailedFFT,

    //Common variables
    getCachedPatches,
    getFlags,

    startSuspendPreviewUpdates,
    endSuspendPreviewUpdates
}