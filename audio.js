// Create an AudioContext
let audioContext = null;

let sourceNode = null;


let startFrequency = 100;// Hz
let harmonics = 20;
let attack = 0.001; //seconds
let decay = 0.5; //seconds
let rootPhaseDelay = [0.0]; // -1..1 => -PI..PI for phase of fundamental

let audioBuffer = null;

// Update method to create a buffer
function buildBuffer(
    sampleRate, //samples per second
    rootPhaseDelay, //-1..1 => -PI..PI for phase of fundamental
    attack, //Linear time to get to max amplitude  in seconds
    decay // decay is time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
    ) {

    //Calculate max delay in samples
    let delay = Math.abs(rootPhaseDelay) * 0.5 * sampleRate/startFrequency ;
    let bufferSize = Math.round(sampleRate * (attack + 2 * decay) + delay); //Allow for attack and double decay time 
        
    let delay0 =rootPhaseDelay<0 ? 0 : delay;
    let delay1 =delay * 0.5;
    let delayN =  rootPhaseDelay<0 ? delay : 0;

    //Create buffer
    audioBuffer = new AudioBuffer({
        length: bufferSize,
        sampleRate: sampleRate,
        numberOfChannels: 1
      });
      let b = audioBuffer.getChannelData(0);
      buildEnvelopeBuffer(sampleRate, bufferSize, attack,decay);
      let f = startFrequency;
      let a = 0.6;
      for (let i = 0; i < harmonics; i++) {
            f += startFrequency;
            a *= 0.4;
            mixInSine(sampleRate, b, bufferSize, f, a, 
                (i==0? delay0 : (i==1 ? delay1 : delayN))); //Only delay fundamental and first harmonic
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
    if (w>=Math.PI) return;//Nyquist limit
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
    }
    if (sourceNode){  
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
    }
         
    sourceNode = audioContext.createBufferSource();
    sourceNode.connect(audioContext.destination);

    //Fill buffer (with benchmark)
    let t0 = performance.now();
    buildBuffer(
        audioContext.sampleRate,
        rootPhaseDelay[index], //rootPhaseDelay
        parseFloat(document.getElementById('attack').value), //attack
        parseFloat(document.getElementById('decay').value) //decay
    );
    let t1 = performance.now();
    console.log("Execution time: " + (t1 - t0) + " milliseconds.");


    sourceNode.buffer = audioBuffer;
    sourceNode.start(0);
}

// Stop method
function stop() {
    if (sourceNode) {
        sourceNode.stop(0);
        sourceNode.disconnect();
        sourceNode = null;
    }
}

// Attach play and stop methods to the button
document.getElementById('playSound').addEventListener('click', function() {
    play(0);
});