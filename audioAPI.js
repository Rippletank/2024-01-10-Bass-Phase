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
function playAudio(index, patchA, patchB) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    let newSourceNode = audioContext.createBufferSource();
    if (changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay(patchA, patchB);
    }
    newSourceNode.buffer = index==0 ? audioBufferA.buffer : (index==1 ? audioBufferB.buffer: nullTestBuffer);
    if (useFFT){
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
        cancelAnimationFrame(fftFrameCall);
        fftFrameCall = null;
        fftClear('fftCanvas');
    }
}


let longPreview = null;
function updateDetailedFFT(){  
    longPreview = getBufferForLongFFT(audioContext.sampleRate, getPreviewSubjectCachedPatch());
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


let isStereo = false;
let changed = true;
// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
function updateBuffersAndDisplay(patchA, patchB) {
    changed = false;
    startUpdate();
    setTimeout(function() { //allow for UI to update to indicate busy
    try{
        ensureAudioContext();
        let t0 = performance.now();
    
        updateBuffers(patchA, patchB);
        updateDisplay();
        fftClear('fftCanvas');
    
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



function updateBuffers(patchA, patchB) {
    //Inefficient to create two buffers independently - 
    //envelope and all higher harmonics are the same, 
    //but performance is acceptable and code is maintainable  

    let sampleRate = audioContext ? audioContext.sampleRate: 44100;
    generatedSampleRate = sampleRate;//Store to check later, if changed then regenerate buffers to prevent samplerate conversion artefacts as much as possible
     
    audioBufferA = getAudioBuffer(
        sampleRate, 
        patchA
    );

    audioBufferB = getAudioBuffer(
        sampleRate, 
        patchB
    );

    nullTestBuffer = buildNullTest(audioBufferA.buffer, audioBufferB.buffer);


    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = 0.99 / Math.max(getBufferMax(audioBufferA.buffer), getBufferMax(audioBufferB.buffer));

    scaleBuffer(audioBufferA.buffer, scale);
    scaleBuffer(audioBufferB.buffer, scale);

    //normalise null test buffer if above threshold
    let nullMax = getBufferMax(nullTestBuffer);
    nullTestMax = 20 * Math.log10(nullMax);//convert to dB
    if (nullTestMax>-100){//avoid scaling if null test is close to silent (>-100db)
        scaleBuffer(nullTestBuffer, 0.99 / nullMax);
    }
}




let showBufferEnvelopeOverlay=false;
let showBufferFilterOverlay=false;
function updateDisplay(){
    if (!audioBufferA || !audioBufferB || !nullTestBuffer) return;
    let maxLength = Math.max(audioBufferA.buffer.length, audioBufferB.buffer.length, nullTestBuffer.length);
    paintBuffer(audioBufferA.buffer, maxLength, "waveformA");
    paintBuffer(audioBufferB.buffer, maxLength, "waveformB");
    paintBuffer(nullTestBuffer, maxLength, "waveformNull");
    if (showBufferEnvelopeOverlay){    
        paintEnvelope(audioBufferA.envelope, maxLength, "waveformA");
        paintEnvelope(audioBufferB.envelope, maxLength, "waveformB");
    }
    if (showBufferFilterOverlay){
        paintFilterEnvelope(audioBufferA.filter, maxLength, "waveformA");
        paintFilterEnvelope(audioBufferB.filter, maxLength, "waveformB");
    }
    paintPreview()
    let nullTest = document.getElementById('nullTestdb');
    nullTest.textContent = " - Peak:" +nullTestMax.toFixed(1) + "dB";
}


let previewResult = null;
let filterPreviewSubject =0;
function updatePreview(){
    previewResult = getPreview(getPreviewSubjectCachedPatch(), filterPreviewSubject);
    previewResult.fft = getFFT1024(previewResult.distortedSamples);
}

function getPreviewSubjectCachedPatch() {
    let cachedPatch;
    switch(previewSubject){
        case 0: 
            cachedPatch = cachedPatchCmn;
            break;
        case 1: 
            cachedPatch = cachedPatchA;
            break;  
        case 2: 
            cachedPatch = cachedPatchB;
            break;  
    }
    return cachedPatch;
}


let previewSpectrumFullWidth =false;
let previewSpectrumPolarity = true;
let previewSpectrumShowPhase = true;
let distortionSpectrumFullWidth =false;
let distortionSpectrumPolarity = true;
let distortionSpectrumShowPhase = true;
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
        previewSpectrumFullWidth,
        previewSpectrumPolarity,
        previewSpectrumShowPhase);

    doPreviewPaint(
        'distortionPreview',
        previewResult.distortedSamples,
        previewResult.fft.magnitude,
        previewResult.fft.phase,
        previewResult.filter,
        previewResult.patch,
        previewResult.min,
        previewResult.max,
        distortionSpectrumFullWidth,
        distortionSpectrumPolarity,
        distortionSpectrumShowPhase);

        putOversamplingReport();
}

let oversamplingReportElements = document.querySelectorAll('.oversamplingReport');
function putOversamplingReport(){
    oversamplingReportElements.forEach((element) =>element.textContent = oversamplingReport);
}

