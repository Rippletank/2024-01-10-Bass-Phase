
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code
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
//GUI/Audio/WebAudioAPI linking code knows about each area of concern
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
function play(index) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    let newSourceNode = audioContext.createBufferSource();
    if (changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay();
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

   
// Main update method - orchestrates the creation of the buffers and their display
//Called at startup and whenever a parameter changes
function updateBuffersAndDisplay() {
    changed = false;
    ensureAudioContext();
    let t0 = performance.now();

    updateBuffers();
    updateDisplay();

    let t1 = performance.now();
    console.log("Execution time: " + (t1 - t0) + " milliseconds.");
}



function updateBuffers() {
    //Collect parameters from GUI
    let freq = parseFloat(document.getElementById('freq').value); //frequency
    let higherShift = parseFloat(document.getElementById('second').value); //SecondHarmonicRelativePhaseDelay
    let odd = parseFloat(document.getElementById('odd').value); //odd harmonic level
    let oddAlt = parseFloat(document.getElementById('oddAlternating').value); //odd harmonic level
    let oddFalloff = parseFloat(document.getElementById('oddFalloff').value); //odd harmonic level
    let even = parseFloat(document.getElementById('even').value); //even harmonic level
    let evenAlt = parseFloat(document.getElementById('evenAlternating').value); //even harmonic level
    let evenFalloff = parseFloat(document.getElementById('evenFalloff').value); //even harmonic level
    let attack = parseFloat(document.getElementById('attack').value); //attack time 
    let hold = parseFloat(document.getElementById('hold').value); //decay time
    let decay = parseFloat(document.getElementById('decay').value); //decay time
    let envelopeFilter = parseFloat(document.getElementById('envelopeFilter').value); //decay time
    let rootPhaseDelayA = parseFloat(document.getElementById('rootPhaseDelayA').value); //rootPhaseDelayA
    let rootPhaseDelayB = parseFloat(document.getElementById('rootPhaseDelayB').value); //rootPhaseDelayB
    let sampleRate = audioContext ? audioContext.sampleRate: 44100;
    generatedSampleRate = sampleRate;//Store to check later, if changed then regenerate buffers to prevent samplerate conversion artefacts as much as possible
    //Create buffers
    //Inefficient to create two buffers independently - envelope and all higher harmonics are the same, but performance is acceptable and code is maintainable
    audioBufferA = getAudioBuffer(
        sampleRate, freq,
        rootPhaseDelayA,
        higherShift, odd, oddAlt, oddFalloff, even, evenAlt, evenFalloff, attack, hold, decay, envelopeFilter,
        envMode
    );

    audioBufferB = getAudioBuffer(
        sampleRate, freq,
        rootPhaseDelayB,
        higherShift, odd, oddAlt, oddFalloff, even, evenAlt, evenFalloff, attack, hold, decay, envelopeFilter,
        envMode
    );

    nullTestBuffer = buildNullTest(audioBufferA, audioBufferB);


    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = 0.99 / Math.max(getBufferMax(audioBufferA), getBufferMax(audioBufferB));

    scaleBuffer(audioBufferA, scale);
    scaleBuffer(audioBufferB, scale);

    //normalise null test buffer if 
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

 



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code - creates buffers with audio data according to parameters
//No knowledge of GUI, only knows about AudioBuffer from WebAudioAPI
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let harmonics = 1000;//Allows 20Hz to have harmonics up to 20KHz??
let decayLengthFactor = 1.4;//Decay length ( in samples) is 1.4 times longer than the -60db decay time - allows for longer tail than RT60 alone
let generatedSampleRate = 0;//Sample rate used to generate current buffers
// Update method to create a buffer
function getAudioBuffer(
    sampleRate, //samples per second
    frequency, //Hz
    rootPhaseDelay, //-1..1 => -PI..PI for phase of fundamental
    higherHarmonicRelativeShift, //fraction of rootPhaseDelay for phase of second harmonic
    oddLevel, //0..1
    oddAlt, //-1,0,1
    oddFalloff,//0..2 0 = no falloff, 1 = 1/n amplitude, 2 = 1/n^2 amplitude 
    evenLevel, //0..1
    evenAlt, //-1,0,1
    evenFalloff,//0..2 0 = no falloff, 1 = 1/n amplitude, 2 = 1/n^2 amplitude 
    attack, //Linear time to get to max amplitude  in seconds
    hold, // time in seconds to hold max amplitude
    decay, // time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
    envelopeFilter, // 0-1000 1 = no filter, 1000 = 1/1000 of heaviest filter
    envMode //1,2
    ) {
    //Calculate max delay in samples
        
    let delay0 = 0;
    let delayN = 0;
    let phaseShift0 = 0;
        
    if (envMode==1 ){
        //Mode1 - delay envelopes by the same as the phase delay
        let delay = Math.abs(rootPhaseDelay) * 0.5 * sampleRate/frequency ;
        delay0 = rootPhaseDelay<0 ? 0 : delay;
        delayN = rootPhaseDelay<0 ? delay : 0;
    }
    else{
        //Mode2 - Envelope fixed, shift phase in place
        phaseShift0 = rootPhaseDelay * Math.PI;
    }

    let bufferSize = Math.round(sampleRate * (attack + hold + decayLengthFactor * decay + envelopeFilter*0.0003) + delay0 + delayN ); //Allow for attack and 1.5* decay time + extra for filter smoothing



    //Create buffer
    let audioBuffer = new AudioBuffer({
        length: bufferSize,
        sampleRate: sampleRate,
        numberOfChannels: 1
      });
      let b = audioBuffer.getChannelData(0);
      buildEnvelopeBuffer(sampleRate, bufferSize, attack, hold, decay, envelopeFilter);
      buildHarmonicSeries(frequency, sampleRate, b, oddLevel, oddAlt, oddFalloff,  evenLevel, evenAlt, evenFalloff, delay0, delayN, phaseShift0, higherHarmonicRelativeShift);
      return audioBuffer;
}

//Generate the harmonic series
function buildHarmonicSeries(frequency, sampleRate, b, oddLevel, oddAlt, oddFalloff, evenLevel, evenAlt, evenFalloff, delay0, delayN, phaseShift0, higherRelativeShift) {
    let f = frequency;
    let a = 1;// First harmonic, buffer will be normalised later
    let nyquist = sampleRate * 0.49;//Nyquist limit less a bit
    bufferSize=b.length;
    mixInSine(sampleRate, b, f, a, delay0, phaseShift0 ); //Add fundamental

    //Alt needed for triangle wave causing polarity to flip for each successive harmonic
    let oddAltCore = -1;//first harmonic already used
    let evenAltCore = 1;
    let delayScale = (delay0-delayN) * frequency *higherRelativeShift;//Either Delay0 or delayN will be zero
    for (let i = 1; i < harmonics; i++) {
        let isEven = (i+1) % 2 == 0;
        f += frequency;
        if (frequency>=nyquist) return;//Nyquist limit
        let falloff =  Math.pow(i+1,-(isEven ? evenFalloff :oddFalloff));
        let oe = 0;
        if (isEven){
            oe = evenLevel * ((evenAltCore-1)*evenAlt + 1);
            evenAltCore = evenAltCore * -1;
        }
        else{
            oe=oddLevel * ((oddAltCore-1)*oddAlt + 1);            
            oddAltCore = oddAltCore * -1;
        }
        mixInSine(sampleRate, b, f, a * oe * falloff,delayN + delayScale/f, phaseShift0 * higherRelativeShift);
    }
}


//Generate a single envelope, shared by all harmonics
let envelopeBuffer = null;
const root2 = Math.sqrt(2);
const ln1024 =Math.log(1024);
function buildEnvelopeBuffer(
    sampleRate, //samples per second
    bufferSize,
    attack, // 0..1  = time in seconds
    hold,
    decay, // 0..1) 
    filter // 0-1000 
    ){
        //Low pass filter setup
        let x = 0;
        let y=0;  
        let a = 1/Math.max(1,filter);

        let isHold = false;
        let holdSamples = hold * sampleRate;
        let isDecay = false;
        let attackRate = 1 / (attack * sampleRate); //Linear attack
        let decayLambda = ln1024 / (decay * sampleRate); //Exponential decay -> decay is time in seconds to get to 1/1024 (-60db)of start value
        let envValues = [0]; // Array to store env values
        for (let i = 1; i < bufferSize; i++) {
            if (isHold){
                if (--holdSamples <=0){
                    isHold = false;
                    isDecay = true;
                }
            }
            else if (isDecay){
                x -= decayLambda*x; 
            }
            else 
            {
                x += attackRate; 
                if (x >= 1){
                    //switch to hold stage if hold is non zero
                    isHold = holdSamples>0;
                    isDecay = holdSamples==0;
                    x=1;
                }
            }
            //Band limit envelope 1-pole IIR low pass
            y +=  a * (x - y);
            envValues.push(y);
        }
        envelopeBuffer = envValues;
}

//Generate a single sine wave and mix into the buffer
function mixInSine(
    sampleRate, //samples per second
    buffer, 
    frequency, //Hz 
    amplitude, // 0..1
    delay, //in samples for this frequency - envelope start will be delayed. Phase counter will not start until envelope starts
    phaseOffset
    ) {
        let w = frequency * 2 * Math.PI  / sampleRate;
    let theta = phaseOffset + (Math.floor(delay) + 1 - delay) * w; //Phase accumulator + correction for fractional delay
    let env = 0;
    let bufferSize = buffer.length;
    for (let i = 0; i < bufferSize; i++) {
        if (i > delay)   {
            //Phase accumulator
            theta += w;

            buffer[i] += amplitude * envelopeBuffer[env++] * Math.sin(theta) ;
        }
    }
}

function getBufferMax(buffer){
    let b = buffer.getChannelData(0);
    let bufferSize = buffer.length;
    let max = 0;
    for (let i = 0; i < bufferSize; i++) {
        let val = Math.abs( b[i]);
        if (val>max) max = val;
    }
    return max;
}

function scaleBuffer(buffer, scale){
    let b = buffer.getChannelData(0);
    let bufferSize = buffer.length;
    let max = 0;
    for (let i = 0; i < bufferSize; i++) {
        b[i]*=scale;
    }
    return max;
}

function buildNullTest(bufferA, bufferB){
    let length = Math.min(bufferA.length, bufferB.length);
    var A = bufferA.getChannelData(0);
    var B = bufferB.getChannelData(0);
    let nullTest = new AudioBuffer({
        length: length,
        sampleRate: bufferA.sampleRate,
        numberOfChannels: 1
      });
      let b = nullTest.getChannelData(0);
      for (let i = 0; i < length; i++) {
        b[i] = A[i] - B[i];
      }
      return nullTest;
}




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//GUI wiring up Code - no knowledge of audio code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let changed = true;
// Attach play and stop methods to the button
document.getElementById('playSoundA').addEventListener('click', function() {
    play(0);
});
document.getElementById('playSoundB').addEventListener('click', function() {
    play(1);
});
document.getElementById('playSoundNull').addEventListener('click', function() {
    play(2);
});
document.getElementById('freq').addEventListener('input', function() {
    document.getElementById('freq-value').textContent = this.value + "Hz";
    updatePhaseLabels();
    changed=true;
});

document.getElementById('attack').addEventListener('input', function() {
    document.getElementById('attack-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('decay').addEventListener('input', function() {
    document.getElementById('decay-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('hold').addEventListener('input', function() {
    document.getElementById('hold-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('second').addEventListener('input', function() {
    document.getElementById('second-value').textContent = this.value;
    changed=true;
});


document.getElementById('odd').addEventListener('input', function() {
    setupLevelLabel("odd", this.value, undefined)
    changed=true;
});

document.getElementById('oddAlternating').addEventListener('input', function() {
    setupLevelLabel("odd", undefined, this.value)
    changed=true;
});

document.getElementById('even').addEventListener('input', function() {
    setupLevelLabel("even", this.value, undefined)
    changed=true;
});
document.getElementById('evenAlternating').addEventListener('input', function() {
    setupLevelLabel("even", undefined, this.value)
    changed=true;
});

function setupLevelLabel(idRoot, level,polarity){
    level = parseFloat(level ?? document.getElementById(idRoot).value);
    polarity =parseFloat(polarity ?? document.getElementById(idRoot + "Alternating").value);
    let value = "off"
    if (level!=0)
    {
        if (polarity==0) 
            value = level.toFixed(1);
        else
            value = level.toFixed(1) +"↔" + (level *(-2 * polarity +1)).toFixed(1);
    }
    document.getElementById(idRoot + '-value').textContent = value;
}

document.getElementById('oddFalloff').addEventListener('input', function() {
    let value = "";
    if (this.value==0) value = "1";
    else if (this.value==1) value = "1/n";
    else value = "1/n<sup>" + this.value + "</sup>";
    document.getElementById('oddFalloff-value').innerHTML = value;
    changed=true;
});





document.getElementById('evenFalloff').addEventListener('input', function() {
    let value = "";
    if (this.value==0) value = "1";
    else if (this.value==1) value = "1/n";
    else value = "1/n<sup>" + this.value + "</sup>";
    document.getElementById('evenFalloff-value').innerHTML = value;
    changed=true;
});

document.getElementById('envelopeFilter').addEventListener('input', function() {
    document.getElementById('envelopeFilter-value').textContent = this.value=="1"? "off" : this.value;
    changed=true;
});

document.getElementById('rootPhaseDelayA').addEventListener('input', function() {
    updatePhaseLabels();
    changed=true;
});

document.getElementById('rootPhaseDelayB').addEventListener('input', function() {
    updatePhaseLabels();
    changed=true;
});

document.getElementById('hideFFT').addEventListener('click', function() {
    useFFT = !useFFT;
    if (!useFFT) fftClear();
    this.textContent = useFFT ? "Hide FFT" : "Show FFT";
});

function updatePhaseLabels(){
    let invFreq = 1000 / (parseFloat(document.getElementById('freq').value) * 2);
    let rootPhaseDelayA = document.getElementById('rootPhaseDelayA').value;
    let rootPhaseDelayB = document.getElementById('rootPhaseDelayB').value;
    let delayA = parseFloat(rootPhaseDelayA) * invFreq;
    let delayB = parseFloat(rootPhaseDelayB) * invFreq;
    document.getElementById('rootPhaseDelayA-value').textContent = rootPhaseDelayA + "π (" + (delayA).toFixed(1) + "ms)";
    document.getElementById('rootPhaseDelayB-value').textContent = rootPhaseDelayB + "π (" + (delayB).toFixed(1) + "ms)";
}


window.addEventListener('resize', updateCanvas);

function updateCanvas() {
    let canvasA = document.getElementById('waveformA');
    let canvasB = document.getElementById('waveformB');

    canvasA.width = canvasA.offsetWidth;
    canvasB.width = canvasB.offsetWidth;
    updateDisplay();
}


let envMode=1;
document.getElementById('envMode1').addEventListener('change', function() {
    if (this.checked) {
        envMode=1;
        changed=true;
    }
});
document.getElementById('envMode2').addEventListener('change', function() {
    if (this.checked) {
        envMode=2;
        changed=true;
    }
});



//Initialise display of waveform and audio buffers on first load
updateBuffersAndDisplay();
updatePhaseLabels();
fftClear();




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//ABX TEST GUI Code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let abxTestChoice;
let abxCount =0;
let abxScore =0;
function playABX(){    
    if (abxTestChoice === 0) {
        play(0);
    } else {
        play(1);
    }
}

document.getElementById('abxTest').addEventListener('click', function() {
    abxTestChoice = Math.round(Math.random());
    document.getElementById('abxButtons').style.display = 'flex';
    document.getElementById('abxTest').style.display = 'none';
    document.getElementById('resetTest').style.display = 'block';
    playABX();
});

document.getElementById('play').addEventListener('click', function() {
    playABX();
});

document.getElementById('buttonA').addEventListener('click', function() {
    checkChoice(0);
});

document.getElementById('buttonB').addEventListener('click', function() {
    checkChoice(1);
});

document.getElementById('resetTest').addEventListener('click', function() {
    let results = document.getElementById('results');
    results.innerHTML = '';
    abxCount =0;
    abxScore =0;
    document.getElementById('abxButtons').style.display = 'none';
    document.getElementById('abxTest').style.display = 'block';
    document.getElementById('resetTest').style.display = 'none';
    const stats = document.getElementById('stats');
    stats.textContent = '';
});

function checkChoice(choice) {
    const results = document.getElementById('results');
    const result = document.createElement('li');

    abxCount++;
    if (choice === abxTestChoice) {
        abxScore++;
        result.textContent = 'Correct! The answer was ' + (abxTestChoice === 0 ? 'A' : 'B') + '.';
    } else {
        result.textContent = 'Incorrect. The correct answer was ' + (abxTestChoice === 0 ? 'A' : 'B') + '.';
    }

    results.appendChild(result);
    document.getElementById('abxButtons').style.display = 'none';
    document.getElementById('abxTest').style.display = 'block';
    
    const stats = document.getElementById('stats');
    stats.textContent = 'Score: ' + abxScore + '/' + abxCount +'  ' + Math.round(abxScore / abxCount * 100).toFixed(0) + '%' ;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Help pop up trigger code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let helpIcons = document.querySelectorAll('.help-icon');

helpIcons.forEach(function(helpIcon) {
    helpIcon.addEventListener('click', function(event) {
        event.stopPropagation();
        clearHelp();
        let helpPopup = this.nextElementSibling;
        helpPopup.style.display = 'block';
    });
});

document.addEventListener('click', function() {
    clearHelp();
});

function clearHelp(){
    let helpPopups = document.querySelectorAll('.help-popup');
    helpPopups.forEach(function(helpPopup) {
        helpPopup.style.display = 'none';
    });
}

