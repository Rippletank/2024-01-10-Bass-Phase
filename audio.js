
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
//No knowledge of GUI, only knows about AudioBuffer from WebAudioAPI and default values in defaults.js
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


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
      let filter =null;
      if (patch.filterSlope!=0) 
      {
        filter = buildFilter(sampleRate, bufferSize, patch);
      }
      buildHarmonicSeries(patch, sampleRate, b, filter, envelopeBuffer, delay0, delayN, phaseShift0);
      return {
            buffer:audioBuffer,
            envelope:envelopeBuffer,
            filter:filter
      }

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
    buildHarmonicSeries(patch, sampleRate, b, null, envelopeBuffer, 0, 0, patch.rootPhaseDelay * Math.PI,postProcessor);
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
        const a = 1/Math.max(1,filter);

        let isHold = false;
        let holdSamples = hold * sampleRate;
        let isDecay = false;
        const attackRate = 1 / (attack * sampleRate); //Linear attack
        const decayLambda = ln1024 / (decay * sampleRate); //Exponential decay -> decay is time in seconds to get to 1/1024 (-60db)of start value
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


//Generate envelope of filter with cutoff frequency in radians per sample, w
//Don't worry if longer than bufferSize since audio level will be at zero by then
function buildFilter(
    sampleRate, //samples per second
    bufferSize,
    patch
    ){
        let isHold = false;
        let isDecay = false;
        let isAttack = true;
        const pi2_sr = 2 * Math.PI / sampleRate;
        const f1 = 20*Math.pow(2,patch.filterF1) * pi2_sr;
        const f2 = 20*Math.pow(2,patch.filterF2) * pi2_sr;
        const f3 = 20*Math.pow(2,patch.filterF3) * pi2_sr;
        const attackSamples = patch.attackF * sampleRate;
        const attackRate = (f2-f1) / attackSamples; //Linear attack
        const holdSamples =attackSamples + patch.holdF * sampleRate;
        let decaySamples = patch.decayF * sampleRate;
        const decayRate = (f3-f2) / (decaySamples); //Linear attack
        decaySamples += holdSamples;
        
        //Envelope Smoothing filter
        let x=f1;
        let y=f1;
        const a = 1/Math.max(1,patch.envelopeFilter);

        let envValues = [1/y]; // Array to store env values
        for (let i = 1; i < bufferSize; i++) {
            if (isHold){
                if (i >= holdSamples){
                    isHold = false;
                    isDecay = true;
                }
            }
            else if (isDecay){
                x += decayRate; 
                if (i >= decaySamples){
                    isDecay = false;
                }
            }
            else if (isAttack)
            {
                x += attackRate; 
                if (i >= attackSamples){
                    //switch to hold stage if hold is non zero
                    isAttack=false;
                    isHold = holdSamples>0;
                    isDecay = holdSamples==0;
                    x=f2;
                }
            }
            //Band limit envelope 1-pole IIR low pass
            y +=  a * (x - y);
            envValues.push(1/y);
        }
        let order2 = patch.filterSlope/6*2; //2n, n=filterOrder, filterOrder = filterSlope/6
        return {
           invW0: envValues, //array of 1/w0 for each sample w0 = 2*pi*f/sampleRate
           order2:order2,
           sampleRate:sampleRate,//makes it easier for drawing the filter response
           passBandEnd: Math.pow(1/(0.994*0.994)-1,1/order2), //inverse of butterworth equation, 0.994 is point where response is down -0.05db
           stopBandEnd: Math.min(1/pi2_sr, Math.pow(1/(zeroLevel*zeroLevel)-1,1/order2)), //inverse of butterworth equation, zeroLevel when response is consider zero
        };
}




//Generate the harmonic series
function buildHarmonicSeries(patch,  sampleRate, b, filter, envelopeBuffer, delay0, delayN, phaseShift0, postProcessor) {
    const nyquistW = 0.49 * 2 * Math.PI;//Nyquist limit in radians per sample
    const rootW = patch.frequency * 2 * Math.PI  / sampleRate;
    const sinCos = patch.sinCos*Math.PI/2;
    if (postProcessor) postProcessor(0, 0, 0, 0, 0);//process for DC, n=0
    bufferSize=b.length;

    //Alt needed for triangle wave causing polarity to flip for each successive harmonic
    const altW = patch.altW * Math.PI;   
    const altOffset = patch.altOffset * Math.PI *0.5; 
    const delayScale = (delay0-delayN) * rootW * patch.higherHarmonicRelativeShift;//Either Delay0 or delayN will be zero
    for (let n = 1; n < harmonics; n++) {
        let w = rootW * n;
        if (w>=nyquistW) return;//Nyquist limit
        let level = 0;
        let isEven = n % 2 == 0;
        let delay = n==1 ? delay0 : delayN + delayScale/w;
        let phaseShift = phaseShift0 * (n==1 ? 1 :patch.higherHarmonicRelativeShift);
        if (isEven){
            level = patch.evenLevel * ((Math.sin(n*altW - altOffset)-1) * patch.evenAlt + 1) * Math.pow(n,-patch.evenFalloff );
        }
        else{

            level=patch.oddLevel * ((Math.sin(n*altW- altOffset)-1) * patch.oddAlt + 1) * Math.pow(n,-patch.oddFalloff);  
        }        
        mixInSine( b, w,filter,  envelopeBuffer, level ,delay, phaseShift + sinCos );
        if (postProcessor) postProcessor(n, w, level, phaseShift+ sinCos + delay * w);
    }
}


//Generate a single sine wave and mix into the buffer
const smallestLevel=-100;//db
const zeroLevel=Math.pow(10,smallestLevel/20);//-100db
function mixInSine(
    buffer, 
    w, //Hz 
    filter,
    envelopeBuffer,
    amplitude, // 0..1
    delay, //in samples for this frequency - envelope start will be delayed. Phase counter will not start until envelope starts
    phaseOffset
    ) {
        if (Math.abs(amplitude)<zeroLevel) return;
    let theta = phaseOffset + (Math.floor(delay) + 1 - delay) * w; //Phase accumulator + correction for fractional delay
    let env = -1;
    const bufferSize = buffer.length;
    for (let i = 0; i < bufferSize; i++) {
        if (i >= delay)   {
            env++;//call here to advance even if level is zero
            //Phase accumulator
            theta += w;
            let l=envelopeBuffer[env];
            if (l<zeroLevel) continue;
            if (filter){
                let c=w *filter.invW0[env];
                //if (c>filter.stopBandEnd) continue;
                //if (c>filter.passBandEnd)
                {
                    l*=Math.pow(1 + Math.pow(c,filter.order2),-0.5); 
                }
            }
            buffer[i] += amplitude * l * Math.sin(theta) ;
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




