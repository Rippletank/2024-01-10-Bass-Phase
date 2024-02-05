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
//Oversampling code
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

//References:

//General overview: https://www.nickwritesablog.com/introduction-to-oversampling-for-alias-reduction/
//Specific approaches (including window function choice and sinc filter kernal size):
//https://www.kvraudio.com/forum/viewtopic.php?t=556692
//Specifically, the top post here is very helpful on Polyphase upsampling:
//https://www.kvraudio.com/forum/viewtopic.php?t=556692&start=45
//Although correctly aligning polyphase kernals was a pain, it is basically the appoach outlined in that post

//Kaiser window: https://en.wikipedia.org/wiki/Kaiser_window
//Solution for I0(x) first order modified bessel function:
//https://www.foo.be/docs-free/Numerical_Recipe_In_C/c6-6.pdf  practical calculation
//Cross-referenced source of expansion and coefficents of above:
//Handbook of mathematical functions, Abramowitz and Stegun, Version 1.1, 1972
//P378 - polynomial approximations for In(x)
//https://www.cs.bham.ac.uk/~aps/research/projects/as/resources/AandS-a4-v1-2.pdf 
//Which references: 
//Polynomial Expansion of Modified Bessel Functions of the First Kind, E. E. Allen, Math. Tables Aids Comp. 10, 162-164 (1956)

//transition-band/Stop-band parameter for choosing beta and N for Kaiser window:
//https://tomroelandts.com/articles/how-to-create-a-configurable-filter-using-a-kaiser-window
//Which uses emiprical formula from  "Digital Filters" by James kaiser in "System Analysis by Digital Computer," edited by F.F. Kuo and J.F. Kaiser (1966)


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Window function
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Approximate the Zeroth order modified Bessel function of the first kind (I0)
// References above
function besselI0(x) {
    const ax = Math.abs(x);
    if (ax < 3.75) { // Polynomial fit
        let t2 = x / 3.75;
        t2 *= t2;//t^2
        return 1.0 + t2 * (3.5156229 
                    + t2 * (3.0899424 
                     + t2 * (1.2067492 
                      + t2 * (0.2659732 
                       + t2 * (0.0360768 
                        + t2 * 0.0045813)))));//error < 1.6e-7
    } else {
        let invt = 3.75 / ax; //=1/t
        return (Math.exp(ax) / Math.sqrt(ax)) 
            * (0.39894228 
              + invt * (0.01328592
               + invt * (0.00225319
                + invt * (-0.00157565 
                 + invt * (0.00916281
                  + invt * (-0.02057706 
                   + invt * (0.02635537 
                    + invt * (-0.01647633
                     + invt * 0.00392377))))))));//error < 1.9e-7
    }
}

// Kaiser Window Function
function kaiserWindow(N, alpha) {
    const window = new Array(N);
    const denom = besselI0(Math.PI * alpha);

    for (let n = 0; n < N; n++) {
        const term = (2 * n / (N - 1)) - 1; // Normalized time index from -1 to 1
        window[n] = besselI0(Math.PI * alpha * Math.sqrt(1 - term * term)) / denom;
    }

    return window;
}



//fn = normalizedFrequency, 1 = fs, fc/fs
//N = number of samples requested for the window
//beta = shape parameter, adjust based on desired sidelobe level and transition width
function generateKasierFilterKernel_betaN(fn, N, beta) {
    if (N % 2 === 0) N++; // Odd number of samples - gives centre exactly on a sample point
    const filterKernel = new Array(N);
    const invKDenom = 1/besselI0(beta);//1/Kaiser denominator
    const offset = (N - 1) / 2;//mid point of odd number of points, centre of filter
    const invOffset = 1 / offset;
    const fn2= fn*2*Math.PI;//2*normalized frequency
    let sumCoeffs = 0;

    for (let n = 0; n < N; n++) {
        const no = n - offset; // Center the sinc function

        // Calculate sinc function, handling the division by zero at the center
        const x = no * fn2;
        const sinc = (no === 0) ? 1 : Math.sin(x) / x;

        // Calculate Kaiser window 
        const t = no*invOffset; // Normalized from -1 to 1
        const kaiser = besselI0(beta * Math.sqrt(1 - t * t)) *invKDenom;

        // Multiply sinc by Kaiser window
        let c = sinc * kaiser;
        filterKernel[n] = c;
        sumCoeffs += c;
    }
    //Normalize for unity gain at dc
    const invSumCoeffs = 1 / sumCoeffs;
    for (let n = 0; n < N; n++) {
        filterKernel[n] *= invSumCoeffs;
    }

    return filterKernel;
}

//fn = normalizedFrequency, 1 = fs, fc/fs
//N = number of samples requested for the window
//alpha = shape parameter, adjust based on desired sidelobe level and transition width
function generateKaiserSincKernel_alphaN(fn, N, alpha) {
    return generateKasierFilterKernel_betaN(fn, N, Math.PI * alpha)
}

//fn = fc/fs normalized frequency, 1 = fs, fc/fs
//stop_db = desired stopband attenuation in db (assumed always >50db)
//transition_width = in normalised frequency, 1 = fs, tw/fs
//See reference above for source
function generateKaiserSincKernel_fromParams(fn, stop_db, transition_width) {
    const beta = 0.1102 * (stop_db - 8.7);
    let N = Math.ceil((stop_db - 8) / (2.285 * 2 * Math.PI * transition_width))+1;  //transition width in normalised, tw/fs
    return generateKasierFilterKernel_betaN(fn, N, beta);
}


function generateUpsamplingPolyphasekernals(filter, upsampleFactor){
    const polyphaseKernals = new Array(upsampleFactor);
    const polyphaseLength = Math.ceil(filter.length/upsampleFactor);//Ceiling, incase filter length is not a multiple of upsampleFactor, some will have zero length
    for(let i=0;i<upsampleFactor;i++){
        polyphaseKernals[i] = new Array(polyphaseLength);
    }

    //Account for filter length not being a multiple of upsampleFactor
    //Pad the first few polyphaseKernals with zeros
    let ppk =polyphaseLength * upsampleFactor-filter.length;//pad zeros at start of first few polyphaseKernals
    for(let i=0;i<ppk;i++){
        polyphaseKernals[i][0] = 0;
    }

    //Fill the rest of the polyphaseKernals
    let x = 0;
    for(let i = 0; i < filter.length; i++){
        polyphaseKernals[ppk][x] = filter[i]* upsampleFactor;
        ppk++;
        if (ppk>=upsampleFactor){
            ppk=0;
            x++;
        }
    }

    //Confirm integrity
    //confirmPolyphaseKernals(filter, upsampleFactor, polyphaseLength, polyphaseKernals);

    return polyphaseKernals;
}




function confirmPolyphaseKernals(filter, upsampleFactor, polyphaseLength, polyphaseKernals) {
    report = [];
    for (let i = 0; i < filter.length; i++) {
        //Flip to start at the end
        let f = upsampleFactor * filter[i];

        //Find polyphase position
        let startAdjust = (polyphaseLength * upsampleFactor - filter.length); //adjust for zero padding at start of polyphaseKernals
        let fractionalPos = (startAdjust + i) / upsampleFactor;
        let polyphasePos = Math.floor(fractionalPos);
        let polyphase = (fractionalPos % 1) * upsampleFactor;

        let p = polyphaseKernals[polyphase][polyphasePos];
        if (p != f) {
            let p0 = polyphaseKernals[0][polyphasePos];
            let p1 = polyphaseKernals[1][polyphasePos];
            let p2 = polyphaseKernals[2][polyphasePos];
            let p3 = polyphaseKernals[3][polyphasePos];
            report.push({ x: i, f, p, fractionalPos, polyphasePos, p0, p1, p2, p3 });
        }
    }
    if (report.length > 0) {
        console.log('Error in polyphaseKernals');
        console.log('KernalSize ' + filter.length);
        console.log(report);
    }
    else {
        console.log('polyphaseKernals OK');
    }
}

function upsample(buffer, filter, polyphaseKernels, isCyclic){
    // //Timimg tests
    // examples slow vs fast: 1024 samples, 915 filter length, 4x upsample 49ms vs 4.2ms
    // examples slow vs fast: 29280 samples, 915 filter length, 4x upsample 109ms vs 1527ms
    // console.log('upsample test - buffer length: ' + buffer.length + ' filter length: ' + filter.length + ' upsampleFactor: ' + polyphaseKernels.length);
    // let time1 = performance.now();
    // const result = upsampleCyclic(buffer, polyphaseKernels, filter.length);
    // let time2 = performance.now();
    // console.log('upsampleCyclic: ' + (time2 - time1) + 'ms');
    // time1 = performance.now();
    // const result2 = upsampleCyclicSlow(buffer, filter, polyphaseKernels.length);
    // time2 = performance.now();
    // console.log('upsampleCyclicSlow: ' + (time2 - time1) + 'ms');

    // Equivalence test - debug only
    // if (isCyclic)
    // {
    //     let debug1=[]
    //     upsampleCyclicSlow(buffer, filter, polyphaseKernels.length,debug1);
    //     let debug2=[]
    //     upsampleCyclic(buffer, polyphaseKernels, filter.length,debug2); 
    //     if (debug1.length!=debug2.length) 
    //     {
    //         console.log('debug length mismatch');
    //     }
    //     else{let iCount=10
    //         for(let i=0;i<debug1.length;i++){
    //             if (debug1[i].length!=debug2[i].length) 
    //             {
    //                 console.log('Point count mismatch at ' + i);
    //             }
    //             else
    //             {
    //                 let count =10
    //                 for(let j=0;j<debug1[i].length;j++){
    //                     if (debug1[i][j].i!=debug2[i][j].i || debug1[i][j].in!=debug2[i][j].in || debug1[i][j].f!=debug2[i][j].f) 
    //                     {
    //                         console.log('Point mismatch at ' + i + ' ' + j +
    //                         ' i:' + debug1[i][j].i + ' ' + debug2[i][j].i +
    //                         ' in:' + debug1[i][j].in + ' ' + debug2[i][j].in +
    //                         ' f:' + debug1[i][j].f + ' ' + debug2[i][j].f);
    //                         if (--count==0) break;
    //                     }
    //                 }
    //                 if (--iCount==0) break;
    //             }
    //         }
    //     }
    // }
    

    return isCyclic? 
    //upsampleCyclicSlow(buffer, filter, polyphaseKernels.length) 
    upsampleCyclic(buffer, polyphaseKernels, filter.length) 
    : upsampleNonCyclic(buffer, polyphaseKernels, filter.length);
}

function upsampleCyclicSlow(inBuffer, filter, upsampleFactor, debug){
    const inLength = inBuffer.length;
    const outLength = inLength*upsampleFactor; //Cyclic so no padding
    const result = new Array(outLength);
    const filterLength = filter.length;
    const inPos =-(filterLength-1)/2;//Assumes zero stuffing between samples
    for (let i = 0; i < outLength; i++) {
        result[i] = 0;
        let log =[]
        for (let j =0; j <filterLength; j++) {
            const x = (i+j + inPos)/upsampleFactor;
            const pos = (inLength + x)%inLength;
            if (Math.abs(pos) % 1>0) continue;//skip fractional values - pad with zeros
            result[i] += inBuffer[pos] * filter[j] * upsampleFactor;
            if (debug) log.push({i, in:pos, f:j});
        }
        if (debug) debug.push(log);
    }
    return result
}

function upsampleCyclic(inBuffer, polyphaseKernels, filterLength, debug){
    const polyphaseLength = polyphaseKernels[0].length;
    const upsampleFactor = polyphaseKernels.length;
    const inLength = inBuffer.length;
    const outLength = inLength*upsampleFactor; //Cyclic so no padding
    const result = new Array(outLength);
    const filterOffsetIn =(filterLength-1)/2/upsampleFactor;//As if zero stuffing between samples
    let inPos = -Math.floor(filterOffsetIn);//As if zero stuffing between samples
    const inPosAdjust = (filterOffsetIn%1)*upsampleFactor;//

    //polySettings    
    const startAdjust = (polyphaseLength * upsampleFactor - filterLength); //adjust for zero padding at start of polyphaseKernals
    const startFractionalPos = (inPosAdjust + startAdjust ) / upsampleFactor;
    inPos -= Math.floor(startFractionalPos);
    const startPolyphase = Math.round((startFractionalPos % 1) * upsampleFactor);//Round for unusual  upsampleFactors, eg 7


    let ppk = startPolyphase;
    for (let i = 0; i < outLength; i++) {
        result[i] = 0;
        let filterPos =ppk - startAdjust
        let log =[]
        for (let j =filterPos<0?1:0; j <polyphaseLength; j++) {
            const x =(inLength + inPos + j)%inLength;
            result[i] += inBuffer[x] * polyphaseKernels[ppk][j];
            if (debug) log.push({i, in:x, f:ppk-startAdjust+j*upsampleFactor});
        }
        if (debug) debug.push(log);
        ppk--;//<--Fucker to find this was -ve, ha
        if(ppk<0) 
        {
            ppk=upsampleFactor-1;
            inPos++;//overflow handled by checks in j loop
        }
    }
    return result
}
function upsampleNonCyclic(buffer, polyphaseKernels, filterLength){
    const polyphaseLength = polyphaseKernels[0].length;
    const upsampleFactor = polyphaseKernels.length;
    const inLength = buffer.length;
    const outLength = inLength*upsampleFactor; //Cyclic so no padding
    const result = new Array(outLength);
    const filterOffsetIn =(filterLength-1)/2/upsampleFactor;//As if zero stuffing between samples
    let inPos = -Math.floor(filterOffsetIn);//As if zero stuffing between samples
    const inPosAdjust = (filterOffsetIn%1)*upsampleFactor;//

    //polySettings    
    const startAdjust = (polyphaseLength * upsampleFactor - filterLength); //adjust for zero padding at start of polyphaseKernals
    const startFractionalPos = (inPosAdjust + startAdjust ) / upsampleFactor;
    inPos -= Math.floor(startFractionalPos);
    const startPolyphase = Math.round((startFractionalPos % 1) * upsampleFactor);//Round for unusual  upsampleFactors, eg 7


    let ppk = startPolyphase;
    for(let i=0;i<outLength;i++){
        result[i] =0;
        let filterPos =ppk - startAdjust;
        const polyEnd = Math.min(polyphaseLength, inLength-inPos);//truncate last polyphaseKernal if it extends past end of in buffer
        for(let j=Math.max(filterPos<0?1:0,-inPos);//skip negative values of inStart
                j<polyEnd;//skip past end of in buffer if polyphaseKernal is longer than remaining buffer
                j++){
                    const x =(inLength + inPos + j)%inLength;
                    result[i] += buffer[x] * polyphaseKernels[ppk][j];
                } 
        ppk--;
        if(ppk<0) 
        {
            ppk=upsampleFactor-1;
            inPos++;//overflow handled by checks in j loop
        }
    } 

    return result;
}

//This should work for cyclic and non-cyclic buffers since the upsampling should have included the necessary padding either side of the main part
function downsample(inBuffer, outBuffer, filterKernel, upsampleFactor, isCyclic)
{
    return isCyclic? downsampleCyclic(inBuffer, outBuffer, filterKernel, upsampleFactor) : downsampleNonCyclic(inBuffer, outBuffer, filterKernel, upsampleFactor);
}

function downsampleCyclic(inBuffer, outBuffer, filterKernel, upsampleFactor)
{
    const filterLength = filterKernel.length;
    const inLength = inBuffer.length;
    const outLength = outBuffer.length;
    const filterOffset = (filterLength-1)/2;
    let inPos = -filterOffset;//dont need samples until filter centre lines up 

    for(let i=0;i<outLength;i++){
        outBuffer[i]=0;
        for(let j=0;j<filterLength;j++){
            outBuffer[i] += inBuffer[(inLength + inPos+j)%inLength] * filterKernel[j];
        }
        inPos+=upsampleFactor;
    }
}

function downsampleNonCyclic(inBuffer, outBuffer, filterKernel, upsampleFactor)
{
    const filterLength = filterKernel.length;
    const inLength = inBuffer.length;
    const outLength = outBuffer.length;
    const filterOffset = (filterLength-1)/2;
    let inPos = -filterOffset;//dont need samples until filter centre lines up with first sample of inbuffer

    for(let i=0;i<outLength;i++){
        outBuffer[i]=0;
        const filterEnd = Math.min(filterLength, inLength-inPos);//truncate last filter if it extends past end of in buffer
        for(let j=Math.max(0,-inPos);//skip negative values of inStart
                j<filterEnd;//skip past end of in buffer if filter is longer than remaining buffer
                j++){
                    outBuffer[i] += inBuffer[inPos+j] * filterKernel[j];
        }
        inPos+=upsampleFactor;
    }
}

//just plain filterting to test filter kernel
function filterOnly(inBuffer, outBuffer, filterKernel)
{
    const filterLength = filterKernel.length;
    const inLength = inBuffer.length;
    const outLength = outBuffer.length;
    const filterOffset = (filterLength-1)/2;
    let inPos = -filterOffset;
    for(let i=0;i<outLength;i++){
        let sum =0;
        const filterEnd = Math.min(filterLength, inLength-inPos);//truncate last filter if it extends past end of in buffer
        for(let j=Math.max(0,-inPos);//skip negative values of inStart
                j<filterEnd;//skip past end of in buffer if filter is longer than remaining buffer
                j++){
            const k = inPos+j;
            sum += inBuffer[k] * filterKernel[j];
        }
        inPos+=1;
        outBuffer[i] = sum;
    }
}

function convolve(inputBuffer, filterKernel) {
    const inputLength = inputBuffer.length;
    const filterLength = filterKernel.length;
    const outputLength = inputLength + filterLength - 1;
    const outputBuffer = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        for (let j = Math.max(0, i - inputLength + 1); j <= Math.min(i, filterLength - 1); j++) {
            outputBuffer[i] += inputBuffer[i - j] * filterKernel[j];
        }
    }
    return outputBuffer;
}

function convolveWrapped(inputBuffer, filterKernel) {
    const inputLength = inputBuffer.length;
    const filterLength = filterKernel.length;
    const outputLength = inputLength + filterLength - 1;
    const outputBuffer = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        for (let j =0; j <filterLength; j++) {
            outputBuffer[i] += inputBuffer[(inputLength + i - j)%inputLength] * filterKernel[j];
        }
    }

    return outputBuffer;
}