//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of Audio engine - FFT 
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
//Simple Cooley-Tukey FFT algoryithm to allow preview display of distoring frequency spectrum
//Based on premise that the distrortion preview is a single wave cycle of 1024 samples
//Note: Harmonic series spectrum is based on the addative synthesis levels and phases used to generate the wave
//In general, the FFT agrees extremely well with the harmonic series spectrum but small differences in phase can 
//cause flipped polarity when showing phase differences of around pi
//FFT Code developed using following sources:
//wikipedia: https://en.wikipedia.org/wiki/Fast_Fourier_transform
//https://en.m.wikipedia.org/wiki/Cooley%E2%80%93Tukey_FFT_algorithm
//https://vanhunteradams.com/FFT/FFT.html#Identifying-a-regression
//Explanation is great here, and the example code makes it futile to try implementing from scratch, so it is adapted here.
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//FFT Code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

import { zeroLevel } from "./defaults.js";


//cache functions to avoid reinitialising
let fftFunctions=new Array(10).fill(null)
function getFFTFunction(bufferSize){
    let index =getIndex(bufferSize);
    return fftFunctions[index] ??  (fftFunctions[index] = initFFT(bufferSize, true, false))
}

//cache functions to avoid reinitialising
let fftFunctionsNoPhase=new Array(10).fill(null)
function getFFTFunctionNoPhase(bufferSize){
    let index =getIndex(bufferSize);
    return fftFunctionsNoPhase[index] ??  (fftFunctionsNoPhase[index] = initFFT(bufferSize, false, true))
}
//cache functions to avoid reinitialising
let fftFunctionsRealAndImag=new Array(10).fill(null)
function getFFTFunctionRealAndImag(bufferSize){
    let index =getIndex(bufferSize);
    return fftFunctionsRealAndImag[index] ??  (fftFunctionsRealAndImag[index] = initFFT(bufferSize, false, false))
}

//cache functions to avoid reinitialising
let ifftFunctions= new Array(10).fill(null)
function getInverseFFTFunction(bufferSize){
    let index =getIndex(bufferSize);
    return ifftFunctions[index] ??  (ifftFunctions[index] = initInverseFFT(bufferSize))
}

function initFFT(N, returnMagnitudeAndPhase, returnMagnitudeOnly)
{
    return buildFFT(N, false, returnMagnitudeAndPhase, returnMagnitudeOnly);
}

function initInverseFFT(N)
{
    return buildFFT(N, true, false, false);
}


function buildFFT(N, isInverse, returnMagnitudeAndPhase, returnMagnitudeOnly){
    //FFT will always be of length N so bit reversals and sin lUT can be precalculated
    const N_1 =N-1;
    const N_2 =N/2;
    const N_4 =N/4;
    const logN = Math.log2(N);
    const shift = 16-logN;
    let bitReversals = [];
    //Bit reversal precalculation
    //https://vanhunteradams.com/FFT/FFT.html#Generalized-code
    //who referenced https://graphics.stanford.edu/~seander/bithacks.html#BitReverseObvious
    //only store needed reversals - not when m==mr 
    let mr = 0;
    for(let m=1;m<N_1;m++){
        mr =((m>>1)  & 0x5555)|((m  & 0x5555)<<1);
        mr =((mr>>2) & 0x3333)|((mr & 0x3333)<<2);
        mr =((mr>>4) & 0x0f0f)|((mr & 0x0f0f)<<4);
        mr =((mr>>8) & 0x00ff)|((mr & 0x00ff)<<8);
        mr = mr>>shift;
        if (mr<=m) continue;
        bitReversals.push([m,mr]);
    }

    //Sin LUT precalculation
    const sinLUT = new Float32Array(N);
    const w =2*Math.PI/N;//rads per sample
    for(let i=0;i<N;i++){
        sinLUT[i] = Math.sin(w*i) * 0.5;
    }

    let bitReversalOperation = isInverse? inverseBitReversal : forwardBitReversal;
    let coreOperation = isInverse? inverseCoreOperation : forwardCoreOperation;
    let returnOperation = returnMagnitudeAndPhase? returnOperationToMagAndPhase :(returnMagnitudeOnly ? returnOperationToMagOnly : (fr,fi,N_2)=>{return {real:fr,imag:fi}});

    return (real, imag)=>{       
        let fr = null;
        if (real.length===N){
            fr = new Float32Array(real);
        }else if (real.length===N_2){
            //Copy and mirror real values (for example, from magnitude array)
            fr = new Float32Array(N);
            for(let i=1;i<N_2-1;i++){ //miss out DC and Nyquist
                const r= real[i];
                fr[i] = r;
                fr[N_1-i] = r;
            }
        }
        else return null;//unexpected length
        
        const fi = new Float32Array(imag? imag : N);//Intialise with imaginary if present, else set to length N
        bitReversalOperation(fr,fi, bitReversals);
        coreOperation(fr,fi,N,N_4,logN,sinLUT);
        return returnOperation(fr,fi,N_2);
    }
}




function getIndex(bufferSize){
    let index;
    switch(bufferSize){ 
        case 128: index = 0; break;   
        case 256: index = 1; break;   
        case 512: index = 2; break;   
        case 1024:index = 3; break;    
        case 2048: index = 4; break;   
        case 4096: index = 5; break;   
        case 8192: index = 6; break;    
        case 16384: index = 7; break;   
        case 32768: index = 8; break;   
        case 65536: index = 9; break;   
        default: return null;
    }
    return index;
}



let forwardBitReversal = (fr,fi, bitReversals)=>{
    for(let i=0;i<bitReversals.length;i++){
        const br = bitReversals[i];
        const m = br[0];
        const mr = br[1];
        const tr = fr[m];
        fr[m] = fr[mr];
        fr[mr] = tr;
        //don't need to swap fi as it is all 0
    }
}


//From https://vanhunteradams.com/FFT/FFT.html#Generalized-code
//who referenced om Roberts 11/8/89 and Malcolm Slaney 12/15/94 malcolm@interval.com
let forwardCoreOperation =(fr,fi,N,N_4,logN,sinLUT)=>{
        let L=1;
        let k=logN-1;
        while (L<N){
            let iStep = L*2;
            for(let m=0;m<L;m++){
                const theta = m<<k;
                const wr = sinLUT[theta+N_4];//cosine * 0.5 in LUT
                const wi = -sinLUT[theta];//sine * 0.5 in LUT
                for(let i=m;i<N;i+=iStep){
                    const j=i+L;
                    let tr = wr*fr[j]-wi*fi[j];
                    let ti = wr*fi[j]+wi*fr[j];
                    let qr = fr[i]*0.5;
                    let qi = fi[i]*0.5;
                    fr[j] = qr-tr;
                    fi[j] = qi-ti;
                    fr[i] = qr+tr;
                    fi[i] = qi+ti;
                }
            }
            k-- ;
            L = iStep ;
        }
    }


let inverseBitReversal = (fr,fi, bitReversals)=>{
    for(let i=0;i<bitReversals.length;i++){
        const br = bitReversals[i];
        const m = br[0];
        const mr = br[1];
        const tr = fr[m];
        fr[m] = fr[mr];
        fr[mr] = tr;
        const ti = fi[m];//reverse imaginary part, too
        fi[m] = fi[mr];
        fi[mr] = ti;
    }
}

//From https://vanhunteradams.com/FFT/FFT.html#Generalized-code
//who referenced om Roberts 11/8/89 and Malcolm Slaney 12/15/94 malcolm@interval.com
let inverseCoreOperation =(fr,fi,N,N_4,logN,sinLUT)=>{
    let L=1;
    let k=logN-1;
    while (L<N){
        let iStep = L*2;
        for(let m=0;m<L;m++){
            const theta = m<<k;
            const wr = sinLUT[theta+N_4];//cosine * 0.5 in LUT
            const wi = sinLUT[theta];//sine * 0.5 in LUT - sign flipped from iFFT
            for(let i=m;i<N;i+=iStep){
                const j=i+L;
                let tr = wr*fr[j]-wi*fi[j];
                let ti = wr*fi[j]+wi*fr[j];
                let qr = fr[i]; //multiplication by 0.5 removed for iFFT
                let qi = fi[i]; //multiplication by 0.5 removed for iFFT
                fr[j] = qr-tr;
                fi[j] = qi-ti;
                fr[i] = qr+tr;
                fi[i] = qi+ti;
            }
        }
        k-- ;
        L = iStep ;
    }
}


let returnOperationToMagAndPhase= (fr,fi,N_2)=>{
    let mag=new Float32Array(N_2);
    let phase=new Float32Array(N_2);
    for(let i=0;i<N_2;i++){
        const x=fr[i];
        const y=fi[i];
        const m = Math.sqrt(x*x+y*y);
        let p =m>zeroLevel? 
                Math.atan2(x,-y) //x and y are rotated here to get the phase correct FFT is cosine based but Synthesis method is sine based
            :0;//phase when magnitude is close to zero to avoid noise being misinterpreted as phase
        mag[i]=m;
        phase[i]=p;
    }
    return {
        magnitude: mag,
        phase: phase
    }
}

let returnOperationToMagOnly= (fr,fi,N_2)=>{
    let mag=new Float32Array(N_2);
    let phase=new Float32Array(N_2);
    for(let i=0;i<N_2;i++){
        const x=fr[i];
        const y=fi[i];
        mag[i]= Math.sqrt(x*x+y*y);
    }
    return {
        magnitude: mag
    }
}


let convertMagnitudeAndPhaseToRealAndImaginary = (real, img)=>{  
        let N = real.length*2;
        let N_2 = real.length;
        const fr = new Float32Array(N);
        const fi = new Float32Array(N);
        //Copy in real and imaginary parts, and reverse part above nyquist
        //First parts that only appear once
        fr[0] = real[0];//DC
        fi[0] = img[0];//DC
        fr[N_2] = real[N_2];//Nyquist point
        fi[N_2] = img[N_2];//Nyquist point
        //Next rest of parts that are reflected
        for(let i=1;i<N_2;i++){
            fr[i] = real[i];
            fi[i] = img[i];
            fr[N-i] = real[i];
            fi[N-i] = -img[i];
        }
        return {real:fr,imag:fi};
    }


export { getFFTFunction, getFFTFunctionNoPhase, getInverseFFTFunction, getFFTFunctionRealAndImag };