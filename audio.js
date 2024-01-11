// Create an AudioContext
let audioContext = null;
let sourceNode = null;
let audioBufferA = null;
let audioBufferB = null;


let harmonics = 1000;//Allows 20Hz to have harmonics up to 20KHz??

// Update method to create a buffer
function buildBuffer(
    sampleRate, //samples per second
    frequency, //Hz
    rootPhaseDelay, //-1..1 => -PI..PI for phase of fundamental
    SecondHarmonicRelativePhaseDelay,
    oddLevel, //-1..1
    evenLevel, //-1..1
    attack, //Linear time to get to max amplitude  in seconds
    decay // decay is time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
    ) {
        changed = false;
    //Calculate max delay in samples
    let delay = Math.abs(rootPhaseDelay) * 0.5 * sampleRate/frequency ;
    let bufferSize = Math.round(sampleRate * (attack + 1.5 * decay) + delay); //Allow for attack and 1.5* decay time 
        
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
      buildEnvelopeBuffer(sampleRate, bufferSize, attack,decay);
      buildHarmonicSeries(frequency, sampleRate, b, bufferSize, oddLevel, evenLevel, delay0, delay1, delayN);
      return audioBuffer;
}


function buildHarmonicSeries(frequency, sampleRate, b, bufferSize, oddLevel, evenLevel, delay0, delay1, delayN) {
    let f = frequency;
    let a = 0.7;
    let nyquist = sampleRate * 0.49;//Nyquist limit less a bit
    mixInSine(sampleRate, b, bufferSize, f, a, delay0 ); //Add fundamental

    for (let i = 1; i < harmonics; i++) {
        f += frequency;
        if (frequency>=nyquist) return;//Nyquist limit
        a =  a/(i+1);
        let oe = i % 2 == 0 ? evenLevel : oddLevel;
        mixInSine(sampleRate, b, bufferSize, f, a * oe, i == 1 ? delay1 : delayN);
    }
}

let envelopeBuffer = null;
const root2 = Math.sqrt(2);
const ln1024 =Math.log(1024);
function buildEnvelopeBuffer(
    sampleRate, //samples per second
    bufferSize,
    attack, // 0..1  = time in seconds
    decay, // 0..1) 
    ){
        //Low pass filter setup
        let x = 0;
        let y=0;  
        let a = 1/8;

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
// Play method
function play(index) {
    if (!audioContext){
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        changed = true;        
    }
    if (sourceNode){  
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;    
    }
    sourceNode = audioContext.createBufferSource();
    sourceNode.connect(audioContext.destination);
    if (changed){

        //Fill buffer (with benchmark)
        let t0 = performance.now();

        let freq = parseFloat(document.getElementById('freq').value);//frequency
        let second = parseFloat(document.getElementById('second').value);//SecondHarmonicRelativePhaseDelay
        let odd = parseFloat(document.getElementById('odd').value);//odd harmonic level
        let even = parseFloat(document.getElementById('even').value);//even harmonic level
        let attack = parseFloat(document.getElementById('attack').value);//attack time 
        let decay = parseFloat(document.getElementById('decay').value);//decay time
        let rootPhaseDelayA = parseFloat(document.getElementById('rootPhaseDelayA').value);//rootPhaseDelayA
        let rootPhaseDelayB = parseFloat(document.getElementById('rootPhaseDelayB').value);//rootPhaseDelayB

        audioBufferA = buildBuffer(
            audioContext.sampleRate, freq, 
            rootPhaseDelayA, 
            second, odd, even, attack, decay 
        );        

        audioBufferB = buildBuffer(
            audioContext.sampleRate, freq, 
            rootPhaseDelayB, 
            second, odd, even, attack, decay 
        );

        let scale = 0.99/Math.max(getBufferMax(audioBufferA, audioBufferA.length), getBufferMax(audioBufferB, audioBufferB.length));

        scaleBuffer(audioBufferA, audioBufferA.length, scale);
        scaleBuffer(audioBufferB, audioBufferB.length, scale);

        console.log("Max amplitude: " + Math.max(getBufferMax(audioBufferA, audioBufferA.length), getBufferMax(audioBufferB, audioBufferB.length)));

        paintBuffer(audioBufferA, audioBufferA.length, "waveformA")
        paintBuffer(audioBufferB, audioBufferB.length, "waveformB")

        let t1 = performance.now();
        console.log("Execution time: " + (t1 - t0) + " milliseconds.");

    }
    sourceNode.buffer = index==0 ? audioBufferA : audioBufferB;
    sourceNode.start(0);
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



// Stop method
function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
    }
}

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

document.getElementById('even').addEventListener('input', function() {
    document.getElementById('even-value').textContent = this.value;
    changed=true;
});

document.getElementById('rootPhaseDelayA').addEventListener('input', function() {
    updatePhaseALabels();
    changed=true;
});

document.getElementById('rootPhaseDelayB').addEventListener('input', function() {
    updatePhaseALabels();
    changed=true;
});

function updatePhaseALabels(){
    let invFreq = 1 / (parseFloat(document.getElementById('freq').value) *0.5);
    let rootPhaseDelayA = document.getElementById('rootPhaseDelayA').value;
    let rootPhaseDelayB = document.getElementById('rootPhaseDelayB').value;
    let delayA = parseFloat(document.getElementById('rootPhaseDelayA').value) * invFreq;
    let delayB = parseFloat(document.getElementById('rootPhaseDelayB').value) * invFreq;
    document.getElementById('rootPhaseDelayA-value').textContent = rootPhaseDelayA + "π (" + (1000 * delayA).toFixed(1) + "ms)";
    document.getElementById('rootPhaseDelayB-value').textContent = rootPhaseDelayB + "π (" + (1000 * delayB).toFixed(1) + "ms)";
}


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
    document.getElementById('abxButtons').style.display = 'block';
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
    const stats1 = document.getElementById('stats1');
    stats1.textContent = '';

    const stats2 = document.getElementById('stats2');
    stats2.textContent ='' ;
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

    const stats1 = document.getElementById('stats1');
    stats1.textContent = 'Score: ' + abxScore + '/' + abxCount ;

    const stats2 = document.getElementById('stats2');
    stats2.textContent =' (' + Math.round(abxScore / abxCount * 100).toFixed(0) + '%)' ;
}