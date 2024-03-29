//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of audio engine - handles oversampling and distortion. Manages the oversampling filters and adding ultrasonic inharmonics
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

import { doSpeakerSim } from './speaker.js';
import { generateKaiserSincKernel_fromParams, generateUpsamplingPolyphaseKernels, upsample, downsample } from './oversampling.js';
import { allowedOversampleTimes } from './defaults.js';


let distOversampling =0;
let oversampling = 0;
let distStopBand = 0;
let distTransitionBand = 0;
let filter = null;//generateKaiserSincKernel_fromParams(0.47/oversampling,90,0.025/oversampling);
let polyphaseKernels = null;
let oversamplingReport ="No oversampling.";
let trueSampleRate = 0;

function buildOSFilters(patch){
    distOversampling =patch.oversampleTimes;
    distStopBand = patch.oversampleStopDepth;
    distTransitionBand = patch.oversampleTransition;
    oversampling =allowedOversampleTimes[distOversampling];
    const transition =0.005 + 0.025 *distTransitionBand
    const stop = 70 +40 *distStopBand
    filter = generateKaiserSincKernel_fromParams(
        (0.5-transition)/oversampling,
        stop,
        transition/oversampling);
    polyphaseKernels = generateUpsamplingPolyphaseKernels(filter, oversampling);
    
    if (trueSampleRate!=0) 
    { 
        //DON'T use sampleRate from cyclic - it is adjusted for the cycle so not true
        oversamplingReport = "SampleRate "+trueSampleRate+"Hz Transition "+((0.5-transition)*trueSampleRate).toFixed(0)+"Hz to "+((0.5)*trueSampleRate).toFixed(0)+"Hz   FIR size:"+filter.length;
    }  
    //console.log("Oversampling: x"+oversampling+" stop:-"+stop+"db "+oversamplingReport);
}


//Perform distortion on buffer in place
function distort(buffer, patch, sampleRate, isCyclic, includeInharmonics){
    if (!isCyclic && trueSampleRate != sampleRate){
        trueSampleRate = sampleRate;//capture true SampleRate as early as possible - use for report even if in cycle mode
    } 
    if (patch.distortion==0) return "No oversampling.";
    if (distOversampling != patch.oversampleTimes 
        || distStopBand != patch.oversampleStopDepth 
        || distTransitionBand != patch.oversampleTransition
        || filter == null
        || polyphaseKernels == null)
        {            
            buildOSFilters(patch) 
        }    

    let ob =oversampling==1 ? buffer :  upsample(buffer, filter, polyphaseKernels, isCyclic);

    if (includeInharmonics && patch.ultrasonicLevel>-91 && oversampling>1)
    {
        const A = patch.ultrasonicFrequency;//0-1
        let w =  Math.PI * ((1-A)/oversampling + A); //A scales between sample nyquist (pi/oversampling) and oversampled nyquist (pi)
        //let w =  0.125*Math.PI * ((1-A)/oversampling + A);//Test in audible range
        addUltrasonic(ob, w, Math.pow(10, patch.ultrasonicLevel/20), isCyclic);
    }

    if (Math.abs(patch.hyperbolicDistortion)>0)hyperbolicAsymmetry(ob, patch.hyperbolicDistortion * patch.distortion);
    if (Math.abs(patch.oddDistortion)>0) cheb_3(ob, patch.distortion * patch.oddDistortion);
    
    if (patch.tanhDistortion>0>0)tanh_Saturation(ob, 0.0005 +8 * patch.distortion * patch.tanhDistortion, 0);

    if (patch.clipDistortion>0)
    {
        const d=1.5-1.5 * (patch.distortion * patch.clipDistortion-0.01)/0.99;
        clip(ob, d, -d);
    }    

    if (patch.speakerAmount>0) doSpeakerSim(ob, sampleRate * oversampling, patch, isCyclic);


    if (oversampling>1) 
    {
        downsample(ob, buffer, filter, oversampling, isCyclic);
    }
    return isCyclic? null: oversamplingReport;
}


function clip(buffer,  thresholdHigh, thresholdLow){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = v > thresholdHigh ? thresholdHigh : (v < thresholdLow ? thresholdLow : v);
    }
}

function hyperbolicAsymmetry(buffer, amount){
    const tanhA=  1;
    let length = buffer.length;
    const A =-Math.pow(10,0.3+5*(1-Math.abs(amount)));
    const B = Math.sqrt(Math.abs(A));
    const s = Math.sign(amount);
    const minimum = -B*0.8;
    for(let i=0;i<length;i++){
        let x =s *buffer[i];
        if (x<minimum) x=minimum;//Clipping fuse - prevent hyperbolic blowing up
        buffer[i] = s*( A/(x+B)+B);
    }
}

function tanh_Saturation(buffer, A)
{
    let length = buffer.length;
    const A0 = Math.tanh(A);
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = Math.tanh(A * v)/A0;
    }
}
function tanh_AsymSaturation(buffer, A, asymA)//Not used
{
    let length = buffer.length;
    const A0 = Math.tanh(A*(1+Math.abs(asymA)));
    for(let i=0;i<length;i++){
        let v =buffer[i];
        const asym = Math.tanh(v);
        buffer[i] = Math.tanh(A * (v + asymA*asym*asym))/A0;
    }
}


//Chebyshev polynomials
//https://mathworld.wolfram.com/ChebyshevPolynomialoftheFirstKind.html
//T_0(x)	=	1	
//T_1(x)	=	x	
//T_2(x)	=	2x^2-1	
//T_3(x)	=	4x^3-3x	
//T_4(x)	=	8x^4-8x^2+1	
//T_5(x)	=	16x^5-20x^3+5x	
//T_6(x)	=	32x^6-48x^4+18x^2-1.
function cheb_2(buffer,  amount){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        //Unacceptable dc offset for silent audio with even harmonics
        //Can't correct without dynamically adjusting dc offset
        //A fixed amount of dc correction causes big DC offsets in high amplitude signals
        //If not corrected, causes clicking at start and end
        //If corrected, causes uselessly asymmetric waveforms
        //Dynamically adjusting DC introduces an unnecessary variable to testing
        buffer[i] += amount*(2* v * v  -1);
    }
}
function cheb_3(buffer,  amount){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] -= amount*( 4*v*v*v - 3*v);
    }
}
function cheb_2_3(buffer, even, odd){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        const v =buffer[i];
        //buffer[i] -= odd*( 4*v*v*v - 3*v) + even*(2* v * v  -1);
        const v2 = v*v;
        buffer[i] -= odd*( 4*v2 - 3 )*v + (2* v2 - 1) * even;//Unacceptable dc offset for silent audio with even harmonics
    }
}


function addUltrasonic(ob, w,  level, isCyclic)
{
    if (isCyclic) 
    {
        addUltrasonicCyclic(ob, w, level)
    }
    else
    {
        addUltrasonicOneShot(ob, w, level)
    }
}
function addUltrasonicCyclic(ob, w, level)
{
    //create a blackman-harris window as the envelope of the ultrasonic tone
        //https://en.wikipedia.org/wiki/Window_function
    let length = ob.length;
    let a0 = 0.35875 * level;
    let a1 = 0.48829 * level;
    let a2 = 0.14128 * level;
    let a3 = 0.01168 * level;
    //Blackman-harris window (bufferSize-1) to ensure 1 at end
    let piScale =2 * Math.PI / (length - 1)
    for(let i=0;i<length;i++){
        let a = a0 - a1 * Math.cos(piScale * i ) 
                   + a2 * Math.cos(2 * piScale * i ) 
                   - a3 * Math.cos(3 * piScale * i );
        ob[i] +=  a * Math.sin(w*i);
    }
}

const ultrasonicSmoothing = 8;//Number of cycles to attack and decay (x2)
function addUltrasonicOneShot(ob, w, level)
{
    //Simple linear attack and decay envelope for the ultrasonic tone
    //Reduce clicks or any other artifacts
    //ultrasonicSmoothing
    let length = ob.length;
    const attack = Math.round(2*Math.PI/w*ultrasonicSmoothing); //ultrasonicSmoothing full cycles
    const decay = attack *2; //ultrasonicSmoothing x2 full cycles for decay
    const decayStart = length - decay;
    const attackScale = level/attack;
    const decayScale = level/decay;
    for(let i=0;i<attack;i++){
        ob[i] += i* attackScale * Math.sin(w*i);
    }
    for(let i=attack;i<decayStart;i++){
        ob[i] += level * Math.sin(w*i);
    }
    for(let i=decayStart;i<length;i++){
        ob[i] += (length - i)*decayScale * Math.sin(w*i);
    }
}



export { distort };