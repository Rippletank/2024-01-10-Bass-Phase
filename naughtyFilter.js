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
import {getFFTFunctionRealAndImag, getInverseFFTFunction } from './basicFFT.js';


//Note: non-cyclic input buffers return a new buffer with length = buffer.length + impulseResponse.length - 1
//Cyclic buffer return themselves with the convolution result in the same buffer
let isFIR=true;
export function doFilter(buffer, sampleRate, patch, isCyclic) {
  const coeffs = getIIRCoefficients(sampleRate, patch);

  if (patch.naughtyFilterMix === 0){
    //Simple case - only IIR
    return applyIIRFilter(buffer, coeffs);//Same input as output buffer - saves memory/allocation time
  }

  const FIRImpulse = getImpulseResponse(sampleRate, patch, coeffs).fftImpulse;

  if (isCyclic){
    const outputBuffer = new Float32Array(buffer.length);
    convolveWrapped(buffer, outputBuffer, FIRImpulse, patch.naughtyFilterMix);
    if (patch.naughtyFilterMix<1) applyIIRFilterMix(buffer, outputBuffer, coeffs, 0, 1-patch.naughtyFilterMix);
    for(let i=0;i<buffer.length;i++){
      buffer[i]=outputBuffer[i];
    }
    return buffer; //Same input as output buffer - works for Previews
  }
  else{
    const outputBuffer = new Float32Array(buffer.length + FIRImpulse.length - 1);
    convolve(buffer, outputBuffer, FIRImpulse, patch.naughtyFilterMix);
    if (patch.naughtyFilterMix<1) applyIIRFilterMix(buffer, outputBuffer, coeffs, FIRImpulse.length/2, 1-patch.naughtyFilterMix);
    return outputBuffer;
  }
}



export function getImpulseResponse(sampleRate, patch, preCalcedCoeffs=null) {
  if (patch.naughtyFilterGain === 0) return {
    fftImpulse: new Float32Array(1).fill(1),
    iirImpulse: new Float32Array(1).fill(1),
    fft: new Float32Array(FIRFFTLength).fill(1),
  }; // No filtering
  const coeffs =preCalcedCoeffs ?? getIIRCoefficients(sampleRate, patch);
  let impulseResponse = new Float32Array(FIRFFTLength);
  impulseResponse[0] = 1;
  applyIIRFilter(impulseResponse, coeffs);
  impulseResponse[0] = 0; // Remove impulse
  return getMatchingFIRFilter(impulseResponse);
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//FIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const FIRFFTLength = 4096;//16384;
const FFTFunc = getFFTFunctionRealAndImag(FIRFFTLength);
const iFFTFunc = getInverseFFTFunction(FIRFFTLength);
const FIRWindow = buildBlackmanHarrisWindow(FIRFFTLength);
const FIRWindow2 = buildBlackmanHarrisWindow(FIRFFTLength*2);

//https://www.kvraudio.com/forum/viewtopic.php?t=474962
function getMatchingFIRFilter(impulseResponse) {
  const imp = new Float32Array(FIRFFTLength);
  const offset = 0;//FIRFFTLength / 2;//firlength must be even, but the filter will be odd
  const length = Math.min(offset+ impulseResponse.length, FIRFFTLength);
  for (let i = offset; i < length; i++) {
    imp[i] = impulseResponse[i] * FIRWindow2[FIRFFTLength + i];
  }
  const fft = FFTFunc(imp);
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
    result[i] *= FIRWindow[i];
    sum+= Math.abs(result[i]);
  }
  let invSum=1/sum;
  //Normalise the filter
  for (let i = 0; i < FIRFFTLength; i++) {
    result[i] *= invSum;
  }

  return {
    fftImpulse: result,
    iirImpulse: impulseResponse,
    fft: fft.real,
  }
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//IIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getIIRCoefficients(sampleRate, patch) {
  const f_20 = Math.pow(10,3*patch.naughtyFilterFreq); // Frequency/ 20 
  const normalisedF = 20*f_20/sampleRate; // Normalized cutoff frequency
  const Q =1 + (Math.min(250,f_20)-1) *patch.naughtyFilterQ; //Scale MaxQ with frequency, roughly linear, to keep the impulse less than 16k samples, but top out a 250, it gets non-linear above that
  const gainDB = patch.naughtyFilterGain;

  return createParametricEQFilter(normalisedF, gainDB, Q);
}


//Cookbook formulae for audio EQ biquad filter coefficients <- old but still useful when more modern implementations are not needed (eg svt with trapezoid integration)
//by Robert Bristow-Johnson, pbjrbj@viconet.com  a.k.a. robert@audioheads.com
// Peaking EQ filter: H(s) = (s^2 + s*(A/Q) + 1) / (s^2 + s/(A*Q) + 1) analogue transfer function
function createParametricEQFilter(centerFreq, gainDB, Q) {
  const w = 2 * Math.PI * centerFreq; //assume already normalised to sample rate
  const sn = Math.sin(w);
  const cs = Math.cos(w);
  const alpha = sn / (2 * Q);
  const A = Math.pow(10, gainDB / 40); //sqrt of gain

  const a0 = 1 + alpha/A;
  const a1 = -2 * cs;
  const a2 = 1 - alpha/A;
  const b0 = 1 + alpha*A;
  const b1 = -2 * cs;
  const b2 = 1 - alpha*A;

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
  const offset = (filterLength - 1) / 2 +0.5;//filter is from FFT so symmetric and even
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