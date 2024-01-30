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

//Filter design (not used in the end, but great background referenece)
//https://www.kvraudio.com/forum/viewtopic.php?t=350246 && https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.1.2.pdf?sscid=11k8_zwuzf


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


function generateUpsamplingPolyphasekernals(filterKernal, upsampleFactor){
    const polyphaseKernals = new Array(upsampleFactor);
    const polyphaseLength = Math.ceil(filterKernal.length/upsampleFactor);//Careful, if filterKernal.length is not a multiple of upsampleFactor, this will be rounded up
    for(let i=0;i<upsampleFactor;i++){
        const polyphaseKernal = new Array(polyphaseLength);
        const phaseEnd = filterKernal.length-1-i;//align last (right) edge of first phase with first(left) sample of filterKernal
        for(let j=0;j<polyphaseLength;j++){
            const source=phaseEnd-j*upsampleFactor;//Step back through filterKernal, skipping upsampleFactor samples each time
            polyphaseKernal[polyphaseLength-1-j] //Backwards to align end (right ) with start
                = source <0?0: upsampleFactor*filterKernal[source];//pad with zeros at the start when it source is negative, upsampleFactor* to adjust gain for zero padding
        }
        polyphaseKernals[i] = polyphaseKernal;
    }

    //Confirm integrity
    report =[];
    for(let i=0;i<filter.length;i++){
        //Flip to start at the end
        let f = upsampleFactor*filter[i];
        let fractionalPos = x/upsampleFactor;
        let polyphasePos = Math.ceil(fractionalPos);
        let p = polyphaseKernals[(polyphasePos % 1)*upsampleFactor][polyphaseLength - polyphasePos];
        if (p!=f) report.push({x,f,p});
    }
    if (report.length>0) {
        console.log('Error in polyphaseKernals');
        console.log('KernalSize '+filter.length);
        console.log(report);
    }


    return polyphaseKernals;
}


function upsample(buffer, polyphaseKernels, filterLength, isCyclic){
    return isCyclic? upsampleCyclic(buffer, polyphaseKernels, filterLength) : upsampleNonCyclic(buffer, polyphaseKernels, filterLength);
}

function upsampleCyclicSlow(inBuffer, filter, upsampleFactor){
    const inLength = inBuffer.length;
    const outLength = inLength*upsampleFactor; //Cyclic so no padding
    const result = new Array(outLength);
    const filterLength = filter.length;
    const inPos =+(filterLength-1)/2;//Assumes zero stuffing between samples
    for (let i = 0; i < outLength; i++) {
        result[i] = 0;
        for (let j =0; j <filterLength; j++) {
            const x = (i-j + inPos)/4;
            if (Math.abs(x) % 1>0) continue;//skip fractional values - pad with zeros
            result[i] += inBuffer[(inLength + x)%inLength] * filter[j] * upsampleFactor;
        }
    }

    return result
}

function upsampleCyclic(buffer, polyphaseKernels, filterLength){
    const polyphaseLength = polyphaseKernels[0].length;
    const upsampleFactor = polyphaseKernels.length;
    const inLength = buffer.length;
    const outLength = inLength*upsampleFactor; //Cyclic so no over flow
    const result = new Array(outLength);//padding of filterLength at start and end

    //Need to skip the right number of input samples AND polyphase steps to make sure the first 
    //point generated by the calculation is for the polyphase that contains the mid point of the filter
    const filterOffset = (filterLength-1)*0.5;//padding size at start and end <- should be exact offset to start of real signal in outbuffer
    const fractionalInOffset =filterOffset/upsampleFactor;
    let inPos = -Math.ceil(fractionalInOffset); //start at (negative) sample that would be to left (-1) from mid point of filter. More accurate than using half polyphaseLength
    //let inPos = -polyphaseLength+1; //start at (negative) sample that would be to left (-1) from mid point of filter. More accurate than using half polyphaseLength
    let ppk =(1-(fractionalInOffset % 1))*upsampleFactor;// adjust the polyphase to shift to right to align with mid point of filter
    if (ppk==upsampleFactor) ppk=0;//Handle when fractionalInOffset is 0

    for(let i=0;i<outLength;i++){
        result[i] =0;
        for(let j=0;j<polyphaseLength;j++){
            result[i] += buffer[(inLength + inPos + j) % inLength] * polyphaseKernels[ppk][j];
        }
        ppk++;
        if(ppk>=upsampleFactor) 
        {
            ppk=0;
            inPos++;//overflow handled by checks in j loop
        }
    }   

    return result;
}
function upsampleNonCyclic(buffer, polyphaseKernels, filterLength){
    const polyphaseLength = polyphaseKernels[0].length;
    const upsampleFactor = polyphaseKernels.length;
    const inLength = buffer.length;
    const outLength = inLength*upsampleFactor + filterLength-1;
    const result = new Array(outLength);//padding of filterLength at start and end

    //Need to skip the right number of input samples AND polyphase steps to make sure the first 
    //point generated by the calculation is for the polyphase that contains the mid point of the filter
    const filterOffset = (filterLength-1)*0.5;//padding size at start and end <- should be exact offset to start of real signal in outbuffer
    const fractionalInOffset =filterOffset/upsampleFactor;
    let inPos = -Math.ceil(fractionalInOffset); //start at (negative) sample that would be to left (-1) from mid point of filter. More accurate than using half polyphaseLength
    //let inPos = -polyphaseLength+1; //start at (negative) sample that would be to left (-1) from mid point of filter. More accurate than using half polyphaseLength
    let ppk =(1-(fractionalInOffset % 1))*upsampleFactor;// adjust the polyphase to shift to right to align with mid point of filter
    if (ppk==upsampleFactor) ppk=0;//Handle when fractionalInOffset is 0

    for(let i=0;i<outLength;i++){
        result[i] =0;
        const polyEnd = Math.min(polyphaseLength, inLength-inPos);//truncate last polyphaseKernal if it extends past end of in buffer
        for(let j=Math.max(0,-inPos);//skip negative values of inStart
                j<polyEnd;//skip past end of in buffer if polyphaseKernal is longer than remaining buffer
                j++){
                    if (ppk>=upsampleFactor) console.log('ppk out of range' + ppk);
            result[i] += buffer[inPos+j] * polyphaseKernels[ppk][j];
        }
        ppk++;
        if(ppk>=upsampleFactor) 
        {
            ppk=0;
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