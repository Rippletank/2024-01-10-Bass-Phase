
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
//Audio Code - creates buffers with audio data according to parameters
//No knowledge of GUI, only knows about AudioBuffer from WebAudioAPI
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let wavePresets = [
    {
        name:"default", 
        patch:{
            oddLevel:1,
            oddFalloff:1.8,
            oddAlt:0,
            evenLevel:-1,
            evenFalloff:1.8,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0.5,
        }
    },
    {
        name:"square", 
        patch:{
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:0,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0.5,
        }
    },
    {
        name:"Saw", 
        patch:{
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:-1,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0.5,
        }
    },
    {
        name:"Triangle", 
        patch:{
            oddLevel:1,
            oddFalloff:2,
            oddAlt:1,
            evenLevel:0,
            evenFalloff:1,
            evenAlt:0,
            sinCos:0,
            altW:0.5,
            altOffset:0.5,
        }
    },
    {
        name:"stairs", 
        patch:{
            oddLevel:1,
            oddFalloff:1,
            oddAlt:0,
            evenLevel:1,
            evenFalloff:1,
            evenAlt:0.5,
            sinCos:0,
            altW:0.5,
            altOffset:0.5,
        }
    },
    {
        name:"pulse", 
        patch:{
            oddLevel:1,
            oddFalloff:1,
            oddAlt:1,
            evenLevel:1,
            evenFalloff:1,
            evenAlt:1,
            sinCos:1,
            altW:0.75,
            altOffset:0,
        }
    }
];

let envelopePresets = [
    {
        name:"default",
        patch:{
            attack:0.005,
            hold:0,
            decay:0.4,
            envelopeFilter:150,
        }
    },
    {
        name:"Short",
        patch:{
            attack:0.001,
            hold:0,
            decay:0.05,
            envelopeFilter:1000,
        }
    },
    {
        name:"Slow",
        patch:{
            attack:0.05,
            hold:0,
            decay:0.5,
            envelopeFilter:150,
        }
    },
    {
        name:"Tone",
        patch:{
            attack:0.01,
            hold:0.5,
            decay:0.1,
            envelopeFilter:0,
        }
    },
    {
        name:"View",
        patch:{
            attack:0.001,
            hold:0.15,
            decay:0.01,
            envelopeFilter:0,
        }
    },

];


function getDefaultPatch(){
    return {
        frequency: 50,//Hz
        rootPhaseDelay: 0,//-1..1 => -PI..PI for phase shift of fundamental
        higherHarmonicRelativeShift: 0,//fraction of rootPhaseDelay for phase of higher harmonics

        //Harmonic series
        oddLevel: 1,//-1..1 level of odd harmonics
        oddAlt: 0,//0..1 How much the odd harmonics alternate in polarity
        oddFalloff: 1.8,//1..2 How much the odd harmonics fall off in amplitude as a power of 1/n
        evenLevel: -1,//-1..1 level of even harmonics
        evenAlt: 0,//0..1 How much the even harmonics alternate in polarity
        evenFalloff: 1.8,//1..2 How much the even harmonics fall off in amplitude as a power of 1/n,
        sinCos:0,//0..1 0 = sine wave, 1 = cosine wave, use cosine for pulse wave
        altW:0.5,//0..1 frequency of alternation - gives pulse width for pulse wave
        altOffset:0.5,//between 0 and 0.5 - phase offset for alternation between even and odd harmonics, needed to "sync" alternations for pulse wave

        //Amplitude envelope
        attack: 0.005,//Linear time to get to max amplitude  in seconds
        hold: 0,// time in seconds to hold max amplitude
        decay: 0.4,// time in seconds to get to 1/1024 (-60db) of start value -> exponential decay
        envelopeFilter: 150,// 0-1000 1 = no filter, 1000 = 1/1000 of heaviest filter
        envMode: 1//1,2 - 1 = delay envelope by same as phase delay, 2 = envelope fixed, shift phase in place
    }
}


function getDefaultAPatch(){
    let patch = getDefaultPatch();
    patch.rootPhaseDelay=0;
    return patch;
}
function getDefaultBPatch(){
    let patch = getDefaultPatch();
    patch.rootPhaseDelay=0.25;
    return patch;
}




let harmonics = 1000;//Allows 20Hz to have harmonics up to 20KHz??
let decayLengthFactor = 1.4;//Decay length ( in samples) is 1.4 times longer than the -60db decay time - allows for longer tail than RT60 alone
let generatedSampleRate = 0;//Sample rate used to generate current buffers
// Update method to create a buffer
function getAudioBuffer(
    sampleRate,//Samples per second
    patch
    ) {
    //Calculate max delay in samples
        
    let delay0 = 0;
    let delayN = 0;
    let phaseShift0 = 0;
        
    if (envMode==1 ){
        //Mode1 - delay envelopes by the same as the phase delay
        let delay = Math.abs(patch.rootPhaseDelay) * 0.5 * sampleRate/patch.frequency ;
        delay0 = patch.rootPhaseDelay<0 ? 0 : delay;
        delayN = patch.rootPhaseDelay<0 ? delay : 0;
    }
    else{
        //Mode2 - Envelope fixed, shift phase in place
        phaseShift0 = patch.rootPhaseDelay * Math.PI;
    }

    let bufferSize = Math.round(sampleRate 
        * (patch.attack + patch.hold + decayLengthFactor * patch.decay + patch.envelopeFilter*0.0003) + delay0 + delayN ); //Allow for attack and 1.5* decay time + extra for filter smoothing



    //Create buffer
    let audioBuffer = new AudioBuffer({
        length: bufferSize,
        sampleRate: sampleRate,
        numberOfChannels: 1
      });
      let b = audioBuffer.getChannelData(0);
      let envelopeBuffer =buildEnvelopeBuffer(sampleRate, bufferSize, patch.attack, patch.hold, patch.decay, patch.envelopeFilter);
      buildHarmonicSeries(patch, sampleRate, b, envelopeBuffer, delay0, delayN, phaseShift0);
      return audioBuffer;
}

//Return object with 3 float arrays,
// samples - the audio samples for one complete cycle
// magnitude - the magnitude of each harmonic
// phase - the phase of each harmonic
function getPreview(referencePatch){
    let defaultPatch = getDefaultPatch();
    let patch = {
        ...defaultPatch,
        ...referencePatch
    };
    let sampleRate = 1000;
    patch.frequency = 1;
    let bufferSize = sampleRate; //Allow for attack and 1.5* decay time + extra for filter smoothing
    let envelopeBuffer =[];
    let b = [];
    for (let i = 0; i < bufferSize; i++) {
        envelopeBuffer.push(1);
        b.push(0);
    }
    let magnitude = [];
    let phase = [];
    let postProcessor = (n, w, level, phaseShift)=>{
        magnitude.push(level);
        phase.push(phaseShift);
    }
    buildHarmonicSeries(patch, sampleRate, b, envelopeBuffer, 0, 0, patch.rootPhaseDelay * Math.PI,postProcessor);
    return {
        samples:b,
        magnitude:magnitude,
        phase:phase,
        mean:b.reduce((a, b) => a + b, 0) / b.length, //average value
        max:Math.max(...b),
        min:Math.min(...b)
    };
}



//Generate a single envelope, shared by all harmonics
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
        return envValues;
}


//Generate the harmonic series
function buildHarmonicSeries(patch,  sampleRate, b, envelopeBuffer, delay0, delayN, phaseShift0, postProcessor) {
    let nyquistW = 0.49 * 2 * Math.PI;//Nyquist limit in radians per sample
    let rootW = patch.frequency * 2 * Math.PI  / sampleRate;
    let sinCos = patch.sinCos*Math.PI/2;
    if (postProcessor) postProcessor(0, 0, 0, 0, 0);//process for DC, n=0
    bufferSize=b.length;

    //Alt needed for triangle wave causing polarity to flip for each successive harmonic
    let altW = patch.altW * Math.PI;   
    let evenAltOffset = patch.altOffset * Math.PI; 
    let delayScale = (delay0-delayN) * rootW * patch.higherHarmonicRelativeShift;//Either Delay0 or delayN will be zero
    for (let n = 1; n < harmonics; n++) {
        let w = rootW * n;
        if (w>=nyquistW) return;//Nyquist limit
        let level = 0;
        let isEven = n % 2 == 0;
        let delay = n==1 ? delay0 : delayN + delayScale/w;
        let phaseShift = phaseShift0 * (n==1 ? 1 :patch.higherHarmonicRelativeShift);
        if (isEven){
            level = patch.evenLevel * ((Math.sin(n*altW - evenAltOffset)-1) * patch.evenAlt + 1) * Math.pow(n,-patch.evenFalloff );
        }
        else{

            level=patch.oddLevel * ((Math.sin(n*altW)-1) * patch.oddAlt + 1) * Math.pow(n,-patch.oddFalloff);  
        }        
        mixInSine( b, w, envelopeBuffer, level ,delay, phaseShift + sinCos );
        if (postProcessor) postProcessor(n, w, level, phaseShift+ sinCos + delay * w);
    }
}


//Generate a single sine wave and mix into the buffer
function mixInSine(
    buffer, 
    w, //Hz 
    envelopeBuffer,
    amplitude, // 0..1
    delay, //in samples for this frequency - envelope start will be delayed. Phase counter will not start until envelope starts
    phaseOffset
    ) {
        if (amplitude==0) return;
    let theta = phaseOffset + (Math.floor(delay) + 1 - delay) * w; //Phase accumulator + correction for fractional delay
    let env = 0;
    let bufferSize = buffer.length;
    for (let i = 0; i < bufferSize; i++) {
        if (i >= delay)   {
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




