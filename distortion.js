//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio Code - fort distortion and FFT of result
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
//Kippel loudspeaker models - for reference on distortion in speakers

let distOversampling =0;
let oversampling = 0;
let distStopBand = 0;
let distTransitionBand = 0;
let filter = null;//generateKaiserSincKernel_fromParams(0.47/oversampling,90,0.025/oversampling);
let polyphaseKernels = null;//generateUpsamplingPolyphasekernals(filter, oversampling);
let oversamplingReport ="No oversampling filter generated yet.";
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
    polyphaseKernels = generateUpsamplingPolyphasekernals(filter, oversampling);
    
    if (trueSampleRate!=0) 
    { 
        //DONT use samplerate from cyclic - it is adjusted for the cycle so not true
        oversamplingReport = "Samplerate "+trueSampleRate+"Hz Transition "+((0.5-transition)*trueSampleRate).toFixed(0)+"Hz to "+((0.5)*trueSampleRate).toFixed(0)+"Hz   FIR size:"+filter.length;
    }  
    //console.log("Oversampling: x"+oversampling+" stop:-"+stop+"db "+oversamplingReport);
}



//Perform distortion on buffer in place
function distort(buffer, patch, sampleRate, isCyclic){
    if (!isCyclic && trueSampleRate != sampleRate){
        trueSampleRate = sampleRate;//capture true samplerate as early as possible - use for report even if in cycle mode
    } 
    if (patch.distortion==0) return;
    if (distOversampling != patch.oversampleTimes 
        || distStopBand != patch.oversampleStopDepth 
        || distTransitionBand != patch.oversampleTransition
        || filter == null
        || polyphaseKernels == null)
        {            
            buildOSFilters(patch) 
        }    

    let ob =oversampling==1 ? buffer :  upsample(buffer, filter, polyphaseKernels, isCyclic);


    if (Math.abs(patch.hyperbolicDistortion)>0)hyperbolicAsymmetry(ob, patch.hyperbolicDistortion * patch.distortion);
    if (Math.abs(patch.oddDistortion)>0) cheb_3(ob, patch.distortion * patch.oddDistortion);
    
    if (patch.tanhDistortion>0>0)tanh_Saturation(ob, 0.0005 +8 * patch.distortion * patch.tanhDistortion, 0);

    if (patch.clipDistortion>0)
    {
        const d=1.5-1.5 * (patch.distortion * patch.clipDistortion-0.01)/0.99;
        clip(ob, d, -d);
    }
    if (patch.jitter>0) 
    {
        const rand= new SeededSplitMix32Random();//Might reuse for stereo
        jitter(ob, patch.jitter, rand, isCyclic);
    }

    if (oversampling>1) downsample(ob, buffer, filter, oversampling, isCyclic);
}

function jitter(buffer, amount, rand, isCyclic){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v = buffer[i];
        let x_minus_1, x_plus_1;

        if (isCyclic) {
            // Wrap edge values
            x_minus_1 = buffer[(i - 1 + length) % length];
            x_plus_1 = buffer[(i + 1) % length];
        } else {
            // Set edge values to zero
            x_minus_1 = i - 1 >= 0 ? buffer[i - 1] : 0;
            x_plus_1 = i + 1 < length ? buffer[i + 1] : 0;
        }

        // Quadratic interpolation
        let a = (x_minus_1 + x_plus_1) / 2 - v;
        let b = (x_plus_1 - x_minus_1) / 2;
        let c = v;

        let shift = boxMullerRandom(rand) * 0.5 * amount;
        let interpolated = ((a * shift + b) * shift + c);

        buffer[i] = interpolated;
    }
}


function parabolicAymmetry(buffer, amount){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = v > thresholdHigh ? thresholdHigh : (v < thresholdLow ? thresholdLow : v);
    }
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
function tanh_AsymSaturation(buffer, A, asymA)
{
    let length = buffer.length;
    const A0 = Math.tanh(A*(1+Math.abs(asymA)));
    for(let i=0;i<length;i++){
        let v =buffer[i];
        const asym = Math.tanh(v);
        buffer[i] = Math.tanh(A * (v + asymA*asym*asym))/A0;
    }
}
// function tanh_Saturation(buffer, A, asymA)
// {
//     let length = buffer.length;
//     const A0 = Math.tanh(A*(1+Math.abs(asymA)));
//     for(let i=0;i<length;i++){
//         let v =buffer[i];
//         const asym = Math.tanh(v);
//         buffer[i] = Math.tanh(A * (v + asymA*asym*asym))/A0;
//     }
// }

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
        //Dymanically adjusting DC introduces an unecessary variable to testing
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







//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Seeded random number generator giving normal distribution of values
//Directly from Github Copilot \/(^_^)\/
//SplitMix32 ->from refrenced stackoverflow posts
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Seeded random number generator
function SeededSplitMix32Random(seed) {
    this.m = 0x80000000-1; // 2**31;
    this.state = seed ? seed : Math.floor(Math.random());
}

//SplitMix32
//https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
//https://stackoverflow.com/questions/17035441/looking-for-decent-quality-prng-with-only-32-bits-of-state
SeededSplitMix32Random.prototype.nextInt = function() {
    let z = (this.state += 0x9E3779B9) | 0; //Ensure z is a 32bit integer
    z ^= z >> 16; 
    z *= 0x21f0aaad;
    z ^= z >> 15;
    z *= 0x735a2d97;
    z ^= z >> 15;
    return z;
}
SeededSplitMix32Random.prototype.nextFloat = function() {
    // returns in range [0,1]
    return this.nextInt() / this.m ;
}

// Box-Muller transform
function boxMullerRandom(seededRandom) {
    let u = 0, v = 0;
    while(u === 0) u = seededRandom.nextFloat(); //Converting [0,1) to (0,1)
    while(v === 0) v = seededRandom.nextFloat();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}