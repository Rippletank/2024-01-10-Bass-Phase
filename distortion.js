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

let oversampling =4;
//let filter = generateKaiserSincKernel_alphaN(0.454/oversampling,201,5);
let filter = generateKaiserSincKernel_fromParams(0.47/oversampling,90,0.025/oversampling);
//let filter = generateKaiserSincKernel_fromParams(0.454/oversampling,90,0.04/oversampling);
let polyphaseKernels = generateUpsamplingPolyphasekernals(filter, oversampling);

let testFilter1 = generateKaiserSincKernel_alphaN(0.125,1024,5);
let testFilter2 = generateKaiserSincKernel_alphaN(0.125,501,5);

//Perform distortion on buffer in place
function distort(buffer, patch, sampleRate, isCyclic){
    if (patch.distortion==0) return;

    // for(let i=0;i<buffer.length;i++){
    //     buffer[i] = testFilter1[i]-testFilter[testFilter.length-1-i];
    // }

    // var max = testFilter2.reduce((a,b)=>Math.max(a,Math.abs(b)),0);

    // for(let i=0;i<1024;i++){
    //     buffer[i] = i<384? 0: (i>512+128-1? 0 :testFilter2[i-384]);
    // }

    // filterCheck2(buffer,patch.distortion,isCyclic);
    // return;
    //offsetCheck(buffer);
    //return;
    

    let ob =upsample(buffer, filter, polyphaseKernels, isCyclic);

    //const d=1.5-1.5 * (patch.distortion-0.01)/0.99;
    //clip(ob, d, -d);
    cheb_2_3(ob, patch.distortion * patch.evenDistortion, patch.distortion * patch.oddDistortion);

    downsample(ob, buffer, filter, oversampling, isCyclic);
}

function clip(buffer,  thresholdHigh, thresholdLow){
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let v =buffer[i];
        buffer[i] = v > thresholdHigh ? thresholdHigh : (v < thresholdLow ? thresholdLow : v);
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


function offsetCheck(buffer, isCyclic)
{    
    let dummyBuffer = new Float32Array(buffer.length).fill(0);
    dummyBuffer[0] = 1;
    dummyBuffer[buffer.length-1] = 1;
    logValuesNear1('dummyBuffer:', dummyBuffer);
    const ob = upsample(dummyBuffer, polyphaseKernels,filter.length, isCyclic);
    logValuesNear1('Upsampled:', ob);
    downsample(ob, buffer, filter, oversampling);
    logValuesNear1('downsampled:', buffer);
}
function logValuesNear1(title, buffer)
{
    let report = []
    for(let i=0;i<buffer.length;i++){
        if (buffer[i]>0.3){
            report.push(i);
        }
    }
    console.log(title);
    console.log(report);
}

function filterCheck(buffer){
    let dummyBuffer = [...buffer];
    // let dummyBuffer = [...buffer].fill(0);
    // dummyBuffer[0] = 1;
    // dummyBuffer[buffer.length-1] = 1;
    let dest = new Float32Array(buffer.length).fill(0);
    filterOnly(dummyBuffer, dest, testFilter2);
    for(let i=0;i<buffer.length;i++){
        buffer[i] = dest[i];//null check
    }
}

function filterCheck2(buffer, offset, isCyclic){
    let flt = generateKaiserSincKernel_alphaN(0.4*offset,900,10);
    if (!isCyclic){
        //buffer.fill(0);
        //buffer[0] = 1;

    }
    let newB = isCyclic ? convolveWrapped( buffer, flt) : convolve(buffer, flt);

    if (isCyclic){
        for(let i=0;i<buffer.length;i++){
            buffer[i] = newB[i+(flt.length-1)/2];
        }
    }
    else
    {
        logValuesNear1('newB:', newB);
        for(let i=0;i<buffer.length;i++){
            buffer[i] = newB[i+(flt.length-1)/2];
        }
    }
}
