//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Engine - main entry point. Handles the creation of the audio buffers, the additive synthesis section and linking to other dsp modules
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
//No knowledge of GUI, only other audio engine modules and default values in defaults.js
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


import { distort } from './distortion.js';
import { buildBlackmanHarrisWindow } from './oversampling.js';
import { jitter } from './jitter.js';
import { getFFTFunction, getFFT1024, getFFT64k } from './basicFFT.js';
import { ditherSimulation } from './dither.js';
import {zeroLevel, sinePatch, getDefaultPatch} from './defaults.js';


let harmonics = 2000;//Allows 20Hz to have harmonics up to 20KHz??
let decayLengthFactor = 1.4;//Decay length ( in samples) is 1.4 times longer than the -60db decay time - allows for longer tail than RT60 alone
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
            
        if (patch.envMode==1 ){
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


    const maxBufferSize = channels.length>1 ? Math.max(channels[0].bufferSize,channels[1].bufferSize) : channels[0].bufferSize;

    //Create buffer
    let data = [];
    for(let i=0;i<channels.length;i++){
        data.push(new Float32Array(maxBufferSize));
    }
    let audioBuffer = {
        length: maxBufferSize,
        sampleRate: sampleRate,
        numberOfChannels: channels.length,
        data: data
      };
     
      let envelopeBuffers =[];
      let filters =[];
      let oversamplingReports =[];

      let randSeed = Math.random();
      for(let i=0;i<channels.length;i++){
            let c = channels[i];
            let patch = c.patch;
            let b = audioBuffer.data[i];
            let envelopeBuffer =buildEnvelopeBuffer(sampleRate, maxBufferSize, patch.attack, patch.hold, patch.decay, patch.envelopeFilter);
            let filter =null;
            if (patch.filterSlope!=0) 
            {
                filter = buildFilter(sampleRate, maxBufferSize, patch);
            }
            buildHarmonicSeries(patch, sampleRate, b, filter, envelopeBuffer, c.delay0, c.delayN, c.phaseShift0, null, 1);
            
            AddInharmonics(patch, sampleRate, b, envelopeBuffer, c.delayN);

            let oversamplingReport = distort(b, patch, sampleRate, false, true);
            oversamplingReports.push(oversamplingReport);
            jitter(b, sampleRate, patch, false, randSeed);
            envelopeBuffers.push(envelopeBuffer);
            filters.push(filter);
        }
      return {
            buffer:audioBuffer,
            envelopes:envelopeBuffers,
            filters:filters,
            oversamplingReports:oversamplingReports,
            maxValue: getBufferMax(audioBuffer)
      }

}

function scaleAndGetNullBuffer(audioBufferA, audioBufferB, isNormToLoudest, patchList){
    let scaleA =0.99 /Math.max(audioBufferA.maxValue, 0.000001);
    let scaleB =0.99 /Math.max(audioBufferB.maxValue, 0.000001);
    //Normalise buffers - but scale by the same amount - find which is largest and scale to +/-0.99
    let scale = Math.min(scaleA, scaleB);

    //Normalise here to provide just under full scale input to ditherSimulation functions
    if (!isNormToLoudest && scaleA != scaleB){
        if (scale==scaleA) 
        {
            scaleBuffer(audioBufferA.buffer, scaleA);
            scaleBuffer(audioBufferB.buffer, scaleB);
            scale = scaleB;//
        }
        else 
        {
            scaleBuffer(audioBufferB.buffer, scaleB);
            scaleBuffer(audioBufferB.buffer, scaleB);
            scale = scaleA;
        }
    }
    else{
        scaleBuffer(audioBufferA.buffer, scale);
        scaleBuffer(audioBufferB.buffer, scale);
    }
    
    ditherSimulation(audioBufferA.buffer.data[0], patchList[0]);
    if (audioBufferA.buffer.numberOfChannels>1) ditherSimulation(audioBufferA.buffer.data[1], patchList[1]);
    ditherSimulation(audioBufferB.buffer.data[0], patchList[2]);
    if (audioBufferB.buffer.numberOfChannels>1) ditherSimulation(audioBufferB.buffer.data[1], patchList[3]);

    let audioBufferNull = {
        buffer: buildNullTest(audioBufferA.buffer, audioBufferB.buffer)
    }

    
    scaleSquaredSingleBuffer(audioBufferA.buffer.data[0], patchList[0].attenuation);
    if (audioBufferA.buffer.numberOfChannels>1) scaleSquaredSingleBuffer(audioBufferA.buffer.data[1], patchList[1].attenuation);
    scaleSquaredSingleBuffer(audioBufferB.buffer.data[0], patchList[2].attenuation);
    if (audioBufferB.buffer.numberOfChannels>1) scaleSquaredSingleBuffer(audioBufferB.buffer.data[1], patchList[3].attenuation);

    
    let nullMax = getBufferMax(audioBufferNull.buffer);
    audioBufferNull.maxValue = nullMax/scale;
    audioBufferNull.maxValueDBL = 20 * Math.log10(audioBufferNull.maxValue);//convert to dB
    if (audioBufferNull.maxValueDBL>-100){//avoid scaling if null test is close to silent (>-100db)
        scaleBuffer(audioBufferNull.buffer, 0.99 / nullMax);
    }
    return audioBufferNull;
}

//Takes an array of patches and returns the maximum delay in samples for the non-fundamental harmonics
//Quick calc of delay to allow coordination between sound A and sound B even if in stereo - so the null test is valid for any phase offset
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


function scaleBuffer(buffer, scale){
    let max = 0;
    for(let chan=0;chan<buffer.numberOfChannels;chan++){
        let b = buffer.data[chan];
        let bufferSize = b.length;
        for (let i = 0; i < bufferSize; i++) {
            b[i]*=scale;
        }
    }
    return max;
}

function scaleSquaredSingleBuffer(buffer, scale){
    if (scale==1) return;
    scale *= scale;
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] *= scale;
    }   
}

function buildNullTest(bufferA, bufferB){
    let length = Math.min(bufferA.length, bufferB.length);
    let nullData = [];
    for(let i = 0; i < bufferA.numberOfChannels; i++){
        nullData.push(new Float32Array(length));
    }
    let nullTest = {
        length: length,
        sampleRate: bufferA.sampleRate,
        numberOfChannels: bufferA.numberOfChannels,
        data: nullData
      };
    for (let channel = 0; channel < bufferA.numberOfChannels; channel++) {
        var A = bufferA.data[channel];
        var B = bufferB.data[channel];
        let N = nullTest.data[channel];
        for (let i = 0; i < length; i++) {
        N[i] = A[i] - B[i];
        }
    }
    return nullTest;
}

function getBufferMax(buffer){
    let max = 0;
    for(let chan=0;chan<buffer.numberOfChannels;chan++){
        let b = buffer.data[chan];
        let bufferSize = b.length;
        for (let i = 0; i < bufferSize; i++) {
            let val = Math.abs( b[i]);
            if (val>max) max = val;
        }
    }
    return max;
}


//Return object with 3 float arrays,
// samples - the audio samples for one complete cycle
// magnitude - the magnitude of each harmonic
// phase - the phase of each harmonic
function getPreview(referencePatch, filterPreviewSubject, sampleRate){
    let defaultPatch = getDefaultPatch();
    let patch = {
        ...defaultPatch,
        ...referencePatch
    };
    let bufferSize = 1024; //Number of samples
    let virtualSampleRate = bufferSize * (patch.frequency+patch.frequencyFine);//Ensure is one complete per cycle
    let result = _buildPreview(patch, filterPreviewSubject,
        virtualSampleRate, 
        bufferSize,
        false,
        sampleRate/virtualSampleRate);
    result.fft = getFFT1024(result.distortedSamples);
    return result;
}

function getDetailedFFT(samplerate, referencePatch, filterPreviewSubject){
    let defaultPatch = getDefaultPatch();
    let patch = {
        ...defaultPatch,
        ...referencePatch
    };
    const bufferSize = 65536;
    let f = (patch.frequency+patch.frequencyFine);
    let numberOfWavesInBuffer = f * bufferSize/samplerate;
    const adjustedSampleRate = f * bufferSize / Math.round(numberOfWavesInBuffer);//Tweak samplerate to give whole number of cycles in buffer - better FFT

    let result = _buildPreview(patch, filterPreviewSubject,
        adjustedSampleRate, //Ensure is one complete per cycle
        bufferSize,
        true,
        samplerate/adjustedSampleRate);

    result.fft = getFFT64k(result.distortedSamples);
    return result;
}

let window65k =buildBlackmanHarrisWindow(65536); //or kaiserWindow(65536, alpha) low alpha looks bad (side lobes show), high alpha is not as narrow as Blackman-Harris
//relativeSampleRates = is the ratio of the actual sample rate to the virtual sample rate - how much lower the real one is - don't include harmonics above the real Nyquist limit
function _buildPreview(patch, filterPreviewSubject,sampleRate, bufferSize, includeInharmonicsAndDigital= false, relativeSampleRates=1){
    let envelopeBuffer =new Float32Array(bufferSize).fill(1);
    let b = new Float32Array(bufferSize);

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
        //Capture the magnitude and phase of each harmonic - almost exactly like a FFT
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
    buildHarmonicSeries(patch, sampleRate, b, filter, envelopeBuffer, 0, 0, patch.rootPhaseDelay * Math.PI,postProcessor, Math.min(relativeSampleRates,1));
    

    if (includeInharmonicsAndDigital){
        //Add inharmonics but process with Blackman-Harris window to keep FFT shape as clean as possible
        //This if for preview and use in detailed FFT so sounds is unimportant
        const window =bufferSize==65536? window65k : buildBlackmanHarrisWindow(bufferSize)
        AddInharmonics(patch, sampleRate, b, window  , 0);
    } 

    let distorted =new Float32Array(b);
    distort(distorted, patch, sampleRate, true, includeInharmonicsAndDigital);

    if (includeInharmonicsAndDigital) {
        jitter(distorted, sampleRate, patch, true, Math.random());
        ditherSimulation(distorted, patch, sampleRate);
    }
    
    return {
        samples:b,
        magnitude:new Float32Array(magnitude),
        phase:new Float32Array(phase),
        mean:b.reduce((a, b) => a + b, 0) / b.length, //average value
        max:getMax(b),
        min:getMin(b),
        filter:filter,
        patch:patch,
        distortedSamples:distorted,
        virtualSampleRate:sampleRate
    };
}

function getMax(buffer){
    let max = 0;
    for (let i = 0; i < buffer.length; i++) {
        let val = Math.abs(buffer[i]);
        if (val>max) max = val;
    }
    return max;    
}
function getMin(buffer){   
    let min = 0;
    for (let i = 0; i < buffer.length; i++) {
        let val = Math.abs(buffer[i]);
        if (val<min) min = val;
    }
    return min;
}

let THDDefaultPatch = {
    ...getDefaultPatch()
}
let THDSinePatch ={
    ...sinePatch
}
function getTHDPercent(referencePatch){
    if (referencePatch.distortion==0) return 0;

    let patch = {
        ...THDDefaultPatch,//all values covered
        ...referencePatch,//distortion and oversampling parameters copied
       ...THDSinePatch //Harmonic series set to sine wave
    };

    //Filter parameters ignored - no filter created
    //Envelope parameters ignored - rectangular envelope created
    //inharmonic parameters ignored - no inharmonics processed
    //phase ignored - delay and phaseshift passed as zero
    patch.frequency=1000;//1khz signal
    patch.frequencyFine=0;//1khz signal


    let bufferSize = 1024; //Number of samples
    let sampleRate = bufferSize * (patch.frequency);
    let envelopeBuffer =[];
    let b = [];
    for (let i = 0; i < bufferSize; i++) {
        envelopeBuffer.push(1);
        b.push(0);
    }

    buildHarmonicSeries(patch, sampleRate, b, null, envelopeBuffer, 0, 0, 0);
    
    distort(b, patch, sampleRate, true, false);
    //No jitter - don't include in THD calculation

    let fft = getFFT1024(b);

    //Caluclate THD
    let total = 0;
    let harmonicsToInclude = 10;
    for (let i = 2; i < harmonicsToInclude+2; i++) {
        let vn = fft.magnitude[i];
        total += vn * vn;
    }
    let THD = Math.sqrt(total) / fft.magnitude[1];
    return THD*100;
}


let THDStepsPerOctave = 4;
let THDEfficiencyFactor = 2; //must be power of 2 Adjust the resolution and FFT Size to be more efficient with calculation times
let THDfftResolution = 2.5;//Hz Nominal resolution - will be adjusted by Efficiency factor
let THDfftSize = 16384; //will be adjusted by Efficiency factor
function getTHDGraph(referencePatch){
    if (referencePatch.distortion==0) return {
        frequencies:new Float32Array(0),
        thd:new Float32Array(0)
    };

    let patch = {
        ...THDDefaultPatch,//all values covered
        ...referencePatch,//distortion and oversampling parameters copied
       ...THDSinePatch //Harmonic series set to sine wave
    };
    patch.frequencyFine=0;

    //calculate equally distributed frequencies on a log2 scale, from 20Hz to 20KHz with half octave steps
    let freqStepSize = THDfftResolution*THDEfficiencyFactor;//Hz for the eventual FFT and therefore use for the test sine waves ()
    let bufferSize = THDfftSize/THDEfficiencyFactor; //Number of samples
    let fftFunc = getFFTFunction(bufferSize);
    let sampleRate = bufferSize * freqStepSize;
    let frequencies = [];
    let f = 20;
    let factor = Math.pow(2,1/THDStepsPerOctave);//Geometric increase to cover given number of steps per octave
    while (f<=20000 && f<=sampleRate/2){
        frequencies.push(Math.round(f/freqStepSize)*freqStepSize);//To nearest frequency step
        f*=factor;
    }
    let envelopeBuffer =[];
    for (let i = 0; i < bufferSize; i++) {
        envelopeBuffer.push(1);
    }

    let harmonicsToInclude = 10;
    let maxBin = bufferSize/2-1;
    let THD ={
        frequencies:new Float32Array(frequencies.length),
        thd:new Float32Array(frequencies.length)
    }
    
    ;
    for(let i=0;i<frequencies.length;i++){
        patch.frequency=frequencies[i];
        let b = new Float32Array(bufferSize);
        buildHarmonicSeries(patch, sampleRate, b, null, envelopeBuffer, 0, 0, 0);
        distort(b, patch, sampleRate, true, false);
        let fft = fftFunc(b);
        let total = 0;
        let fundamentalBin = Math.round(patch.frequency/freqStepSize)
        if (fundamentalBin>maxBin) break;
        let lastBin = Math.min(Math.round((harmonicsToInclude+1)*fundamentalBin),maxBin);
        for (let i = fundamentalBin*2; i <= lastBin; i+=fundamentalBin) {
            let vn = fft.magnitude[i];
            total += vn * vn;
        }
        THD.frequencies[i] = patch.frequency;
        THD.thd[i] = Math.sqrt(total) / fft.magnitude[fundamentalBin] *100;
    }

    return THD;
}



function getDigitalPreview(patch, sampleRate){
    var ditherDR = getDitherDynamicRange(patch, sampleRate);
    return {
        sampleRate:sampleRate,
        //Linearity analysis - Range of average output for input values equally spaced from 0 to 1 inclusive
        ditherLinear:getDitherLinearityData(patch, 40, 20000),

        //Average results for dynamic range across frequency range
        ditherDRF:ditherDR.f,
        ditherDRdB:ditherDR.db,

        //odd number of sample values 
        jitter:new Float32Array([0,1,2,4,6,7,8,7,5,4,2,1,0])
    }
}

function getDitherLinearityData(patch, valueCount, repeatCount){
    //generate tests signal for dither linearity analysis - a buffer with values from 0 to 1 inclusive
    //There are 'valueCount' number of steps between 0 and 1 and each value is repeated 'repeatCount' times
    let bufferSize = valueCount*repeatCount;
    let b = new Float32Array(bufferSize);
    let step = 1/(valueCount-1);    
    let x=0;
    for (let i = 0; i < valueCount; i++) {
        let value = i*step;
        for (let j = 0; j < repeatCount; j++) {
            b[x++] = value;
        }
    }

    let ditherPatch = {...patch};
    ditherPatch.digitalDitherFakeness=0;
    ditherPatch.digitalDitherShaping=0;
    ditherPatch.digitalBitDepth=1;


    ditherSimulation(b, ditherPatch);//Do the dithering

    x=0;
    let results = new Float32Array(valueCount); 
    for (let i = 0; i < valueCount; i++) {
        let value = 0;
        for (let j = 0; j < repeatCount; j++) {
            value += b[x++];
        }
        results[i] = value/repeatCount;
    }
    return results;
}


function getDitherDynamicRange(patch, sampleRate){
    //Prime numbers to give a range of levels in the 
    //let harmonics = [2,3,5,7,11,13,17,19,23,29,31,37,41,43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101];
    let fftSize =1024;
    let fftSize2 = fftSize/2;
    let outputCount =50;
    let fCount =15;

    let fftFunc = getFFTFunction(fftSize);
    let accumulation = new Float32Array(fftSize2);
    let b = new Float32Array(fftSize);
    for(let i=0;i<fCount;i++){
        //Fill buffer with a sine wave of the given harmonic 
        const bin = i+1;
        let w = 2* Math.PI * bin/fftSize;
        for(var j=0;j<fftSize;j++){
            b[j] = Math.sin(w*j);
        }
        ditherSimulation(b, patch);
        let fft = fftFunc(b);
        for (let i = 0; i < fftSize2; i++) {
            if (i==bin)continue; //skip the bin of the given harmonic
            accumulation[i] += fft.magnitude[i];
        }
    }
    const scale = 1/fCount;
    const scaleLow = 1/(fCount-1);
    for (let i = 0; i < fftSize2; i++) {
        accumulation[i] *= i<fCount? scaleLow : scale;
    }
    

    let lastBin = 1;//lastBin will be skiped. bin 0 is DC
    const maxF =20000;
    const minF =10;
    const power10Scale = Math.log10(maxF/minF)/outputCount;
    const fScale =sampleRate/fftSize;
    let logValues=[]
    let logFreqs =[];
    for(let i=0;i<outputCount;i++){
        let f = minF*Math.pow(10,i*power10Scale);
        let nextBin = Math.round(f/fScale);

        if (nextBin<=lastBin) continue; //Check if there are any bins in the range

        nextBin = Math.min(nextBin,fftSize2);
        let value = 0;
        for (let k = lastBin; k < nextBin; k++) {
            value += accumulation[k];
        }
        value /= (nextBin-lastBin);
        logValues.push(value);
        logFreqs.push(f);
        lastBin = nextBin;
        if (nextBin>=fftSize2) break;
    }

    for(let i=0;i<logValues.length;i++){
        logValues[i] =Math.max(-144, 20 * Math.log10(logValues[i]));
    }   

    return {
        f:new Float32Array(logFreqs),
        db:new Float32Array(logValues)
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
        let envValues = new Float32Array(bufferSize); // Array to store env values - ensure starts at zero
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
            envValues[i] = y;
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

        let envValues = new Float32Array(bufferSize); // Array to store env values
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
            envValues[i]=1/(20*Math.pow(2,y) * pi2_sr);// convert to rads/sample freq = 20*Math.pow(2,y), w0 = 2piF/sampleRate then store 1/w0
        }
        let order2 = patch.filterSlope/6*2; //2n, n=filterOrder, filterOrder = filterSlope/6
        const passBandEnd = Math.pow(1/(0.994*0.994)-1,1/order2); //inverse of butterworth equation, 0.994 is point where response is down -0.05db
        const stopBandEnd= Math.pow(1/(zeroLevel*zeroLevel)-1,1/order2); //inverse of butterworth equation, zeroLevel when response is consider zero
        
        const lutSize = 10000;
        let lut =new Float32Array(lutSize);
        const scale = (stopBandEnd-passBandEnd)/lutSize;
        for (let i = 0; i < lutSize; i++) {
            lut[i] = Math.pow(1 + Math.pow(passBandEnd + i*scale ,order2),-0.5);
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
function buildHarmonicSeries(patch,  sampleRate, b, filter, envelopeBuffer, delay0, delayN, phaseShift0, postProcessor, relativeSampleRates) {
    const nyquistW = relativeSampleRates * (0.49 * 2 * Math.PI) * (1+patch.aliasing);//Nyquist limit in radians per sample
    const rootW = (patch.frequency+patch.frequencyFine)  * 2 * Math.PI  / sampleRate;
    const sinCos = patch.sinCos*Math.PI/2;
    if (postProcessor) postProcessor(0, 0, 0, 0, 0);//process for DC, n=0
    const bufferSize=b.length;

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





export { 
    getAudioBuffer, 
    scaleAndGetNullBuffer,
    preMaxCalcStartDelay,

    getPreview,
    getDigitalPreview,  

    getDetailedFFT, 
    getTHDPercent, 
    getTHDGraph, 

};


