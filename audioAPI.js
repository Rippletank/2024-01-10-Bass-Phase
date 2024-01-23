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
//Audio/WebAudioAPI linking code knows 
//about Audio API and Audio.js and can access canvas element by ID to draw FTT etc
//No knowledge of GUI controls or patch management
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let audioContext = null;
let sourceNode = null;
let analyserNode = null;
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
    newSourceNode.buffer = index==0 ? audioBufferA : (index==1 ? audioBufferB: nullTestBuffer);
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
            stop();
        }   
    }
    sourceNode = newSourceNode;
    newSourceNode.start(0);
    startFFT();
}

function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
        cancelAnimationFrame(fftFrameCall);
        fftFrameCall = null;
        fftClear();
    }
}

let useFFT = true;

function fftClear(){
    let canvas = document.getElementById('fftCanvas');
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "rgb(240, 240, 240)";
    ctx.fillRect(0, 0, w, h);  
}



let fftFrameCall = null;
const fftStartF = 20;
const fftEndF = 20000;
function startFFT(){
    if (fftFrameCall) return;
    if (!useFFT) {
        fftClear();
        return;
    }
    let canvas = document.getElementById('fftCanvas');
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const bufferLength = analyserNode.fftSize;
    const maxLogF = Math.log2(fftEndF-fftStartF);
    const octaveStep = maxLogF / w;
    const freqStep = bufferLength / audioContext.sampleRate;
    const hScale = h / 256;
    const fft = new Uint8Array(bufferLength);
    const bins = new Uint8Array(w);
    const fftDraw =()=>{
        fftFrameCall = requestAnimationFrame(fftDraw);
        analyserNode.getByteFrequencyData(fft);  
        ctx.fillStyle = "rgb(240, 240, 240)";
        ctx.fillRect(0, 0, w, h);        
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgb(0, 0, 0)";
        ctx.beginPath();

        let startBin = 0;
        for (let i = 0; i < w; i++) {
            let endOctave = (i+1) * octaveStep;
            let endBin = Math.round((fftStartF + Math.pow(2,endOctave))  * freqStep );
            if (endBin>startBin){
                let max = 0;
                for (let j = startBin; j < endBin; j++) {
                    max = Math.max(max,fft[j]);
                }
                let y = h - max * hScale;
                if (i === 0) {
                    ctx.moveTo(i, y);
                } else {
                    ctx.lineTo(i, y);
                }
                startBin = endBin;
            }
        }
        ctx.stroke();
    }
    fftDraw();
}

   
let changed = true;
// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
function updateBuffersAndDisplay(patchA, patchB) {
    changed = false;
    ensureAudioContext();
    let t0 = performance.now();

    updateBuffers(patchA, patchB);
    updateDisplay();
    fftClear();

    let t1 = performance.now();
    console.log("Execution time: " + (t1 - t0) + " milliseconds.");
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

    nullTestBuffer = buildNullTest(audioBufferA, audioBufferB);


    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = 0.99 / Math.max(getBufferMax(audioBufferA), getBufferMax(audioBufferB));

    scaleBuffer(audioBufferA, scale);
    scaleBuffer(audioBufferB, scale);

    //normalise null test buffer if above threshold
    let nullMax = getBufferMax(nullTestBuffer);
    nullTestMax = 20 * Math.log10(nullMax);//convert to dB
    if (nullTestMax>-100){//avoid scaling if null test is close to silent (>-100db)
        scaleBuffer(nullTestBuffer, 0.99 / nullMax);
    }
}




function updateDisplay(){
    if (!audioBufferA || !audioBufferB || !nullTestBuffer) return;
    let maxLength = Math.max(audioBufferA.length, audioBufferB.length, nullTestBuffer.length);
    paintBuffer(audioBufferA, maxLength, "waveformA");
    paintBuffer(audioBufferB, maxLength, "waveformB");
    paintBuffer(nullTestBuffer, maxLength, "waveformNull");
    let nullTest = document.getElementById('nullTestdb');
    nullTest.textContent = " - Peak:" +nullTestMax.toFixed(1) + "dB";
}


function paintBuffer(buffer, maxLength, canvasId){
    let b = buffer.getChannelData(0);
    let bufferSize = buffer.length;

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    let x = 0;
    let y = canvas.height/2;
    let step = canvas.width / maxLength;

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        ctx.lineTo(x, y + b[i] * y);
        x += step;
    }
    ctx.stroke();
}