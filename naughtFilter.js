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


import {convolve, convolveWrapped} from './oversampling.js'
import {getFFTFunction, getInverseFFTFunction } from './basicFFT.js';


//Note: non-cyclic input buffers return a new buffer with length = buffer.length + impulseResponse.length - 1
//Cyclic buffer return themselves with the convolution result in the same buffer
let isFIR=false;
export function doFilter(buffer, sampleRate, patch, isCyclic) {
  if (patch.naughtFilterGain === 0) return buffer; // No filtering
  if (isFIR){
    const impulseResponse = getImpulseResponse(sampleRate, patch);
    return isCyclic? convolveWrapped(buffer, impulseResponse) : convolve(buffer, impulseResponse);
  }
  else{
    const coeffs = getIIRCoefficients(sampleRate, patch);
    return applyIIRFilter(buffer, coeffs);
  
  }
}



export function getImpulseResponse(sampleRate, patch) {
  if (patch.naughtFilterGain === 0) return new Float32Array([1]); // No filtering
  const coeffs =getIIRCoefficients(sampleRate, patch);
  let impulseResponse = new Float32Array(16384);
  impulseResponse[0] = 1;
  applyIIRFilter(impulseResponse, coeffs);
  impulseResponse[0] = 0; // Remove impulse
  return impulseResponse;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//FIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const FFTFunc = getFFTFunction(16384);
const iFFTFunc = getInverseFFTFunction(16384);
function getMatchingFIRFilter(impulseResponse) {
  const fft = FFTFunc(impulseResponse.length);
  for (let i = 0; i < impulseResponse.length; i++) {
    fft[i] = ffr.phase[i];
  }
  return fft;

}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//IIR filter
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function getIIRCoefficients(sampleRate, patch) {
  const f_20 = Math.pow(10,3*patch.naughtFilterFreq); // Frequency/ 20 
  const normalisedF = 20*f_20/sampleRate; // Normalized cutoff frequency
  const Q =1 + (Math.min(250,f_20)-1) *patch.naughtFilterQ; //Scale MaxQ with frequency, roughly linear, to keep the impulse less than 16k samples, but top out a 250, it gets non-linear above that
  const gainDB = patch.naughtFilterGain;

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
function applyIIRFilter(buffer, coeffs) {
  const [b0, b1, b2, a1, a2] = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  //Direct form I implementation
  for (let n = 0; n < buffer.length; n++) {
    const x0 = buffer[n];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    buffer[n] = y0;
  }
  return buffer;
}
