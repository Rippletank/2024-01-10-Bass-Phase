//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of Audio engine - handles simulation of dither and other bit depth related effects
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
//Dither method sources:
//Great videos @akashmurthy:
//Dither types: https://www.youtube.com/watch?v=t1X6DI-9_eU
//Noise Shaping: https://www.youtube.com/watch?v=1cMae5i1Eec
//
//Exhaustive analysis of subtractive vs non-subtractive dithering, and noise shaping:
//http://www.robertwannamaker.com/writings/rw_phd.pdf
//
//Useful discussion of common real-world practices:
//https://www.kvraudio.com/forum/viewtopic.php?t=552377
//
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

import { SeededSplitMix32Random } from './gaussianRandom.js';
import { getFFTFunction } from './basicFFT.js';


//Assume buffer has been normalised to not exceed +/-1.0
export function ditherSimulation(buffer, patch){
    const maxInt =Math.pow(2, Math.round(patch.digitalBitDepth)-1);//-1 to allow for + & - values
    const ditherType = Math.round(patch.digitalDitherType);
    const level = patch.digitalDitherLevel / maxInt;

    //Fake noise floor, equal power pan law
    const beforeLevel = level *Math.cos(Math.PI * 0.5 * patch.digitalDitherFakeness);
    const afterLevel = level *Math.sin(Math.PI * 0.5 * patch.digitalDitherFakeness) 
            * Math.pow(10,-4.8/20*patch.digitalDitherSubtract);//Subtractive dithering seems to give -4.5dB reduction in noise floor
                                                                //Reinforced by http://www.robertwannamaker.com/writings/rw_phd.pdf p87


    let dither = new Float32Array(buffer.length);
    if (beforeLevel>0)
    {
        //keep dither separate to allow for subtractive dithering
        switch(ditherType){
            case 0:
                addRectangularDither(dither, beforeLevel);
                break;
            case 1:
                addTriangularDither(dither, beforeLevel);
                break;
            case 2:
                addGaussianDither(dither, beforeLevel);
                break;
        }
    }


    if (patch.digitalBitDepth<25){
        //Bit reduction turned on
        if (patch.digitalDitherShaping>0){
            //Shaping ON - just do the calculation
            reduceBitDepthWithFullDither_BoxCarShaping(buffer, maxInt, dither, patch.digitalDitherSubtract, patch.digitalDitherShaping)  
        }
        else if (beforeLevel>0){
            //No noise shaping
            if (patch.digitalDitherSubtract>0){
                //Subtractive dithering
                reduceBitDepthWithDitherAndSubtract(buffer, maxInt, dither, patch.digitalDitherSubtract)
            }
            else{
                //No subtractive dithering
                reduceBitDepthWithDitherNoSubtract(buffer, maxInt, dither)
            }
        }
        else{
            //No dither or shaping at all 
            reduceBitDepth(buffer, maxInt)
        }

    } 


    if (afterLevel>0)
    {
        let fakeDither = new Float32Array(buffer.length);
        //Fake noise, sounds similar to noise produced by dither but is after bit depth reduction so has no effect on quantisation noise
        //Intended to help with ear tests
        switch(Math.round(patch.digitalDitherType)){
            case 0:
                addRectangularDither(fakeDither, afterLevel);
                break;
            case 1:
                addTriangularDither(fakeDither, afterLevel);
                break;
            case 2:
                addGaussianDither(fakeDither, afterLevel);
                break;
        }
        
        if (afterLevel>0 && patch.digitalDitherShaping){
            //Filter the fake noise, too
            filterDither_BoxCar(fakeDither, patch.digitalDitherShaping);
        }
        for (let i = 0; i < buffer.length; i++){
            buffer[i] += fakeDither[i];
        }
    }
}


function addRectangularDither(buffer, level)//level is 0..2
{
    //At level = 2, the dither is +/-1 with given rms of 1 for square distribution
    //https://masteringelectronicsdesign.com/how-to-derive-the-rms-value-of-pulse-and-square-waveforms/
    for (let i = 0; i < buffer.length; i++){
        buffer[i] += (Math.random()-0.5) * level;
    }

}

function addTriangularDither(buffer, level)//level is 0..2
{
    //At level = 2, the dither is +/-1 with given rms of 1/sqrt(6) = 0.408 for triangular distribution
    //https://masteringelectronicsdesign.com/how-to-derive-the-rms-value-of-a-triangle-waveform/
    level *= 0.5;//random is -1..1 already - so range of 2bits
    for (let i = 0; i < buffer.length; i++){
        buffer[i] += (Math.random()-Math.random()) * level;
    }
}

function addGaussianDither(buffer, level)//level is 0..2
{
    //nextGaussian() returns a value with a standard deviation of 1 which means an rms of 1, too (since the mean is zero).
    //Adjust to give same rms as triangular dither
    level *= 0.5*0.408;
    let rand = new SeededSplitMix32Random()    
    for (let i = 0; i < buffer.length; i++){
        buffer[i] += rand.nextGaussian() * level;
    }
}

function reduceBitDepth(buffer, max){
    //ignore binary quirks// const min =-(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let d =  Math.round(buffer[i] * max) //ignore binary quirks// Math.min(max, Math.max(min, Math.round(buffer[i] * max)));
        buffer[i] = d *invMax;
    }
}

function reduceBitDepthWithDitherNoSubtract(buffer, max, dither){
    //ignore binary quirks// const min =-(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let b =Math.round((buffer[i] + dither[i]) * max  ) //ignore binary quirks// Math.min(max, Math.max(min, Math.round((buffer[i] + dither[i]) * max  )));
        buffer[i] = b *invMax;
    }
}
function reduceBitDepthWithDitherAndSubtract(buffer, max, dither, subLevel){
    //ignore binary quirks// const min =-(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let d = dither[i];
        let b = Math.round((buffer[i] + d) * max  ); //ignore binary quirks// Math.min(max, Math.max(min, Math.round((buffer[i] + d) * max  )));
        buffer[i] = b *invMax -d * subLevel;
    }
}

function reduceBitDepthWithFullDither_BoxCarShaping(buffer, max, dither, subLevel, shaping){
    //ignore binary quirks// const min =-(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    let e =0;
    for(let i = 0; i < buffer.length; i++){
        let d = dither[i];
        let x = buffer[i]-e*shaping;
        let b =Math.round((x + d) * max); //ignore binary quirks//  Math.min(max, Math.max(min, Math.round((x + d) * max  )));
        buffer[i] = b *invMax -d* subLevel;
        e = buffer[i] - x;
    }
}

function filterDither_BoxCar(dither, shaping){
    let e =0;
    for(let i = 0; i < dither.length; i++){
        let x = dither[i]-e*shaping;
        e = dither[i];
        dither[i] = x;
    }
}



export function getDitherLinearityData(patch, valueCount, repeatCount){
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
    let scaling = 1/repeatCount;
    for (let i = 0; i < valueCount; i++) {
        let value = 0;
        for (let j = 0; j < repeatCount; j++) {
            value += b[x++];
        }
        results[i] = value*scaling;
    }
    return results;
}


const fftSize =1024;
const fftSize2 = fftSize/2;
const fftFunc = getFFTFunction(fftSize);
export function getDitherDynamicRange(patch, sampleRate, fCount){
    let outputCount =50;

    //Generate a sine wave of a given frequency, apply bit depth reduction and dithering according to the patch
    //Do an FFT of the result, remove the bin of the given frequency and accumulate the other bins
    //Repeat for a range of frequencies and then average the result
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
    

    //Convert the accumulation to a log frequency scale, with the given number of output points
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

    //Convert the log values to dB
    //The  fftsize2*0.125 is to make the db levels correspond more closely to the dynamic range of the signal as a whole
    //The fft spreads out the power over the whole range, but in this case, that makes it a bit meaningless, maybe?
    //Either way, its just a guide and works well as a comparison with the graph for the un-dithered signal
    for(let i=0;i<logValues.length;i++){
        logValues[i] =Math.max(-144, 20 * Math.log10(logValues[i]*fftSize2*0.5));
    }   

    return {
        f:new Float32Array(logFreqs),
        db:new Float32Array(logValues)
    };
}
