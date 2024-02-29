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
//Exhaustive analysis:
//http://www.robertwannamaker.com/writings/rw_phd.pdf
//
//Useful discussion of common real-world practices:
//https://www.kvraudio.com/forum/viewtopic.php?t=552377
//
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

import { SeededSplitMix32Random } from './gaussianRandom.js';


//Assume buffer has been normalised to not exceed +/-1.0
export function digitalSimulation(buffer, patch, samplerate){
    const maxInt =Math.pow(2, Math.round(patch.digitalBitDepth)-1);//-1 to allow for + & - values
    const ditherType = Math.round(patch.digitalDitherType);
    const level = patch.digitalDitherLevel / maxInt;
    const beforeLevel = level *Math.cos(Math.PI * 0.5 * patch.digitalDitherFakeness);
    const afterLevel = level *Math.sin(Math.PI * 0.5 * patch.digitalDitherFakeness);


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
        if (patch.digitalDitherShaping>0){
            reduceBitDepthWithFullDither(buffer, maxInt, dither, patch.digitalDitherSubtract, patch.digitalDitherShaping)  
        }
        else if (beforeLevel>0){
            if (patch.digitalDitherSubtract>0){
                reduceBitDepthWithDitherAndSubtract(buffer, maxInt, dither, patch.digitalDitherSubtract)
            }
            else{
                reduceBitDepthWithDitherNoSubtract(buffer, maxInt, dither)
            }
        }
        else{
            reduceBitDepth(buffer, maxInt)
        }

    } 


    if (afterLevel>0)
    {
        //Fake noise, sounds similar to noise produced by dither but is after bit depth reduction so has no effect on quantisation noise
        //Intended to help with ear tests
        switch(Math.round(patch.digitalDitherType)){
            case 0:
                addRectangularDither(buffer, afterLevel);
                break;
            case 1:
                addTriangularDither(buffer, afterLevel);
                break;
            case 2:
                addGaussianDither(buffer, afterLevel);
                break;
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
    //nextGaussian() returns a value with a standard deviation of 1 which means an rms of 1, too.
    //Adjust to give same rms as triangular dither
    level *= 0.5*0.408;
    let rand = new SeededSplitMix32Random()    
    for (let i = 0; i < buffer.length; i++){
        buffer[i] += rand.nextGaussian() * level;
    }
}

function reduceBitDepth(buffer, max){
    const min = -(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let d = Math.min(max, Math.max(min, Math.round(buffer[i] * max)));
        buffer[i] = d *invMax;
    }
}

function reduceBitDepthWithDitherNoSubtract(buffer, max, dither){
    const min = -(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let b = Math.min(max, Math.max(min, Math.round((buffer[i] + dither[i]) * max  )));
        buffer[i] = b *invMax;
    }
}
function reduceBitDepthWithDitherAndSubtract(buffer, max, dither, subLevel){
    const min = -(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    for(let i = 0; i < buffer.length; i++){
        let d = dither[i];
        let b = Math.min(max, Math.max(min, Math.round((buffer[i] + d) * max  )));
        buffer[i] = b *invMax -d * subLevel;
    }
}

function reduceBitDepthWithFullDither(buffer, max, dither, subLevel, shaping){
    const min = -(max-1); //since zero is one of the values, and because of 2-s complement, max negative value is one less than max positive value
    const invMax = 1/max;//efficiency
    let e =0;
    for(let i = 0; i < buffer.length; i++){
        let d = dither[i];
        let x = buffer[i]-e*shaping;
        let b = Math.min(max, Math.max(min, Math.round((x + d) * max  )));
        buffer[i] = b *invMax -d* subLevel;
        e = buffer[i] - x;
    }
}