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

function getJitterTimeReport(sampleRate, amount){
    return (DACJitterFactor * Math.sqrt(2) * amount * 1000000 / sampleRate).toFixed(2)+"µs "; //root 2 for standard deviation to rms
}



//outBuffer length assumed to be inBuffer.length * some constant
const jitterOversampling = 3;//FIXED DON~T CHANGE
const DACJitterFactor=0.25;
const periodJitterFrequency = 37;
const jitterDownsampleFilter = generateBlackmanHarrisFilterKernel(0.5/jitterOversampling, 30*jitterOversampling);
function jitter(inBuffer, sampleRate, patch, isCyclic, randomSeed)
{
    if (patch.jitterADC==0 && patch.jitterDAC==0 && patch.jitterPeriodic==0)  return ;
    const DACAmount = patch.jitterDAC;
    const ADCAmount = patch.jitterADC;
    const periodicAmount = patch.jitterPeriodic;
    let rand = new SeededSplitMix32Random(randomSeed)//ensure jitter is the same on both channels in stereo so reuse same seed
    const length = inBuffer.length;
    const os = jitterOversampling;
    const outLength = length * os;
    const outBuffer = new Float32Array(outLength);

    //Maintain 4 points,
    //For ADC interpolation:
    //y1, y2, y3 are interpolation points - where shape is maintained but point of sample is shifted around y2 - so y2 is "jittered"
    //x1, x2, x3 are considered to be -1, 0, 1 - ie fixed in time. x is the jittered sample point for 
    //For DAC interpolation:
    //x0, x1, x2 are jittered to simulate playback jitter
    //Samples are taken from the Lagrange polynomial at x=0 and points either side
    let x0=-1
    let x1=0; 
    let y0=0;
    let y1=0;
    let y2=0;
    let x2=1;
    
    const periodicW = 2*Math.PI*periodJitterFrequency/sampleRate;
    //Do extra steps at start and end to allow for cyclic buffer to collect wrapped values
    for(let i=(isCyclic?-2 : 0 );i<length;i++){
        let outI=i*os+1;//The sync point to align samples when downsampling is offset by +1    so zero stuffing like [0,S,0] instead of [S,0,0]
        
        
        let y3=0;
        let x3 =2 + DACJitterFactor *( boxMullerRandom(rand) * DACAmount);//
        if (periodicAmount>0){
            x3 += DACJitterFactor *periodicAmount * Math.sin(periodicW*i);
        }

        let doCalc = true;
        if (isCyclic) {
            // Wrap edge values
            y3 = inBuffer[(length + i + 2) % length];
            doCalc = i>=0;
        } else
        {
            // Set edge values to zero
            y3 = i + 2 < length ? inBuffer[i + 2] : 0;
        }

        //Calculate sample time offset for y2 from integer point
        let t2 =  (boxMullerRandom(rand)*DACJitterFactor) * ADCAmount;//-1<->+1 +-amount

        //Core Lagrange interpolation
        // x values fixed 
        // let y = ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
        //        + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
        //        + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;
        //Shifted for y1,y2,y3
        // let y = ((t - x2) * (t - x3) / ((x1 - x2) * (x0 - x3))) * y1
        //        + ((t - x1) * (t - x3) / ((x2 - x1) * (x2 - x3))) * y2
        //        + ((t - x1) * (t - x2) / ((x3 - x1) * (x3 - x2))) * y3;
        //Using x1=-1, x2=0, x3=1
        y2 = (t2  * (t2 - 1) / 2) * y1
        - (t2 + 1) * (t2 - 1) * y2
        + ((t2 + 1) * t2 / 2) * y3;





        if (doCalc){
            //Fill in points either side of x1 (j=0), The sync point to align samples when downsampling is offset by +1
            //Lagrange interpolation - 3 points x varies depending on jitter
            const d1= y0/((x0 - x1) * (x0 - x2));
            const d2= y1/((x1 - x0) * (x1 - x2));
            const d3= y2/((x2 - x0) * (x2 - x1));
            for (let j=-1;j<=1;j++){    
                let t = j/os;
                outBuffer[outI+j] = 
                      (t - x1) * (t - x2)  * d1
                    + (t - x0) * (t - x2)  * d2
                    + (t - x0) * (t - x1) * d3;
                // outBuffer[outI+j] = 
                //       ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
                //     + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
                //     + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;
            }


        }
        x0=x1-1;
        x1=x2-1;
        x2=x3-1;
        y0=y1;
        y1=y2;
        y2=y3;
    }

    downsample(outBuffer, inBuffer, jitterDownsampleFilter, os, isCyclic, +1);//+1 to align samples when downsampling is offset by +1
}




// function jitter_ADC(buffer, amount, seed, isCyclic){
//     let rand =new  SeededSplitMix32Random(seed)
//     let length = buffer.length;
//     for(let i=0;i<length;i++){
//         let y1 = buffer[i];
//         let y0, y2;
//         // let x0=-1;
//         // let x1=0;
//         // let x2=1;

//         if (isCyclic) {
//             // Wrap edge values
//             y0 = buffer[(i - 1 + length) % length];
//             y2 = buffer[(i + 1) % length];
//         } else {
//             // Set edge values to zero
//             y0 = i - 1 >= 0 ? buffer[i - 1] : 0;
//             y2 = i + 1 < length ? buffer[i + 1] : 0;
//         }

//         // Quadratic interpolation
//         let x =  (boxMullerRandom(rand)*0.5) * amount;//-1<->+1 +-amount/2 - max of half sample period either side

//         // let y = ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
//         //        + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
//         //        + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;

//         buffer[i] = (x  * (x - 1) / 2) * y0
//         - (x + 1) * (x - 1) * y1
//         + ((x + 1) * x / 2) * y2;

//     }
// }

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Seeded random number generator giving normal distribution of values
//Originally direct from  Github Copilot \/(^_^)\/
//but changed SplitMix32 ->from referenced stackoverflow posts
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Seeded random number generator
function SeededSplitMix32Random(seed) {
    this.m = 0x80000000-1; // 2**31;
    this.state =Math.floor( (seed ? seed : Math.random()) *this.m);
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
    while(u === 0) u = seededRandom.nextFloat(); //exclude zero
    while(v === 0) v = seededRandom.nextFloat(); //exclude zero
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}