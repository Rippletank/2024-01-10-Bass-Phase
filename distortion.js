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
let oversamplingReport ="";
let trueSampleRate = 0;
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
        || polyphaseKernels == null){
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

    let ob =oversampling==1 ? buffer :  upsample(buffer, filter, polyphaseKernels, isCyclic);


    const d=1.5-1.5 * (patch.distortion * patch.clipDistortion-0.01)/0.99;
    cheb_2_3(ob, patch.distortion * patch.evenDistortion, patch.distortion * patch.oddDistortion);
    if (patch.tanhDistortion>0)tanh_clip(ob, 0.0005 +8 * patch.distortion * patch.tanhDistortion );
    clip(ob, d, -d);

    if (oversampling>1) downsample(ob, buffer, filter, oversampling, isCyclic);
}

function clip(buffer,  thresholdHigh, thresholdLow){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = v > thresholdHigh ? thresholdHigh : (v < thresholdLow ? thresholdLow : v);
    }
}
function tanh_clip(buffer, A)
{
    let length = buffer.length;
    const A0 = Math.tanh(A);
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = Math.tanh(A * v)/A0;
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
        buffer[i] -= odd*( 4*v2 - 3 )*v + (2* v2 - 1) * even;
    }
}
