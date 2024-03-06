//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Part of audio engine - but on mainThread - fetches and opens wave files for alternative sounds
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


export function doLowPassFilter(buffer, sampleRate, patch) {
    const cutoffFreq = 0.5* patch.naughtFilterCutOff* patch.naughtFilterCutOff* patch.naughtFilterCutOff; // Normalized cutoff frequency
    const filterOrder = 2000*patch.naughtFilterOrder; // Filter order
    const preRingShift = 0; // Amount of pre-ringing in samples

    const impulseResponse = createLowPassFilter(cutoffFreq, filterOrder, preRingShift);
    return convolve(buffer, impulseResponse);
}

function sinc(x) {
    if (x === 0) {
      return 1;
    } else {
      return Math.sin(Math.PI * x) / (Math.PI * x);
    }
  }


  function createLowPassFilter(cutoffFreq, order, preRingShift) {
    const M = order;
    const fc = cutoffFreq;
    const impulseResponse = new Float32Array(M);
  
    for (let n = 0; n < M; n++) {
      const sincArg = 2 * Math.PI * fc * (n - (M / 2));
      const hannWindow = 0.5 * (1 - Math.cos(2 * Math.PI * n / (M - 1)));
      const preRingPhase = Math.exp(-2 * Math.PI * preRingShift * n / M);
      impulseResponse[n] = 2 * fc * sinc(sincArg) * hannWindow * preRingPhase;
    }
  
    const gain = impulseResponse.reduce((sum, val) => sum + val, 0);
    impulseResponse.forEach((val, idx) => impulseResponse[idx] /= gain);
  
    return impulseResponse;
  }

  function convolve(input, impulseResponse) {
    const M = impulseResponse.length;
    const N = input.length;
    const output = new Float32Array(N + M - 1);
  
    for (let n = 0; n < N + M - 1; n++) {
      let sum = 0;
      for (let k = 0; k < M; k++) {
        if (n - k >= 0 && n - k < N) {
          sum += impulseResponse[k] * input[n - k];
        }
      }
      output[n] = sum;
    }
  
    return output;
  }


