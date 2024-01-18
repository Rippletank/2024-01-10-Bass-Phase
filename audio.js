
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//This code is not optimised for performance - it is intended to be fairly easy to understand and modify
//It is not intended to be used in production code
//Copyright N.Whitehurst 2024
//https://github.com/Rippletank/2024-01-10-Bass-Phase
//MIT License - use as you wish, but no warranty of any kind, express or implied, is provided with this software
//Code was written with the help of Github Copilot, particularly for UI/CSS stuff and some mundane refactoring chores
//Web Audio API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
//Wikipedia for refresher on harmonic series and related
//Quick IIF refresher and general approach for suitable smoothing values https://zipcpu.com/dsp/2017/08/19/simple-filter.html
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++



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
    SecondHarmonicRelativePhaseDelay, //fraction of rootPhaseDelay for phase of second harmonic
    oddLevel, //-1..1
    oddFalloff,//0..2 0 = no falloff, 1 = 1/n amplitude, 2 = 1/n^2 amplitude 
    evenLevel, //-1..1
    evenFalloff,//0..2 0 = no falloff, 1 = 1/n amplitude, 2 = 1/n^2 amplitude 
    attack, //Linear time to get to max amplitude  in seconds
    decay, // time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
    envelopeFilter // 1-32 1 = no filter, 32 = 1/32 of heaviest filter
    ) {
    //Calculate max delay in samples
    let delay = Math.abs(rootPhaseDelay) * 0.5 * sampleRate/frequency ;
    let bufferSize = Math.round(sampleRate * (attack + decayLengthFactor * decay) + delay); //Allow for attack and 1.5* decay time 
        
    let delay0 =rootPhaseDelay<0 ? 0 : delay;
    let delay1 =delay * (rootPhaseDelay<0 ?  1-SecondHarmonicRelativePhaseDelay*2 : SecondHarmonicRelativePhaseDelay*2 ); //Delay first harmonic by 1/2 the phase delay but double the frequency
    let delayN =  rootPhaseDelay<0 ? delay : 0;

    //Create buffer
    let audioBuffer = new AudioBuffer({
        length: bufferSize,
        sampleRate: sampleRate,
        numberOfChannels: 1
      });
      let b = audioBuffer.getChannelData(0);
      buildEnvelopeBuffer(sampleRate, bufferSize, attack,decay, envelopeFilter);
      buildHarmonicSeries(frequency, sampleRate, b, bufferSize, oddLevel, oddFalloff, evenLevel, evenFalloff, delay0, delay1, delayN);
      return audioBuffer;
}

//Generate the harmonic series
function buildHarmonicSeries(frequency, sampleRate, b, bufferSize, oddLevel, oddFalloff, evenLevel, evenFalloff, delay0, delay1, delayN) {
    let f = frequency;
    let a = 1;// First harmonic, buffer will be normalised later
    let nyquist = sampleRate * 0.49;//Nyquist limit less a bit
    mixInSine(sampleRate, b, bufferSize, f, a, delay0 ); //Add fundamental

    for (let i = 1; i < harmonics; i++) {
        let isEven = (i+1) % 2 == 0;
        f += frequency;
        if (frequency>=nyquist) return;//Nyquist limit
        let falloff =  Math.pow(i+1,-(isEven ? evenFalloff :oddFalloff));
        let oe = isEven ? evenLevel : oddLevel;
        mixInSine(sampleRate, b, bufferSize, f, a * oe * falloff, i == 1 ? delay1 : delayN);
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
    decay, // 0..1) 
    filter // 1-32 
    ){
        //Low pass filter setup
        let x = 0;
        let y=0;  
        let a = 1/filter;

        let isDecay = false;
        let attackRate = 1 / (attack * sampleRate); //Linear attack
        let decayLambda = ln1024 / (decay * sampleRate); //Exponential decay -> decay is time in seconds to get to 1/1024 (-60db)of start value
        let envValues = [0]; // Array to store env values
        for (let i = 1; i < bufferSize; i++) {
            if (isDecay){
                x -= decayLambda*x; 
            }
            else 
            {
                x += attackRate; 
                if (x >= 1){
                    isDecay = true;
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
    bufferSize,
    frequency, //Hz 
    amplitude, // 0..1
    delay //in samples for this frequency
    ) {
    let theta = 0;
    let w = frequency * 2 * Math.PI  / sampleRate;
    let env = 0;
    for (let i = 0; i < bufferSize; i++) {
        if (i > delay)   {
            //Phase accumulator
            theta += w;

            buffer[i] += amplitude * envelopeBuffer[env++] * Math.sin(theta) ;
        }
    }
}

function getBufferMax(buffer, bufferSize){
    let b = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < bufferSize; i++) {
        let val = Math.abs( b[i]);
        if (val>max) max = val;
    }
    return max;
}

function scaleBuffer(buffer, bufferSize, scale){
    let b = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < bufferSize; i++) {
        b[i]*=scale;
    }
    return max;
}




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//GUI/Audio/WebAudioAPI linking code knows about each area of concern
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let audioContext = null;
let sourceNode = null;
let audioBufferA = null;
let audioBufferB = null;

function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
}


// Play method, index 0 = A, 1 = B
function play(index) {
    ensureAudioContext();
    //Can't reuse source node so create a new one
    stop();
    sourceNode = audioContext.createBufferSource();
    sourceNode.connect(audioContext.destination);
    if (changed || generatedSampleRate != audioContext.sampleRate){
        updateBuffersAndDisplay();
    }
    sourceNode.buffer = index==0 ? audioBufferA : audioBufferB;
    sourceNode.start(0);
}

function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
    }
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
    let second = parseFloat(document.getElementById('second').value); //SecondHarmonicRelativePhaseDelay
    let odd = parseFloat(document.getElementById('odd').value); //odd harmonic level
    let oddFalloff = parseFloat(document.getElementById('oddFalloff').value); //odd harmonic level
    let even = parseFloat(document.getElementById('even').value); //even harmonic level
    let evenFalloff = parseFloat(document.getElementById('evenFalloff').value); //even harmonic level
    let attack = parseFloat(document.getElementById('attack').value); //attack time 
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
        second, odd, oddFalloff, even, evenFalloff, attack, decay, envelopeFilter
    );

    audioBufferB = getAudioBuffer(
        sampleRate, freq,
        rootPhaseDelayB,
        second, odd, oddFalloff, even, evenFalloff, attack, decay, envelopeFilter
    );

    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = 0.99 / Math.max(getBufferMax(audioBufferA, audioBufferA.length), getBufferMax(audioBufferB, audioBufferB.length));

    scaleBuffer(audioBufferA, audioBufferA.length, scale);
    scaleBuffer(audioBufferB, audioBufferB.length, scale);

    //console.log("Max amplitude: " + Math.max(getBufferMax(audioBufferA, audioBufferA.length), getBufferMax(audioBufferB, audioBufferB.length)));
}

function updateDisplay(){
    if (!audioBufferA || !audioBufferB) return;
    paintBuffer(audioBufferA, audioBufferA.length, "waveformA");
    paintBuffer(audioBufferB, audioBufferB.length, "waveformB");
}


function paintBuffer(buffer, bufferSize, canvasId){
    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    let x = 0;
    let y = canvas.height/2;
    let step = canvas.width / bufferSize;
    let b = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        ctx.lineTo(x, y + b[i] * y);
        x += step;
    }
    ctx.stroke();
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
document.getElementById('freq').addEventListener('input', function() {
    document.getElementById('freq-value').textContent = this.value + "Hz";
    updatePhaseLabels();
    changed=true;
});

document.getElementById('attack').addEventListener('input', function() {
    document.getElementById('attack-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('second').addEventListener('input', function() {
    document.getElementById('second-value').textContent = this.value;
    changed=true;
});

document.getElementById('decay').addEventListener('input', function() {
    document.getElementById('decay-value').textContent = this.value + "s";
    changed=true;
});

document.getElementById('odd').addEventListener('input', function() {
    document.getElementById('odd-value').textContent = this.value;
    changed=true;
});

document.getElementById('oddFalloff').addEventListener('input', function() {
    let value = "";
    if (this.value==0) value = "1";
    else if (this.value==1) value = "1/n";
    else value = "1/n<sup>" + this.value + "</sup>";
    document.getElementById('oddFalloff-value').innerHTML = value;
    changed=true;
});

document.getElementById('even').addEventListener('input', function() {
    document.getElementById('even-value').textContent = this.value;
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



//Initialise display of waveform and audio buffers on first load
updateBuffersAndDisplay();
updatePhaseLabels();




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

