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
function updatePreview(patch){
    switch(previewSubject){
        case 0: 
            previewResult = getPreview(cachedPatchCmn, filterPreviewSubject);
            break;
        case 1: 
            previewResult = getPreview(cachedPatchA, filterPreviewSubject);
            break;  
        case 2: 
            previewResult = getPreview(cachedPatchB, filterPreviewSubject);
            break;  
    }
    previewResult.fft = getFFT(previewResult.distortedSamples);
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
}


function setValueFromPatch(ve, patch){
    switch (ve.name) {
        case "frequency": 
            ve.textContent = patch.frequency.toFixed(0) + "Hz";
            break;
        case "higherHarmonicRelativeShift": 
            ve.textContent = toPercent(patch.higherHarmonicRelativeShift);
            break;
        case "odd": 
            ve.textContent = getPartialLevelLabel(patch.oddLevel,patch.oddAlt);
            break;
        case "even": 
            ve.textContent = getPartialLevelLabel(patch.evenLevel, patch.evenAlt);
            break;
        case "oddFalloff": 
            ve.innerHTML = toFalloffString(patch.oddFalloff);
            break;
        case "evenFalloff":
            ve.innerHTML = toFalloffString(patch.evenFalloff);
            break;
            break;
        case "altW":
            ve.innerHTML = "Every "+ toReciprocal(patch.altW) +" steps &nbsp; (Duty: " +toPercent(patch.altW)+")";
            break;
        case "altOffset":
            let isInt = Math.round(patch.altOffset) ==patch.altOffset;
            let valText = patch.altOffset.toFixed(1);
            if (isInt){
                switch(patch.altOffset){
                    case -1: valText =valText + ' step &nbsp; Even -↔+ &nbsp; Odd 0↔0';break;
                    case 0: valText =valText +  ' steps &nbsp; Even 0↔0 &nbsp; Odd +↔-';break;
                    case 1: valText = valText + ' step &nbsp; Even +↔- &nbsp; Odd 0↔0';break;
                }
            }
            else{
                valText =valText +' steps &nbsp;&nbsp; both';
            }
            ve.innerHTML = valText;
            break;
        case "sinCos":
            let type = "&nbsp;";
            if (patch.sinCos==0) type = "sin(t)";
            if (patch.sinCos==-1) type = "-cos(t)";
            if (patch.sinCos==1) type = "cos(t)";
            ve.innerHTML = (patch.sinCos*0.5).toFixed(2)+'π &nbsp;&nbsp; '+type;
            break;
        case "balance": 
            if (patch.balance==0) 
            {
                ve.textContent = "-";
            }
            else if (patch.balance==1) 
            {
                ve.textContent = "higher only";
            }
            else if (patch.balance==-1) 
            {
                ve.textContent = "1st only";
            }
            else if (patch.balance>0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "1st "+(-db).toFixed(db<3?2:1 )+"db";                    
            }
            else if (patch.balance<0) 
            {
                let db = patch.balance*patch.balance*75;
                ve.textContent = "high "+(-db).toFixed(db<3?2:1)+"db";                    
            }
            break;
            
        case "attack": ve.textContent = patch.attack + "s";break;  
        case "decay": ve.textContent = patch.decay + "s";break;
        case "hold": ve.textContent = patch.hold + "s";break;
        case "envelopeFilter": 
            if (patch.envelopeFilter==0) 
                {
                    ve.innerHTML = "<b>OFF</b>";
                }
                else
                {
                    ve.textContent = patch.envelopeFilter.toFixed(0);
                }
            break;


        case "attackF": ve.textContent = patch.attackF + "s";break;  
        case "decayF": ve.textContent = patch.decayF + "s";break;
        case "holdF": ve.textContent = patch.holdF + "s";break;
        case "filterF1": ve.textContent = toFilterFreq(patch.filterF1);break;
        case "filterF2": ve.textContent = toFilterFreq(patch.filterF2);break;
        case "filterF3": ve.textContent = toFilterFreq(patch.filterF3);break;
        case "filterSlope": 
        if (patch.filterSlope==0) 
            {
                ve.innerHTML = "<b>OFF</b>";
            }
            else
            {
                ve.textContent = patch.filterSlope.toFixed(0)+"db/oct";
            }
        break;

        case "rootPhaseDelay": 
            ve.innerHTML =getPhaseLabel(patch);break;
        
        case "distortion":
            if (patch.distortion==0)
            {
                ve.innerHTML = "<b>off</b>";
            }
            else
            {
                ve.textContent = toPercent(patch.distortion);
            }
    }
}


function toPercent(value){
    return (value*100).toFixed(0) + "%";
}   
function toReciprocal(value){
    if (value>0.5) return (1/value).toFixed(2);
    if (value>0.01) return (1/value).toFixed(1);
    if (value>0.001) return (1/value).toFixed(0);
    return "∞"
    
}

function toFalloffString(value){
    let result = "";
    if (value==0) result = "1";
    else if (value==1) result = "1/n";
    else result = "1/n<sup>" + value + "</sup>";
    return result;
}

function getPartialLevelLabel(level, polarity){
    level = level ;
    polarity =polarity;
    let value = "off"
    if (level!=0)
    {
        if (polarity==0) 
            value = level.toFixed(1);
        else
            value = level.toFixed(1) +"↔" + (level *(-2 * polarity +1)).toFixed(1);
    }
    return value;
}


function getPhaseLabel(patch){
    let invFreq = 1000 / (patch.frequency * 2);
    let rootPhaseDelay = patch.rootPhaseDelay;
    let delayA = rootPhaseDelay * invFreq;
    return rootPhaseDelay.toFixed(2) + "π <br> (" + (delayA).toFixed(1) + "ms)";
}

function toFilterFreq(x){
    return (20 * Math.pow(2,x)).toFixed(0) + "Hz";
}

