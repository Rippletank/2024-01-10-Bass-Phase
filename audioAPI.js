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
    paintPreview()
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
        ctx.lineTo(x, y - b[i] * y);//Minus to ensure positive is up
        x += step;
    }
    ctx.stroke();
}


let previewResult = null;
function updatePreview(patch){
    switch(previewSubject){
        case 0: 
            previewResult = getPreview(cachedPatchCmn);
            break;
        case 1: 
            previewResult = getPreview(cachedPatchA);
            break;  
        case 2: 
            previewResult = getPreview(cachedPatchB);
            break;  
    }
}

let previewSpectrumFullWidth =false;
let previewSpectrumPolarity = true;
let previewSpectrumShowPhase = true;
function paintPreview(){
    if (!previewResult) return;
    let canvas = document.getElementById('wavePreview');
    let ctx = canvas.getContext("2d");
    let w=canvas.width;
    let h=canvas.height;
    ctx.clearRect(0, 0, w, h);

    //Waveform Preview - left side square
    let wpCorner= h/16;
    let wpSize = wpCorner*14;
    ctx.fillStyle = "rgb(240, 240, 240)";
    ctx.fillRect(0, 0, wpSize+wpCorner*2, wpSize+wpCorner*2);  
    ctx.beginPath();    
    let waveScale = 1/Math.max(Math.abs(previewResult.min),Math.abs(previewResult.max));
    //waveForm axis lines
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(wpCorner, wpCorner + 0.5 * wpSize);
    ctx.lineTo(wpCorner + wpSize, wpCorner + 0.5 * wpSize); 
    ctx.moveTo(wpCorner+ 0.5 * wpSize, wpCorner );
    ctx.lineTo(wpCorner + 0.5 * wpSize, wpCorner + wpSize); 
    ctx.stroke();
  
    //Waveform preview
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 0)";
    for(let i=0;i<previewResult.samples.length;i++){
        let x =wpCorner + i * wpSize / previewResult.samples.length;
        let y =wpCorner + (0.5-0.5 * waveScale * previewResult.samples[i]) * wpSize;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();


    //Spectrum Amplitude preview - right side rectangle
    let min = -100/20;//db/20 - optimise out the *20 from the db calculation
    //Spectrum Amplitude preview - right side rectangle
    let spL= wpCorner*3+wpSize;
    let spW = w - spL;
    let spT = 0;
    let spB = h*( previewSpectrumShowPhase ? 0.75: 1);
    let spH = (spB-spT) * (previewSpectrumPolarity ? 0.5 : 1);
    let sp0 = spT+spH;
    let spScale = spH /min;
    let count = previewSpectrumFullWidth ? previewResult.magnitude.length : Math.min(previewResult.magnitude.length/2,50);
    
    //Spectrum Amplitude axis lines
    ctx.beginPath(); 
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(spL, sp0);
    ctx.lineTo(spL + spW, sp0); 
    ctx.moveTo(spL, spT );
    ctx.lineTo(spL , spB); 
    ctx.stroke();


    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 200)";
    for (let i = 0; i < count; i++) {
        let x =spL + i * spW / count;
        let mag = previewResult.magnitude[i];
        let polarity = previewSpectrumPolarity ? Math.sign(mag) : 1;
        let offset = spH - polarity*spH; //either 0 or spH*2 
        let y =spT +offset + polarity * Math.max(min, Math.log10( Math.abs(mag))) * spScale;
        ctx.moveTo(x, sp0);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!previewSpectrumFullWidth)
    {
        //Draw dots to show harmonics on zoomed in view        
        ctx.fillStyle = "rgb(0, 0, 100)";
        for (let i = 0; i < count; i++) {
            let x =spL + i * spW / count;
            ctx.fillRect(x-0.5, sp0-0.5, 1, 1); 
        }
    }

    if (!previewSpectrumShowPhase) return;
    //Spectrum Phase preview - right side rectangle
    let pL= spL;
    let pW = spW;
    let pT = spB + h*0.05;//Small gap between amplitude and phase graphs
    let pB = h;
    let pH =(pB-pT)*0.5;
    let p0 = pT+pH;
    let pScale = pH / Math.PI;
    
    //Spectrum Phase axis lines
    ctx.beginPath(); 
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(pL, p0);
    ctx.lineTo(pL + pW, p0); 
    ctx.moveTo(pL, pT );
    ctx.lineTo(pL , pB); 
    ctx.stroke();


    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(100, 0, 0)";
    //Spectrum preview - right side rectangle
    for (let i = 0; i < count; i++) {
        let x =pL + i * pW / count;
        let phase = -previewResult.phase[i];
        if(!previewSpectrumPolarity) {
            let mag = previewResult.magnitude[i];
            if (mag<0) phase+=Math.PI;
        }
        //Scale to +/- PI
        let nos2Pis = phase/(2*Math.PI);
        phase -= Math.floor(nos2Pis)*2*Math.PI; //Floor works for negative numbers too (floor(-1.5)=-2)
        if (phase>=Math.PI) phase-=2*Math.PI;
        let y =p0 + phase * pScale;
        ctx.moveTo(x, p0);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!previewSpectrumFullWidth)
    {
        //Draw dots to show harmonics on zoomed in view        
        ctx.fillStyle = "rgb(50, 0, 0)";
        for (let i = 0; i < count; i++) {
            let x =pL + i * pW / count;
            ctx.fillRect(x-0.5, p0-0.5, 1, 1); 
        }
    }


}