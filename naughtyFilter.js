//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of audio engine - Implements a simple parametric EQ in IIR, then derives an FIR filter from it
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


import {buildBlackmanHarrisWindow} from './oversampling.js'
import {getFFTFunctionNoPhase, getFFTFunctionRealAndImag, getInverseFFTFunction } from './basicFFT.js';


const FIRFFTLength = 4096;//16384;


//Note: non-cyclic input buffers return a new buffer with length = buffer.length + impulseResponse.length - 1
//Cyclic buffer return themselves with the convolution result in the same buffer
export function doFilter(buffer, sampleRate, patch, isCyclic) {
  const iirParams = getIIRCoefficients(sampleRate, patch);

  if (patch.naughtyFilterMix === 0){
    //Simple case - only IIR
    return applyIIRFilter(buffer, iirParams.coeffs);//Same input as output buffer - saves memory/allocation time
  }

  //Otherwise, a mix of IIR and FIR
  //const FIRImpulse = getImpulseResponse(sampleRate, patch, iirParams.coeffs).fftImpulse;
  const FIRImpulse = getMatchingFIRFilterViaSinc(iirParams.fcn, iirParams.Q, iirParams.gain);

  if (isCyclic){
    const outputBuffer = new Float32Array(buffer.length);
    convolveWrapped(buffer, outputBuffer, FIRImpulse, patch.naughtyFilterMix);
    if (patch.naughtyFilterMix<1) applyIIRFilterMix(buffer, outputBuffer, iirParams.coeffs, 0, 1-patch.naughtyFilterMix);
    for(let i=0;i<buffer.length;i++){
      buffer[i]=outputBuffer[i];
    }
    return buffer; //Same input as output buffer - works for Previews
  }
  else{
    const outputBuffer = new Float32Array(buffer.length + FIRImpulse.length - 1);
    convolve(buffer, outputBuffer, FIRImpulse, patch.naughtyFilterMix);
    if (patch.naughtyFilterMix<1) applyIIRFilterMix(buffer, outputBuffer, iirParams.coeffs, FIRImpulse.length/2, 1-patch.naughtyFilterMix);
    return outputBuffer;
  }
}



export function getImpulseResponse(sampleRate, patch, preCalcedCoeffs=null) {
  if (patch.naughtyFilterGain === 0) return {// No filtering
    fftImpulse: new Float32Array(1).fill(1),
    iirImpulse: new Float32Array(1).fill(1),
    fft: 
      {
        f:new Float32Array([50,20000]),
        db:new Float32Array([0,0])
      }
  }; 

  const iirParams =preCalcedCoeffs ?? getIIRCoefficients(sampleRate, patch);
  let impulseResponse = new Float32Array(FIRFFTLength);
  impulseResponse[0] = 1;
  applyIIRFilter(impulseResponse, iirParams.coeffs);

  //impulseResponse[0] = 0; // Remove impulse
  return getMatchingFIRFilter(impulseResponse, sampleRate, iirParams.fcn, iirParams.Q, iirParams.gain);
}


function getMatchingFIRFilter(impulseResponse,sampleRate, fcn, Q, sqrtGain) {
  const imp = new Float32Array(FIRFFTLength);
  const length = Math.min(impulseResponse.length, FIRFFTLength);
  for (let i = 0; i < length; i++) {
    imp[i] = impulseResponse[i];// * FIRWindow2[FIRFFTLength + i];
  }
  const fft = getScaledFFT(imp, sampleRate);

  let firFilter = getMatchingFIRFilterViaSinc(fcn, Q, sqrtGain);
  
  return {
    fftImpulse: firFilter,
    iirImpulse: impulseResponse,
    fft: fft,
  }
}


// const previewFFTSize = 1024;
const previewFFT = getFFTFunctionNoPhase(FIRFFTLength);
function getScaledFFT(imp, sampleRate) {  
  let fft = previewFFT(imp).magnitude;
  let outputCount =200;
  const fftSize = FIRFFTLength;
  const fftSize2 = fftSize/2;

    //Convert the accumulation to a log frequency scale, with the given number of output points
    let lastBin = 1;//lastBin will be skiped. bin 0 is DC
    const maxF =20000;
    const minF =50;
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
            value += fft[k];
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
        logValues[i] =Math.max(-144, 20 * Math.log10(logValues[i]*fftSize2*0.5))+12;
    }   

    return {
        f:new Float32Array(logFreqs),
        db:new Float32Array(logValues)
    };

  }



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//FIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getMatchingFIRFilterViaSinc(fcn, Q, gain){
  // const lpf1FIR= createLowPassFilterKernel(fcn * (1-0.5/Q), Math.round(Q*100/2)*2+1); 
  // const lpf2FIR= createLowPassFilterKernel(fcn * (1+0.5/Q), Math.round(Q*100/2)*2+1); 
  const lpf1FIR= createLowPassFilterKernel(fcn * (1-0.5/Q), Math.round(Q*250/2)*2+1); 
  const lpf2FIR= createLowPassFilterKernel(fcn * (1+0.5/Q), Math.round(Q*250/2)*2+1); 
  let sum=0;
  for (let i = 0; i < lpf1FIR.length; i++) {
    lpf2FIR[i] -= lpf1FIR[i];
    sum+=lpf2FIR[i];
  }
  let scale = 2*gain;///sum;
  for (let i = 0; i < lpf2FIR.length; i++) {
    lpf2FIR[i] *= scale;
  }

  lpf2FIR[(lpf2FIR.length-1)/2] += 1;
  //return lpf1FIR;
  //invertFIRFilterInPlace(lpf2FIR)
  return lpf2FIR;
}



function createLowPassFilterKernel(fcn, order) { //fcn is the normalised cutoff frequency
  // Allocate array for filter coefficients
  let coefficients = new Float32Array(order);
  let M = order - 1;
  let halfM = M / 2;
  let w0_pi = 2 * fcn;

  function sinc(x) {
      if (x === 0) {
          return 1;
      }
      let piX = x*Math.PI;
      return Math.sin(piX) / piX;
  }
  let window = buildBlackmanHarrisWindow(order);

  for (let n = 0; n <= M; n++) {
    coefficients[n] = w0_pi *sinc(w0_pi * (n - halfM)) * window[n];
  }

  //Skip normalisation, should be close enought to one with correct application of pi throughout

  // Ensure the filter has unity gain at DC, this is equivalent to x[n]=1 for all n
  // let sumCoefficients = coefficients.reduce((a, b) => a + b, 0);
  // let invSum = 1 / sumCoefficients;
  // for (let i = 0; i < order; i++) {
  //     coefficients[i] *= invSum;
  // }
  return coefficients;
}

function invertFIRFilterInPlace(filterKernel) {
  const kernelLength = filterKernel.length;
  const centerIndex = (kernelLength-1) / 2;

  // Spectral inversion: Invert the sign of all coefficients.
  for (let i = 0; i < kernelLength; i++) {
    filterKernel[i] = -filterKernel[i];
  }
  filterKernel[centerIndex] += 1;

  // The filterKernel array is now modified in place to represent the HPF.
}




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Using FFT to derive FIR filter from IIR
//Possibly doesn't work for long resonses (probably) but anyway, response is not anywhere near required
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const FFTFunc = getFFTFunctionRealAndImag(FIRFFTLength);
const FIRWindow2 = buildBlackmanHarrisWindow(FIRFFTLength*2);
const FIRWindow = buildBlackmanHarrisWindow(FIRFFTLength);
const iFFTFunc = getInverseFFTFunction(FIRFFTLength);

//https://www.kvraudio.com/forum/viewtopic.php?t=474962
function getMatchingFIRFilterViaFFT(fft) {
  let sign=1;
  for (let i = 0; i < FIRFFTLength; i++) {
    const r = fft.real[i];
    const img = fft.imag[i];
    //Linearise the FFT
    fft.real[i] = sign*Math.sqrt(r * r + img * img);
    sign=-sign;
  }
  let ifft= iFFTFunc(fft.real);
  let result = ifft.real;
  let sum = 0;
  for (let i = 0; i < FIRFFTLength; i++) {
    result[i] = ifft.real[i] * FIRWindow[i];
    sum+= Math.abs(result[i]);
  }
  let invSum=1/sum;
  //Normalise the filter
  for (let i = 0; i < FIRFFTLength; i++) {
    result[i] *= invSum;
  }
  return result;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//IIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getIIRCoefficients(sampleRate, patch) {
  const f_20 = Math.pow(10,3*patch.naughtyFilterFreq); // Frequency/ 20 
  const normalisedF = 20*f_20/sampleRate; // Normalized cutoff frequency
  const Q =1 + (Math.min(250,f_20)-1) *patch.naughtyFilterQ; //Scale MaxQ with frequency, roughly linear, to keep the impulse less than 16k samples, but top out a 250, it gets non-linear above that
  const gainDB = patch.naughtyFilterGain;
  const sqrtGain = Math.pow(10, gainDB / 40); //sqrt of gain

  return {
    coeffs:createParametricEQFilter(normalisedF, sqrtGain, Q),
    fcn:normalisedF,
    Q:Q,
    gain:gainDB===0?0 : Math.sign(gainDB)* Math.pow(10,Math.abs(gainDB) / 20)
  }
}


//Cookbook formulae for audio EQ biquad filter coefficients <- old but still useful when more modern implementations are not needed (eg svt with trapezoid integration)
//by Robert Bristow-Johnson, pbjrbj@viconet.com  a.k.a. robert@audioheads.com
// Peaking EQ filter: H(s) = (s^2 + s*(A/Q) + 1) / (s^2 + s/(A*Q) + 1) analogue transfer function
function createParametricEQFilter(centerFreq, sqrtGain, Q) {
  const w = 2 * Math.PI * centerFreq; //assume already normalised to sample rate
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * Q);
  const A = sqrtGain;

  const b0 = 1 + alpha*A;
  const b1 = -2 * cs;
  const b2 = 1 - alpha*A;
  const a0 = 1 + alpha/A;
  const a1 = -2 * cs;
  const a2 = 1 - alpha/A;

  const inverseA0 = 1 / a0;
  return [b0 * inverseA0, b1 * inverseA0, b2 * inverseA0, a1 * inverseA0 , a2 * inverseA0];
}

//Implementation of H(z) = (b0/a0) * (1 + b1/b0*z^-1 + b2/b0*z^-2) / (1 + a1/a0*z^-1 + a2/a0*z^-2)
//y[n] = (b0/a0)*x[n] + (b1/a0)*x[n-1] + (b2/a0)*x[n-2] - (a1/a0)*y[n-1] - (a2/a0)*y[n-2]
function applyIIRFilter(inputBuffer, coeffs) {
  const [b0, b1, b2, a1, a2] = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  //Direct form I implementation
  for (let n = 0; n < inputBuffer.length; n++) {
    const x0 = inputBuffer[n];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    inputBuffer[n] = y0;
  }
  return inputBuffer;
}
function applyIIRFilterMix(inputBuffer, outputBuffer, coeffs, outputOffset, mix) {
  const [b0, b1, b2, a1, a2] = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  //Direct form I implementation
  for (let n = 0; n < inputBuffer.length; n++) {
    const x0 = inputBuffer[n];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    outputBuffer[n + outputOffset] = y0 * mix;
  }
  return outputBuffer;
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Convolution for FIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


//Returns new buffer of length inputBuffer.length + filterKernel.length - 1
function convolve(inputBuffer, outputBuffer, filterKernel, mix) {
  const inputLength = inputBuffer.length;
  const filterLength = filterKernel.length;
  const outputLength = inputLength + filterLength - 1;
  // const outputBuffer = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
      for (let j = Math.max(0, i - inputLength + 1); j <= Math.min(i, filterLength - 1); j++) {
          outputBuffer[i] += inputBuffer[i - j] * filterKernel[j];
      }
      outputBuffer[i]*=mix;
  }
  //return outputBuffer;
}

//cyclic version of convolution, where input is a circular buffer
//Returns the middle section of the convolution, from half the filter length to half the filter length from the end
//Returns the original buffer with the right values in place
function convolveWrapped(inputBuffer, outputBuffer, filterKernel, mix) {
  const inputLength = inputBuffer.length;
  const filterLength = filterKernel.length;
  const outputLength = inputLength;
  const offset = (filterLength - 1) / 2 +(filterLength %2===0? 0.5 : 0);//filter is odd or even length
  //const outputBuffer = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
      for (let j =0; j <filterLength; j++) {
        let index = (inputLength*2 + i - j + offset)%inputLength
        outputBuffer[i] += inputBuffer[index] * filterKernel[j];
      }
      outputBuffer[i]*=mix;
  }

  // for (let i = 0; i < outputLength; i++) {
  //     inputBuffer[i] = outputBuffer[i];
  // }
  // return inputBuffer;
}