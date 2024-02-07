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
function distort(buffer, patch, sampleRate, isCyclic, includeInharmonics, randomSeed){
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

    let ob =patch.HQJitter>0? jitter_sinc(buffer, oversampling, patch.HQJitter, randomSeed, isCyclic) : (  oversampling==1 ? buffer :  upsample(buffer, filter, polyphaseKernels, isCyclic));

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
    if (patch.jitter>0) 
    {
        jitter_ADC(ob, patch.jitter, randomSeed, isCyclic);
    }

    

    if (oversampling>1) 
    {
        downsample(ob, buffer, filter, oversampling, isCyclic);
    }
    else if (patch.HQJitter>0)
    {
        for(let i=0;i<buffer.length;i++)
        {
            buffer[i] = ob[i];
        }
    }
}

function jitter_ADC(buffer, amount, seed, isCyclic){
    let rand =new  SeededSplitMix32Random(seed)
    let length = buffer.length;
    for(let i=0;i<length;i++){
        let y1 = buffer[i];
        let y0, y2;
        // let x0=-1;
        // let x1=0;
        // let x2=1;

        if (isCyclic) {
            // Wrap edge values
            y0 = buffer[(i - 1 + length) % length];
            y2 = buffer[(i + 1) % length];
        } else {
            // Set edge values to zero
            y0 = i - 1 >= 0 ? buffer[i - 1] : 0;
            y2 = i + 1 < length ? buffer[i + 1] : 0;
        }

        // Quadratic interpolation
        let x =  (boxMullerRandom(rand)*0.5) * amount;//-1<->+1 +-amount/2 - max of half sample period either side

        // let y = ((t - x1) * (t - x2) / ((x0 - x1) * (x0 - x2))) * y0
        //        + ((t - x0) * (t - x2) / ((x1 - x0) * (x1 - x2))) * y1
        //        + ((t - x0) * (t - x1) / ((x2 - x0) * (x2 - x1))) * y2;

        buffer[i] = (x  * (x - 1) / 2) * y0
        - (x + 1) * (x - 1) * y1
        + ((x + 1) * x / 2) * y2;

    }
}


//outBuffer length assumed to be inBuffer.length * some constant
const jitterWindowSize=200
function jitter_sinc(inBuffer, oversampling, amount, seed, isCyclic){
    let rand = new SeededSplitMix32Random(seed)//ensure jitter is the same on both channels in stereo so reuse same seed
    const length = inBuffer.length;
    const os = oversampling;
    const outLength = length * os;
    const outBuffer = new Float32Array(outLength);
    const range = jitterWindowSize * os/2;
    const outLength2 = outLength*Math.ceil(range/ outLength);//make sure wrapping will work if cyclic increase size of Outlength2 if range is bigger than outlength

    let a0 = 0.35875 ;
    let a1 = 0.48829 ;
    let a2 = 0.14128;
    let a3 = 0.01168;
    //Blackman-harris window (windowsSize-1) to ensure 1 at end
    let windowScale =2 * Math.PI /((jitterWindowSize*os - 1));
    let sincScale =Math.PI / os; //pi*2*fNyquist/oversampling    fNyquist = 1/2 , os term to reduce due to higher sample rate when overclocked

    //let shiftW = 0.5*Math.PI/os

    for(let i=0;i<length;i++){
        //if (i!=200)continue;
        let v = inBuffer[i];
        let outI=i*os;

        //const shift =os * (Math.random() - 0.5) * amount;//0-1=> +-os*amount/2 - max of half input sample period either way
        const shift =os * (boxMullerRandom(rand)*0.3) * amount;//-1<->+1=> +-os*amount/2 - max of half input sample period either way
        //const shift = os * Math.sin(shiftW*i) * amount;//0-1=> +-os*amount/2 - max of half input sample period either way
        const windowStart = shift-range;
        const startJ =Math.ceil(windowStart); //points below this will be zero
        const endJ =Math.floor(shift+range);//inclusive - points above this will be zero

        //write this sample to the outBuffer using sinc interpolation
        for(let j=startJ;j<=endJ;j++){
            //Check out bounds are in range before calc
            let outJ =outI+j;
            if (outJ<0 || outJ>=outLength)
            {
                if (isCyclic){
                    outJ = (outLength2 +outJ) % outLength;//wrap - range checked above
                }
                else{
                    continue;//skip for non-cyclic
                } 
            }

            //calc windowed sinc value at this point
            let a=v;
            let t=sincScale * (j-shift);//Position in sinc function
            if (t!=0)  //window and sinc are 1 at t=zero
            {
                let w =windowScale * (j-windowStart); //position in window 0-1
                //Blackman-harris window
                a*=a0 - a1 * Math.cos( w )+ a2 * Math.cos(2 *  w )- a3 * Math.cos(3 *  w );
                //Sinc function
                a*=Math.sin(t)/(t);
            }
            outBuffer[outJ]+=a;
        }
    }
    return outBuffer;
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


function addUltrasonic(ob, w,  level, isCyclic)
{
    if (isCyclic) 
    {
        addUltrasonicCyclic(ob, w, level)
    }
    else
    {
        addUltrasonicOneshot(ob, w, level)
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
function addUltrasonicOneshot(ob, w, level)
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





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Seeded random number generator giving normal distribution of values
//Directly from Github Copilot \/(^_^)\/
//SplitMix32 ->from refrenced stackoverflow posts
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