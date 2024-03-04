//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of Audio engine - handles jitter simulation
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
//Code to simulate ADC and DAC jitter, including periodic jitter for ADC (because it was easiest to implement)
//
//Uses filter kernel code (blackman-harris) from oversampling.js and values in patch from defaults.js
//
//Wikipedia for Lagrange interpolation, and Blackman-Harris window for the sinc filter (see oversampling.js for further references)
//
//Validation for using Lagrange interpolation instead of sinc (which didn't work anyway)
//https://www.rle.mit.edu/dspg/documents/ThesisJeremy.pdf
// via https://www.reddit.com/r/DSP/comments/thlum/whittakershannon_interpolation_for_unevenly/
//
//Interesting article on general idea, but method (oversampling 100x) not implemented here
//https://www.sereneaudio.com/blog/what-does-jitter-sound-like
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


import { downsample, generateBlackmanHarrisFilterKernel } from './oversampling.js';
import { SeededSplitMix32Random } from './gaussianRandom.js';


//outBuffer length assumed to be inBuffer.length * some constant
const jitterOversampling = 3;//FIXED DON~T CHANGE
const jitterFactor=0.25;//Maximum size of jitter in samples - 0.25 is 1/4 sample period at lower sample rate before upsampling
const DACFactor=2;//0.8;
const ADCFactor=2;
const periodicFactor=3;
const periodJitterFrequency = 37;
const jitterDownsampleFilter = generateBlackmanHarrisFilterKernel(0.5/jitterOversampling, 30*jitterOversampling);
function jitter(inBuffer, sampleRate, patch, isCyclic, randomSeed)
{
    if (!patch.jitterADC && !patch.jitterDAC && !patch.jitterPeriodic)  return ;
    const DACAmount = patch.jitterDAC*jitterFactor * DACFactor;
    const ADCAmount = patch.jitterADC*ADCFactor*jitterFactor;
    const periodicAmount = patch.jitterPeriodic*periodicFactor*jitterFactor;
    let rand = new SeededSplitMix32Random(randomSeed)//ensure jitter is the same on both channels in stereo so reuse same seed
    const length = inBuffer.length;
    const os = jitterOversampling;
    const outLength = length * os;
    const outBuffer = new Float32Array(outLength);

    //Maintain 4 points,
    //For ADC interpolation:
    //y1, y2, y3 are interpolation points - where shape is maintained but point of sample is shifted around y2 - so y2 is "jittered"
    //x1, x2, x3 are considered to be -1, 0, 1 - ie fixed in time. x is the jittered sample point for 
    //For DAC interpolation:
    //x0, x1, x2 are jittered to simulate playback jitter
    //Samples are taken from the Lagrange polynomial at x=0 and points either side
    let x0=-1
    let x1=0;
    let x2=1; 
    let y0=0;
    let y1=0;
    let y2=0;
    
    let errorCount =0;

    const periodicW = 2*Math.PI*periodJitterFrequency/sampleRate;
    //Do extra steps at start and end to allow for cyclic buffer to collect wrapped values
    let lastT2=0;
    let lastX3=2;
    for(let i=(isCyclic?-2 : 0 );i<length;i++){
        let outI=i*os+1;//The sync point to align samples when downsampling is offset by +1    so zero stuffing like [0,S,0] instead of [S,0,0]
        
        
        let y3=0;


        let doCalc = true;
        if (isCyclic) {
            // Wrap edge values
            y3 = inBuffer[(length + i + 2) % length];
            doCalc = i>=0;
        } else
        {
            // Set edge values to zero
            y3 = i + 2 < length ? inBuffer[i + 2] : 0;
        }

        //ADC simulation - waveform is unchanged, but the sample point from that waveform is jittered

        let t2 =  -100;
        //Calculate sample time offset for y2 from integer point
        while(t2<lastT2-1) //Don't overlap going backwards - fudge to avoid blowing up (fixed interval, here, isn't as fragile but...)
        {
            t2=rand.nextGaussian() * ADCAmount;//-1<->+1 +-amount
        }
        lastT2=t2;


        //Core Lagrange interpolation
        // x values fixed 
        // let y = ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
        //        + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
        //        + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;
        //Shifted for y1,y2,y3
        // let y = ((t - x2) * (t - x3) / ((x1 - x2) * (x0 - x3))) * y1
        //        + ((t - x1) * (t - x3) / ((x2 - x1) * (x2 - x3))) * y2
        //        + ((t - x1) * (t - x2) / ((x3 - x1) * (x3 - x2))) * y3;
        //Using x1=-1, x2=0, x3=1
        y2 = (t2  * (t2 - 1) / 2) * y1
        - (t2 + 1) * (t2 - 1) * y2
        + ((t2 + 1) * t2 / 2) * y3;

        //DAC simulation - sample levels are the same but  the sample point where these samples are positioned in time is jittered

        //Random DAC jitter
        let x3 = -100; 

        while(x3<lastX3-1+0.2) //Don't overlap going backwards - fudge to avoid blowing up. As x values are varying, the interval is not constant so it blows up easily!
        {
            x3=2+rand.nextGaussian() * DACAmount;//-1<->+1 +-amount
        }
        lastX3 = x3;
        
        //Periodic DAC jitter
        if (periodicAmount>0){
            x3 += periodicAmount * Math.sin(periodicW*i);
        }

        if (doCalc){
            //Fill in points either side of x1 (j=0), The sync point to align samples when downsampling is offset by +1
            //Lagrange interpolation - 3 points x varies depending on jitter
            const d1= y0/((x0 - x1) * (x0 - x2));
            const d2= y1/((x1 - x0) * (x1 - x2));
            const d3= y2/((x2 - x0) * (x2 - x1));
            for (let j=-1;j<=1;j++){    
                let t = j/os;
                outBuffer[outI+j] = 
                      (t - x1) * (t - x2)  * d1
                    + (t - x0) * (t - x2)  * d2
                    + (t - x0) * (t - x1) * d3;
                // outBuffer[outI+j] = 
                //       ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
                //     + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
                //     + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;
            }


        }
        x0=x1-1;
        x1=x2-1;
        x2=x3-1;
        y0=y1;
        y1=y2;
        y2=y3;
    }

    if (errorCount>0) console.log("Jitter errors:", errorCount,"out of ",  length, "sample (", (errorCount/length*100).toFixed(2), "%)");
    downsample(outBuffer, inBuffer, jitterDownsampleFilter, os, isCyclic, +1);//+1 to align samples when downsampling is offset by +1
}





function getJitterPreview(patch, sampleRate){
    //Build test signal
    const length = 1000;
    const margin=10;//Allow space for curve fitting at start and end
    const inBuffer = new Float32Array(length+margin+margin);
    const scale = 2/(length);
    for (let i=0;i<margin;i++){
        inBuffer[i] = -1;
    }
    for (let i=0;i<length;i++){
        inBuffer[margin+i] = i * scale-1;
    }
    for(let i=length+margin;i<inBuffer.length;i++){
        inBuffer[i] = 1;
    }
    jitter(inBuffer, sampleRate, patch, false);

    let outBuffer = new Float32Array(length);
    for (let i=0;i<length;i++){
        outBuffer[i] = inBuffer[margin+i];
    }
    return outBuffer;
}



//Maximum size of jitter in samples - 0.25 is 1/4 sample period at lower sample rate before upsampling
function getDACJitterFactor(){
    return DACFactor * jitterFactor;
}
function getADCJitterFactor(){
    return ADCFactor * jitterFactor;
}
function getPeriodicJitterFactor(){
    return periodicFactor * jitterFactor
}



export { jitter, getDACJitterFactor, getADCJitterFactor, getPeriodicJitterFactor,  getJitterPreview };