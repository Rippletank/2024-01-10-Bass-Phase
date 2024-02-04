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
    patch,
    patchR,
    maxPreDelay
    ) {
    //Calculate max delay in samples
    
    let channels=[{patch:patch}];
    if (patchR) channels.push({patch:patchR});

    channels.forEach(c=>{
        let patch = c.patch;
        let delay0 = maxPreDelay;
        let delayN = maxPreDelay;
        let phaseShift0 = 0;
            
        if (envMode==1 ){
            //Mode1 - delay envelopes by the same as the phase delay
            let delay = Math.abs(patch.rootPhaseDelay) * 0.5 * sampleRate/(patch.frequency+patch.frequencyFine) ;
            delay0 += patch.rootPhaseDelay<0 ? 0 : delay;
            delayN += patch.rootPhaseDelay<0 ? delay : 0;
        }
        else{
            //Mode2 - Envelope fixed, shift phase in place
            phaseShift0 = patch.rootPhaseDelay * Math.PI;
        }
    
        let bufferSize = Math.round(sampleRate 
            * (patch.attack + patch.hold + decayLengthFactor * patch.decay + patch.envelopeFilter*0.0003) + delay0 + delayN ); //Allow for attack and 1.5* decay time + extra for filter smoothing
    
            
        c.bufferSize=bufferSize;
        c.delay0=delay0;
        c.delayN=delayN;
        c.phaseShift0=phaseShift0;
    });


    maxBufferSize = channels.length>1 ? Math.max(channels[0].bufferSize,channels[1].bufferSize) : channels[0].bufferSize;

    //Create buffer
    let audioBuffer = new AudioBuffer({
        length: maxBufferSize,
        sampleRate: sampleRate,
        numberOfChannels: channels.length
      });
     
      let envelopeBuffers =[];
      let filters =[];

      for(let i=0;i<channels.length;i++){
            let c = channels[i];
            let patch = c.patch;
            let b = audioBuffer.getChannelData(i);
            let envelopeBuffer =buildEnvelopeBuffer(sampleRate, maxBufferSize, patch.attack, patch.hold, patch.decay, patch.envelopeFilter);
            let filter =null;
            if (patch.filterSlope!=0) 
            {
                filter = buildFilter(sampleRate, maxBufferSize, patch);
            }
            buildHarmonicSeries(patch, sampleRate, b, filter, envelopeBuffer, c.delay0, c.delayN, c.phaseShift0);
            
            AddInharmonics(patch, sampleRate, b, envelopeBuffer, c.delayN);

            distort(b, patch, sampleRate, false);
            envelopeBuffers.push(envelopeBuffer);
            filters.push(filter);
        }
      return {
            buffer:audioBuffer,
            envelopes:envelopeBuffers,
            filters:filters
      }

}

//takes an array of patches and returns the maximum delay in samples for the non-fundamental harmonics
function preMaxCalcStartDelay(patches, sampleRate){
    let maxDelay = 0;
    for (let i = 0; i < patches.length; i++) {
        let patch = patches[i];
        //Only matters if the higher harmonic are going to be delayed ie, the rootPhaseDelay is negative
        if(!patch || patch.rootPhaseDelay>=0) continue;
        let delay = Math.abs(patch.rootPhaseDelay) * 0.5 * sampleRate/(patch.frequency+patch.frequencyFine);
        if (delay>maxDelay) maxDelay = delay;
    }
    return maxDelay;

}


//Return object with 3 float arrays,
// samples - the audio samples for one complete cycle
// magnitude - the magnitude of each harmonic
// phase - the phase of each harmonic
function getPreview(referencePatch, filterPreviewSubject){
    let defaultPatch = getDefaultPatch();
    let patch = {
        ...defaultPatch,
        ...referencePatch
    };
    let bufferSize = 1024; //Number of samples
    return _buildPreview(patch, filterPreviewSubject,
        bufferSize * (patch.frequency+patch.frequencyFine), //Ensure is one complete per cycle
        bufferSize,
        false);
}


function _buildPreview(patch, filterPreviewSubject,sampleRate, bufferSize, includeInharmonics= false){
    let envelopeBuffer =[];
    let b = [];
    for (let i = 0; i < bufferSize; i++) {
        envelopeBuffer.push(1);
        b.push(0);
    }

    let filter =null;
    if (patch.filterSlope>0 && filterPreviewSubject>0){
        let f=0;
        switch (filterPreviewSubject){
            case 1:
                f=patch.filterF1;
                break;
            case 2:
                f=patch.filterF2;
                break;
            case 3:
                f=patch.filterF3;
                break;
        }
        patch.filterF1=f;
        patch.filterF2=f;
        patch.filterF3=f;
        filter = buildFilter(sampleRate, bufferSize, patch);
    }
    let magnitude = [];
    let phase = [];
    let postProcessor = (n, w, level, phaseShift)=>{
        let l = level;
        if (filter){
            let c=w *filter.invW0[filter.invW0.length/2];
            if (c>=filter.stopBandEnd) 
            {
                l=0;
            }
            else if (c>filter.passBandEnd)
            {
                //Use lookup table for filter response in transition band
                l*=filter.lut[Math.trunc((c-filter.passBandEnd)*filter.lutScale)]; 
            }
        }
        magnitude.push(l);
        phase.push(phaseShift);
    }
    buildHarmonicSeries(patch, sampleRate, b, filter, envelopeBuffer, 0, 0, patch.rootPhaseDelay * Math.PI,postProcessor);
    

    if (includeInharmonics){
        let window =[];
        let a0 = 0.35875;
        let a1 = 0.48829;
        let a2 = 0.14128;
        let a3 = 0.01168;
        for (let i = 0; i < bufferSize; i++) {
            //Blackman-harris window (bufferSize-1) to ensure 1 at end
            //https://en.wikipedia.org/wiki/Window_function
            window.push( 
                a0 - a1 * Math.cos(2 * Math.PI * i / (bufferSize - 1)) 
                    + a2 * Math.cos(4 * Math.PI * i / (bufferSize - 1)) 
                    - a3 * Math.cos(6 * Math.PI * i / (bufferSize - 1))
            );
        }    
        AddInharmonics(patch, sampleRate, b, window, 0);
    } 

    let distorted =[...b];
    distort(distorted, patch, sampleRate, true);

    return {
        samples:b,
        magnitude:magnitude,
        phase:phase,
        mean:b.reduce((a, b) => a + b, 0) / b.length, //average value
        max:Math.max(...b),
        min:Math.min(...b),
        filter:filter,
        patch:patch,
        distortedSamples:distorted,
        virtualSampleRate:sampleRate
    };
}



function getBufferForLongFFT(samplerate, referencePatch){
    let defaultPatch = getDefaultPatch();
    let patch = {
        ...defaultPatch,
        ...referencePatch
    };
    const bufferSize = 65536;
    let f = (patch.frequency+patch.frequencyFine);
    let numberOfWavesInBuffer = f * bufferSize/samplerate;
    const adjustedSampleRate = f * bufferSize / Math.round(numberOfWavesInBuffer);//Tweak samplerate to give whole number of cycles in buffer - better FFT

    return _buildPreview(patch, filterPreviewSubject,
        adjustedSampleRate, //Ensure is one complete per cycle
        bufferSize,
        true);
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
        let envValues = [0]; // Array to store env values - ensure starts at zero
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
        const f1 = patch.filterF1 ;
        const f2 = patch.filterF2;
        const f3 = patch.filterF3;
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

        let envValues = []; // Array to store env values
        for (let i = 0; i < bufferSize; i++) {
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
            envValues.push(1/(20*Math.pow(2,y) * pi2_sr));// convert to rads/sample freq = 20*Math.pow(2,y), w0 = 2piF/sampleRate then store 1/w0
        }
        let order2 = patch.filterSlope/6*2; //2n, n=filterOrder, filterOrder = filterSlope/6
        const passBandEnd = Math.pow(1/(0.994*0.994)-1,1/order2); //inverse of butterworth equation, 0.994 is point where response is down -0.05db
        const stopBandEnd= Math.pow(1/(zeroLevel*zeroLevel)-1,1/order2); //inverse of butterworth equation, zeroLevel when response is consider zero
        
        const lutSize = 10000;
        let lut = [];
        const scale = (stopBandEnd-passBandEnd)/lutSize;
        for (let i = 0; i < lutSize; i++) {
            lut.push(Math.pow(1 + Math.pow(passBandEnd + i*scale ,order2),-0.5));
        }
        
        return {
           invW0: envValues, //array of 1/w0 for each sample w0 = 2*pi*f/sampleRate
           order2:order2,
           lut:lut,
           lutScale:1/scale,
           sampleRate:sampleRate,//makes it easier for drawing the filter response
           passBandEnd: passBandEnd,
           stopBandEnd: stopBandEnd
        };
}




//Generate the harmonic series
function buildHarmonicSeries(patch,  sampleRate, b, filter, envelopeBuffer, delay0, delayN, phaseShift0, postProcessor) {
    const nyquistW = 0.49 * 2 * Math.PI;//Nyquist limit in radians per sample
    const rootW = (patch.frequency+patch.frequencyFine)  * 2 * Math.PI  / sampleRate;
    const sinCos = patch.sinCos*Math.PI/2;
    if (postProcessor) postProcessor(0, 0, 0, 0, 0);//process for DC, n=0
    bufferSize=b.length;

    //Balance settings
    const firstLevel = patch.balance<=0 ? 1 : (patch.balance==1 ? 0 : Math.pow(10,-3.5*patch.balance*patch.balance)); //-75db
    const higherLevel = patch.balance>=0 ? 1 : (patch.balance==-1 ? 0 : Math.pow(10,-3.5*patch.balance*patch.balance)); //-75db

    //Alt needed for triangle wave causing polarity to flip for each successive harmonic
    const altW = patch.altW * Math.PI;   
    const altOffset = patch.altOffset * Math.PI *0.5; 
    const delayScale = (delay0-delayN) * rootW * patch.higherHarmonicRelativeShift;//Either Delay0 or delayN will be zero
    for (let n = 1; n < harmonics; n++) {
        let w = rootW * n;
        if (w>=nyquistW) return;//Nyquist limit
        let level = n==1 ? firstLevel : higherLevel;
        let isEven = n % 2 == 0;
        let delay = n==1 ? delay0 : delayN + delayScale/w;
        let phaseShift = phaseShift0 * (n==1 ? 1 :patch.higherHarmonicRelativeShift);
        if (isEven){
            level *= patch.evenLevel * ((Math.sin(n*altW - altOffset)-1) * patch.evenAlt + 1) * Math.pow(n,-patch.evenFalloff );
        }
        else{

            level*=patch.oddLevel * ((Math.sin(n*altW- altOffset)-1) * patch.oddAlt + 1) * Math.pow(n,-patch.oddFalloff);  
        }        
        mixInSine( b, w, filter,  envelopeBuffer, level ,delay, phaseShift + sinCos );
        if (postProcessor) postProcessor(n, w, level, phaseShift+ sinCos + delay * w);
    }
}

let pythagoreanScale=[1, 256/243, 9/8, 32/27, 81/64, 4/3, /*1024/729,*/ 729/512, 3/2, 128/81, 27/16, 16/9, 243/128, 2];
let ptolemysScale=[   1, 256/243, 9/8, 32/27, 5/4,   4/3, /*1024/729,*/ 729/512, 3/2, 128/81, 27/16, 16/9, 15/8, 2];
function AddInharmonics(patch, sampleRate, b, envelopeBuffer, delayN){
    if (patch.inharmonicALevel>-91){
        let level = Math.pow(10,patch.inharmonicALevel/20); 
        let w = patch.inharmonicAFrequency * 2 * Math.PI  / sampleRate;  //Plain Frequency
        mixInSine( b, w, null,  envelopeBuffer, level ,delayN, 0);
    }
    if (patch.inharmonicBLevel>-91){
        let level = Math.pow(10,patch.inharmonicBLevel/20); 
        let f = patch.frequency+patch.frequencyFine;
        //Equal temperament
        let w = f * Math.pow(2, patch.inharmonicBSemitones/12) // (2^(1/12))^semitones
            * 2 * Math.PI  / sampleRate; 
        mixInSine( b, w, null,  envelopeBuffer, level ,delayN, 0);
    }
    if (patch.inharmonicCLevel>-91){
        let level = Math.pow(10,patch.inharmonicCLevel/20); 
        let f = patch.frequency+patch.frequencyFine;
        //Just intonation
        let w = f * ptolemysScale[patch.inharmonicCSemitones % 12] //semitones
                * (1+Math.floor(patch.inharmonicCSemitones/12)) //octaves if needed
        * 2 * Math.PI  / sampleRate; 
        mixInSine( b, w, null,  envelopeBuffer, level ,delayN, 0);
    }
}



//Generate a single sine wave and mix into the buffer
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
    let theta = phaseOffset //Phase accumulator 
            + (((Math.floor(delay) + 1 - delay) % 1) -1) * w; //correction for fractional delay and also -1 to allow theta to be incremented at start of loop
    let env = -1;
    const bufferSize = buffer.length;
    for (let i = 0; i < bufferSize; i++) {
        if (i >= delay)   {
            env++;//call here to advance even if level is zero
            //Phase accumulator
            theta += w;//call here to allow continue to still cause increments
            let l=envelopeBuffer[env];
            if (l<zeroLevel) continue;
            if (filter){
                let c=w *filter.invW0[env];
                if (c>=filter.stopBandEnd) continue;
                if (c>filter.passBandEnd)
                {
                    //Use lookup table for filter response in transition band
                    l*=filter.lut[Math.trunc((c-filter.passBandEnd)*filter.lutScale)]; 
                }
            }
            buffer[i] += amplitude * l * Math.sin(theta) ;
        }
    }
}

function getBufferMax(buffer){
    let max = 0;
    for(let chan=0;chan<buffer.numberOfChannels;chan++){
        let b = buffer.getChannelData(chan);
        let bufferSize = buffer.length;
        for (let i = 0; i < bufferSize; i++) {
            let val = Math.abs( b[i]);
            if (val>max) max = val;
        }
    }
    return max;
}

function scaleBuffer(buffer, scale){
    let max = 0;
    for(let chan=0;chan<buffer.numberOfChannels;chan++){
        let b = buffer.getChannelData(chan);
        let bufferSize = buffer.length;
        for (let i = 0; i < bufferSize; i++) {
            b[i]*=scale;
        }
    }
    return max;
}

function buildNullTest(bufferA, bufferB){
    let length = Math.min(bufferA.length, bufferB.length);
    let nullTest = new AudioBuffer({
        length: length,
        sampleRate: bufferA.sampleRate,
        numberOfChannels: bufferA.numberOfChannels
      });
    for (let channel = 0; channel < bufferA.numberOfChannels; channel++) {
        var A = bufferA.getChannelData(channel);
        var B = bufferB.getChannelData(channel);
        let b = nullTest.getChannelData(channel);
        for (let i = 0; i < length; i++) {
        b[i] = A[i] - B[i];
        }
    }
    return nullTest;
}




