//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Handles painting of waveform, FFT and other graphs
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
//Only knows about canvas names 
//Handles all of the preview and waveform painting
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

import { smallestLevel } from "./defaults.js";


let isDarkMode = localStorage.getItem('isDarkMode') === 'true';
function toLightMode(body, toLightMode){
    body = body ?? document.body;
    if (toLightMode) {
        isDarkMode = false;
        body.setAttribute('data-theme', 'light');
    } else {
        isDarkMode = true;
        body.setAttribute('data-theme', 'dark');
    }
    localStorage.setItem('isDarkMode', isDarkMode);
    fftFill('fftCanvas');;
    return isDarkMode;
}
    
toLightMode(null, !isDarkMode)

function getColor(r,g,b){
    return isDarkMode ?`rgb(${255-r},${255-g},${255-b})` : `rgb(${r},${g},${b})`;
}
function getColorA(r,g,b,alpha){
    return isDarkMode ?`rgba(${255-r},${255-g},${255-b},${alpha})` : `rgba(${r},${g},${b},${alpha})`;
}
function getGreyColorA(shade, alpha){
    return isDarkMode ? `rgba(${255-shade},${255-shade},${255-shade},${alpha})` : `rgba(${shade},${shade},${shade},${alpha})`;
}

let useFFT = true;

function fftFade(canvasId){
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = getGreyColorA(240, 0.05);
    ctx.fillRect(0,0,w,h);  
}


function fftFill(canvasId){
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = getGreyColorA(240, 1);
    ctx.fillRect(0,0,w,h);  
}


let fftFrameCall = null;
function getfftFrameCall(){
    return fftFrameCall;
}
function clearFFTFrameCall(){
    fftFrameCall = null;
}

const fftStartF = 20;
const fftEndF = 20000;
function startFFT(context, analyser, canvasId){
    if (fftFrameCall) return;
    if (!useFFT) {
        fftFade();
        return;
    }
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const bufferLength = analyser.fftSize;
    const fft = new Uint8Array(bufferLength);
    let freqStep = bufferLength / context.sampleRate;
    let maxdb = analyser.maxDecibels;
    let mindb = analyser.minDecibels;
    let fftT = 0;
    let fftL = 0;
    let ffrW = 0;
    let fftH = 0;
    let fftCanvasWidth = 0;
    let fftCanvasHeight = 0;
    let octaveStep = 0;
    const fftDraw =()=>{
        fftFrameCall =useFFT? requestAnimationFrame(fftDraw): null;
        
        const w = canvas.width;
        const h = canvas.height;
        fftCanvasWidth = w;
        fftCanvasHeight = h;
        fftT = h*0.05;
        fftL = h*0.05;
        ffrW = w-fftL*2;
        fftH = h-fftT*2;
        
        const maxLogF = Math.log2(fftEndF/fftStartF);
        octaveStep = maxLogF / ffrW;
        const hScale = fftH / 256;

        //Draw the FFT
        analyser.getByteFrequencyData(fft);  
        ctx.fillStyle =getGreyColorA(240, 0.05);
        ctx.fillRect(0,0,w,h);        
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColor(0, 50, 0);
        ctx.beginPath();

        let startBin = 0;
        for (let i = 0; i < ffrW; i++) {
            let endOctave = (i+1) * octaveStep;
            let endBin = Math.round((fftStartF * Math.pow(2,endOctave))  * freqStep );
            if (endBin>startBin){
                let max = 0;
                for (let j = startBin; j < endBin; j++) {
                    max = Math.max(max,fft[j]);
                }
                let y = fftT+ fftH - max * hScale;
                if (i === 0) {
                    ctx.moveTo(fftL+i, y);
                } else {
                    ctx.lineTo(fftL+i, y);
                }
                startBin = endBin;
            }
        }
        ctx.stroke();


    }
    fftDraw();
    canvasTooltips.fftCanvas = {
        visible: ()=>useFFT && fftCanvasWidth>0,
        text:(x,y)=>{//x,y are 0-1
            if (!useFFT || fftCanvasWidth==0) return '';
            x*=fftCanvasWidth;
            y*=fftCanvasHeight;
            x-=fftL;
            y-=fftT;
            let amplitude = ' - '
            let frequency = ' - '
            if (x>=0 && x<=ffrW )
            {
                frequency = (fftStartF * Math.pow(2,x*octaveStep)).toFixed(1) + 'Hz';
            };
            if (y>=0 && y<=fftH) {
                amplitude = (maxdb - y * (maxdb-mindb)/fftH).toFixed(1) + 'dB';
            };
            return frequency + '<br>' + amplitude;
        }
    }

}



let detailedMinDb =-120;
let detailedMaxDb =0;
let detailedMinF =20;
let detailedMaxF =20000;

function detailedFFTSetMinDb(value){
    detailedMinDb = value;
}
function detailedFFTGetMinDb(){
    return detailedMinDb;
}
function detailedFFTResetFrequencyRange(){
    detailedMinF =20;
    detailedMaxF =20000;
}   


const scaleGap =30;
//Buffer should be 64k samples long float32array
function paintDetailedFFT(magnitudes, sampleRate, canvasId){
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const w = canvas.width; 
    const h = canvas.height;
    const fftL= h*0.01;
    const fftT= h*0.01;
    const fftW = w-fftL*2;
    const fftH = h-fftT-scaleGap;
    const fftB = fftT+fftH;

    const maxLogF = Math.log2(detailedMaxF/detailedMinF);
    const octaveStep = maxLogF / fftW;
    const freqStep = magnitudes.length*2 / sampleRate;
    const dbScale = (detailedMaxDb-detailedMinDb) / 20;
    const dbOffset = detailedMinDb / 20;
    const hScale = fftH/dbScale;
 
    ctx.fillStyle = getColor(245, 245, 245);
    ctx.fillRect(0,0,w,h);  
    
    
    let positions = calculateLogScalePositions(detailedMinF, detailedMaxF);
    drawLogScale(ctx, positions, fftL, fftW, fftT, fftB);
    

    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(50, 0, 0);
    ctx.fillStyle = getColor(50, 0, 0);
    ctx.beginPath();

    const desiredStartF =detailedMinF* Math.pow(2,-octaveStep);
    let startBin = Math.floor( desiredStartF * freqStep )-1;
    const actualStartF = startBin / freqStep;
    let lastX = fftW * relativePosOfF(actualStartF, detailedMinF, maxLogF);

    //fill in past the end of last visible bin - otherwise will end in middle of view
    let fillinBin = Math.ceil((detailedMinF * Math.pow(2,(fftW+1) * octaveStep))  * freqStep ) + 1;
    let fillinF = fillinBin/freqStep;
    let fillinX = fftW * relativePosOfF(fillinF, detailedMinF, maxLogF)+1;
    
    let isFirst = true;
    for (let i = lastX; i < fillinX; i++) {
        let endOctave = (i+1) * octaveStep;
        let endBin = Math.round((detailedMinF * Math.pow(2,endOctave))  * freqStep );
        if (endBin>startBin){
            let max = 0;
            for (let j = startBin; j < endBin; j++) {
                max = Math.max(max,magnitudes[j]);
            }
            let y = fftB - ( (Math.log10(max) -dbOffset) * hScale);// (20*Math.log10(max) -detailedMinDb)/(detailedMaxDb-detailedMinDb) * fftH;
            if (!y || y>fftB) y=fftB;
            const x = fftL+i;
            let midX = x;
            if (lastX<x-1){
                //Bin spans multiple pixels
                midX = fftL + fftW * relativePosOfF(startBin/ freqStep, detailedMinF, maxLogF)
            }
            if (isFirst) {
                ctx.moveTo(midX, fftB);
                isFirst = false;
            }else{
                ctx.lineTo(midX, y);
            }
            // if (y<fftB-2 && x>lastX+1){
            //     ctx.moveTo(x, fftB+1);
            //     ctx.lineTo(lastX, fftB+1);
            // }
            startBin = endBin;
            lastX=x;
        }
    }


    ctx.stroke();


    canvasTooltips.staticFFTCanvas = {//same as canvas.id
        visible: ()=>true,
        text:(x,y)=>{//x,y are 0-1
            x*=w;
            y*=h;
            x-=fftL;
            y-=fftT;
            let amplitude = ' - '
            let frequency = ' - '
            if (x>=0 && x<=fftW )
            {
                frequency = (detailedMinF * Math.pow(2,x*octaveStep)).toFixed(1) + 'Hz';
            };
            if (y>=0 && y<=fftH) {
                amplitude = (detailedMaxDb - y * (detailedMaxDb-detailedMinDb)/fftH).toFixed(1) + 'dB';
            };
            return frequency + '<br>' + amplitude;
        },
        drag:(x, deltaX,deltaY) =>{//all -1=>1, scaled by dimensions of canvas
            const currentRange = Math.log2(detailedMaxF/detailedMinF);
            let midRange = currentRange * x;//value at pointer
            let deltaRange = currentRange; 
            midRange -=deltaX*currentRange;
            //console.log(deltaX)
            if (Math.abs(deltaY)>0.9)deltaY = Math.sign(deltaY)*0.9;
            deltaRange *=Math.pow(2,deltaY);//up down to zoom in/out

            var newMinF = detailedMinF *Math.pow(2,midRange-deltaRange * x);
            var newMaxF = newMinF *Math.pow(2,deltaRange );
            newMinF = Math.min(Math.max(20,newMinF),18000);
            newMaxF = Math.min(Math.max(50,newMaxF),20000);
            if (newMaxF-newMinF<1) {
                const ave = (newMaxF+newMinF)/2;
                newMinF = ave-0.5;
                newMaxF = ave+0.5;
            }
            detailedMinF = newMinF;
            detailedMaxF = newMaxF;
            },
        doubleTap:(x,y)=>{
            canvasTooltips.staticFFTCanvas.drag(x,0,-1);
        }
    
    }
}


const minimumSpacing = 0.025;//full scale is 0-1
function calculateLogScalePositions(minF, maxF) {
    let positions = [];
    const log2Max = Math.log2(maxF/minF);
    const startF = floorPowerOfTen(minF);
    const numberOfFirstSteps = Math.ceil(Math.log10(maxF/startF));
    const fullRangeStep = largestPowerOfTenIncrement(minF, maxF);

    //2 Steps - octaves - exponential increase in frequency
    const maxLevels =4;
    for (let i = 0; i <= numberOfFirstSteps; i++) {
        const flow = startF * Math.pow(10, i);
        const fhigh = startF * Math.pow(10, i + 1);
        iteratedCalculatePositions(positions, flow, fhigh, minF, maxF, log2Max, maxLevels);
    }
    return positions;
}
function iteratedCalculatePositions(positions, flow, fhigh, minF, maxF, log2Max,maxLevels, pushAtMaxEnd) {
     if (maxLevels<=0) 
     {
         let x = relativePosOfF(flow, minF, log2Max);
         if (pushAtMaxEnd && flow>minF) positions.push({f: flow, x: x});
         return;
    }
    if (flow<minF && fhigh<minF) return;
    if(fhigh>maxF && flow>maxF) return;
    let largestStep =largestPowerOfTenIncrement(flow,fhigh);
    
    let step = Math.pow(10,largestStep);
    for(let j=0;j<10;j++){
        let f1 = flow + j * step;
        if (f1>=fhigh) break;
        let f2 = f1 + step;
        if (f1>maxF) break;
        let x = relativePosOfF(f1, minF, log2Max);
        let x1 = relativePosOfF(f2, minF, log2Max);
        if (x1-x<minimumSpacing) 
        {
            if (j==0 && f1<fhigh) {positions.push({f: f1, x: (x+x1)/2});}
            continue;
        };
        iteratedCalculatePositions(positions, f1, f2, minF, maxF, log2Max, maxLevels-1,j==0)
    }
}


function relativePosOfF(f, minF, log2Max){ 
    return Math.log2(f/minF)/log2Max;
}

function largestPowerOfTenIncrement(fLow, fHigh){
    //largest power of 10 that is less than the difference
    //To use for increment, eg 1000-500 = 500, so smallest is 100, so returns 2
    //Or 1600-1400 = 200, smallest is 100, so returns 2
    return Math.ceil(Math.log10(fHigh-fLow))-1;
}

function ceilPowerOfTen(f){
    let p = Math.log10(f);
    let n = Math.ceil(p);
    return Math.pow(10,n);
}
function floorPowerOfTen(f){
    let p = Math.log10(f);
    let n = Math.floor(p);
    return Math.pow(10,n);
}

// Draw the scale lines and labels
function drawLogScale(ctx, positions, fftL, fftW, fftT, fftB) {
    if (positions.length == 0) return;
    const minF = positions[0].f;
    const maxF = positions[positions.length-1].f;
    const powerOfTen = largestPowerOfTenIncrement(positions[0].f, positions[positions.length-1].f);
    const decimalsToUse = powerOfTen > 2 ? 0 : 1;
    ctx.strokeStyle = getColor(160, 210,  160);
    ctx.fillStyle = getColor(50, 0, 0);
    ctx.font = (scaleGap*0.37).toFixed(0)+"px Arial";
    ctx.textAlign = "center";
    ctx.setLineDash([5, 15]);
    for (let pos of positions) {
        ctx.beginPath();
        const x = pos.x*fftW+fftL;
        ctx.moveTo(x, fftT);
        ctx.lineTo(x, fftB+3);
        ctx.stroke();
        ctx.fillText(pos.f.toFixed(decimalsToUse), x, fftB + scaleGap*0.6);
    }
    ctx.setLineDash([]);
}



function paintBuffer(buffer, maxLength, canvasId){

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let bufferSize = buffer.length;


    for (let chan = 0; chan < buffer.numberOfChannels ; chan++) {
        let b = buffer.data[chan];
        const h = canvas.height/(2*buffer.numberOfChannels);
        const zeroY = h + chan * 2 * h;
        const step = canvas.width / maxLength;
        //Centre line
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = getColor(50, 50, 50);
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(canvas.width, zeroY);
        ctx.stroke();

        //Waveform
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColor(0, 0, 0);
        let x = 0;

        for (let i = 0; i < maxLength; i++) {
            if (i >= bufferSize) break;
            let y=zeroY-b[i] * h;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);//Minus to ensure positive is up
            }
            x += step;
        }
        ctx.stroke();
    }
}

//Envelope is an float array of values between 0 and 1 for each sample
function paintEnvelope(envelopes, maxLength, canvasId){

    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for(let chan = 0; chan < envelopes.length; chan++){
        const b = envelopes[chan];
        const bufferSize = b.length;

        ctx.beginPath();
        ctx.strokeStyle = getColor(0, 128, 0);
        const h = canvas.height/(2*envelopes.length);
        const zeroY = h + chan * 2 * h;
        const step = canvas.width / maxLength;

        for(let pol =-1; pol<=1; pol+=2){
            let x = 0;
            for (let i = 0; i < maxLength; i++) {
                if (i >= bufferSize) break;
                let y=zeroY-pol*b[i] * h;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);//Minus to ensure positive is up
                }
                x += step;
            }
        }
        ctx.stroke();
    }
}

let filterEnvIsLog = true;
//Filter is the filter object returned from the audio.js getFilter function
function paintFilterEnvelope(filters, maxLength, canvasId){
    if (!filters) return;
    
    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    for (let chan = 0; chan < filters.length; chan++) {
        const filter = filters[chan];
        if (!filter) continue;
        const b = filter.invW0;//1/wo  = sampleRate/(2*Math.PI*f0)
        const maxF = filter.sampleRate/2;//-20 to avoid log(0)
        const invLogMaxF =1/Math.log2(maxF-20);
        const c = filter.sampleRate/(2*Math.PI);//retrieve f0 from 1/wo and scale to max frequency
        const bufferSize = b.length;

        ctx.beginPath();
        ctx.strokeStyle = getColor(0, 0, 128);
        let x = 0;
        const h = canvas.height/filters.length;
        const zeroY = h + chan * h;
        const step = canvas.width / maxLength;
        const scale  = filterEnvIsLog ? h * invLogMaxF : h/maxF;

        for (let i = 0; i < maxLength; i++) {
            if (i >= bufferSize) break;
            const f = c / b[i];
            let y =zeroY- scale *(filterEnvIsLog ? Math.log2(f-20) : f);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);//Minus to ensure positive is up
            }
            x += step;
        }
        ctx.stroke();
    }
}


let canvasTooltips = //must have members defined here, but the values can be updated later 
    {
        fftCanvas:{//same as ID of canvas
            visible:()=>false,
            text:(x,y)=>{//x,y are 0-1
                return '';
            }
        },
        staticFFTCanvas://same as id of canvas
        {
            visible: ()=>false,
            text:()=>{
                return 'Not calculated yet';
            },
            drag:()=>{},
            doubleTap:()=>{}//register double tap is needed, add method afterwards
        }
    };
function getCanvasTooltips(){ return canvasTooltips;}


function paintPreview(
    id, //id of canvas element
    samples, //array of samples
    magnitude, //array of magnitude values for harmonics
    phases, //array of phase values for harmonics
    filter,//filter object - from audio.js getFilter function
    patch, //patch object
    min, //min value in samples data
    max, //max value in samples data
    showFullSpectrum, //show all harmonics or just first 50
    showPolarity, //show polarity of harmonics or just absolute value
    showPhase, //show phase graph of harmonics
    filterPreviewSubject //0 for no filter, 1 for filter, 2 for patch
){
    let canvas = document.getElementById(id);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    let w=canvas.width;
    let h=canvas.height;
    ctx.clearRect(0, 0, w, h);

    //Waveform Preview - left side square
    let wpCorner= h/16;
    let wpWidth = wpCorner*20;
    let wpHeight = wpCorner*14;
    ctx.fillStyle = getColor(240, 240, 240);
    ctx.fillRect(0, 0, wpWidth+wpCorner*2, wpHeight+wpCorner*2);  
    ctx.beginPath();    
    let waveScale = 1/Math.max(Math.abs(min),Math.abs(max));
    //waveForm axis lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(150, 150, 150);
    ctx.moveTo(wpCorner, wpCorner + 0.5 * wpHeight);
    ctx.lineTo(wpCorner + wpWidth, wpCorner + 0.5 * wpHeight); 
    ctx.moveTo(wpCorner+ 0.5 * wpWidth, wpCorner );
    ctx.lineTo(wpCorner + 0.5 * wpWidth, wpCorner + wpHeight); 
    ctx.stroke();
  
    //Waveform preview
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(0, 0, 0);
    for(let i=0;i<samples.length;i++){
        let x =wpCorner + i * wpWidth / samples.length;
        let y =wpCorner + (0.5-0.5 * waveScale * samples[i]) * wpHeight;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();


    //Spectrum Amplitude preview - right side rectangle
    let minDB = -100/20;//db/20 - optimise out the *20 from the db calculation
    //Spectrum Amplitude preview - right side rectangle
    let spL= wpCorner*3+wpWidth;
    let spW = w - spL;
    let spT = 0;
    let spB = h*( showPhase ? 0.75: 1);
    let spH = (spB-spT) * (showPolarity ? 0.5 : 1);
    let sp0 = spT+spH;
    let spScale = spH /minDB;
    let count = showFullSpectrum ? magnitude.length : Math.min(magnitude.length/2,50);
    
    //Spectrum Amplitude axis lines
    ctx.beginPath(); 
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = getColor(150, 150, 150);
    ctx.moveTo(spL, sp0);
    ctx.lineTo(spL + spW, sp0); 
    ctx.moveTo(spL, spT );
    ctx.lineTo(spL , spB); 
    ctx.stroke();

    adjustForPhase(magnitude,phases,showPolarity)
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(0, 0, 200);
    for (let i = 0; i < count; i++) {
        let x =spL + i * spW / count;
        let mag = magnitude[i];
        let polarity =  Math.sign(mag);
        let offset = spH - polarity*spH; //either 0 or spH*2 
        let y =spT +offset + polarity * Math.max(minDB, Math.log10( Math.abs(mag))) * spScale;
        ctx.moveTo(x, sp0);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!showFullSpectrum)
    {
        //Draw dots to show harmonics on zoomed in view        
        ctx.fillStyle = getColor(0, 0, 100);
        for (let i = 0; i < count; i++) {
            let x =spL + i * spW / count;
            ctx.fillRect(x-0.5, sp0-0.5, 1, 1); 
        }
    }

    //Preview Filter and patch are common for Harmonics preview and distortion preview
    if (filterPreviewSubject>0 && filter){
        //Overlay the filter frequency response
        ctx.beginPath();    
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColor(0, 140, 0);
        const invW0 = filter.invW0[filter.invW0.length*0.5]
        const rootW = (patch.frequency+patch.frequencyFine)  * 2 * Math.PI  / filter.sampleRate;
        for (let i = 1; i < count; i++) {
            let x =spL + i * spW / count;
            let w = i * rootW;
            let c=w *invW0;
            let l=1;
            if (c>=filter.stopBandEnd) 
            {
                l=0;
            } 
            else if (c>filter.passBandEnd)
            {
                //Use lookup table for filter response in transition band
                l=filter.lut[Math.trunc((c-filter.passBandEnd)*filter.lutScale)]; 
            }

            let y =spT + Math.max(minDB, Math.log10( Math.abs(l))) * spScale;
            if (i == 1) {
                ctx.moveTo(x, y);
            }
            else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();    


    }


    if (!showPhase) return;
    //Spectrum Phase preview - right side rectangle
    let pL= spL;
    let pW = spW;
    let pT = spB + h*0.05;//Small gap between amplitude and phase graphs
    let pB = h;
    let pH =(pB-pT)*0.5;
    let p0 = pT+pH;
    let pScale = pH / Math.PI;
    
    //Spectrum Phase axis lines
    ctx.beginPath(); 
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = getColor(150, 150, 150);
    ctx.moveTo(pL, p0);
    ctx.lineTo(pL + pW, p0); 
    ctx.moveTo(pL, pT );
    ctx.lineTo(pL , pB); 
    ctx.stroke();


    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(100, 0, 0);
    //Spectrum preview - right side rectangle
    for (let i = 0; i < count; i++) {
        let x =pL + i * pW / count;
        let phase = -phases[i];
        if(!showPolarity) {
            let mag = magnitude[i];
            if (mag<0) phase+=Math.PI;
        }
        //Scale to +/- PI
        let nos2Pis = phase/(2*Math.PI);
        phase -= Math.floor(nos2Pis)*2*Math.PI; //Floor works for negative numbers too (floor(-1.5)=-2)
        if (phase>=Math.PI) phase-=2*Math.PI;
        let y =p0 + phase * pScale;
        ctx.moveTo(x, p0);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!showFullSpectrum)
    {
        //Draw dots to show harmonics on zoomed in view        
        ctx.fillStyle = getColor(50, 0, 0);
        for (let i = 0; i < count; i++) {
            let x =pL + i * pW / count;
            ctx.fillRect(x-0.5, p0-0.5, 1, 1); 
        }
    }
}

function adjustForPhase(magnitudes,phases, showPolarity){
   const len = Math.min(magnitudes.length,phases.length);
   for(let i=0;i<len;i++){
       let m=magnitudes[i];
       let p = phases[i];
       if (m<0) {
            //Store all phase info in phase value
            //n is only magnitude
            p+=Math.PI;
            m=-m;
       }
       if (m<smallestLevel)
        {
            p[i]=0;
            continue;
        }
       //adjust phase to be between -PI and PI
       let nos2Pis = p/(2*Math.PI);
       p -= Math.floor(nos2Pis)*2*Math.PI; //Floor works for negative numbers too (floor(-1.5)=-2)
       if (p>=Math.PI) p-=2*Math.PI;

        //m >= 0
        //phase >= -PI and < PI
        if (showPolarity)
        {
            if (Math.abs(p)>Math.PI/2){
                m=-m;
                p-= Math.sign(p) * Math.PI;
            } 
        }
        magnitudes[i]=m;
        phases[i]=p;

   }
}


function paintDigitalPreview(data, canvasId){
    if (!data) return;
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    let tW = canvas.width*0.06;
    let l=tW;
    let r = canvas.width-tW*0.5;
    let t = 9;
    let b = canvas.height-33;
    let w=r-l;
    let h=b-t;
    let itemW = w/4;

    
    ctx.fillStyle = getColor(0,128,255); //Color to clear to
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let al,ab, at, xScale, yScale;


    
    //Draw Jitter    
    al = l ;
    ab= b-h/7;
    at=t+h/7;
    xScale = itemW/ (data.jitter.length-1);
    let expectedYScale = 2/data.jitter.length;//straight line from -1 at start to +1 at end
    yScale = (at-ab)/(2*expectedYScale);//fit 2 steps into the height

    let eym1 = ab;
    let eyp1 = at;
    let ey0 = eym1 + 0.5*(eyp1-eym1);   
    let jitterW = (eym1-ey0); 
    let eym2 = eym1 + jitterW;
    let eyp2 = eyp1 - jitterW;
    let x0 = al+itemW/2;    
    let xm1 = x0-jitterW;
    let xm2 = xm1-jitterW;
    let xp1 = x0+jitterW;
    let xp2 = xp1+jitterW;

    //Jitter axis lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColorA(100, 100, 100,0.8);
    ctx.beginPath();  
    ctx.moveTo(xm1+2*jitterW, ab);
    ctx.lineTo(xm1, ab);
    ctx.moveTo(xm1, at);
    ctx.lineTo(xm1+2*jitterW, at);
    ctx.lineTo(xm1, ab);
    ctx.stroke();

    ctx.fillStyle = getColor(0, 0, 0);
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("+0.1%", xm1-20, eyp1+6);
    ctx.fillText("0", xm1-20, ey0+6);
    ctx.fillText("-0.1%", xm1-20, eym1+6);
    

    ctx.save();
    ctx.translate(xm1-65, ey0+6);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Jitter", 0,0);
    ctx.restore();

    ctx.save();
    ctx.translate(xm1-45, ey0+6);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Deflection from expected", 0,0);
    ctx.restore();

    const platform = getPlatform();

    // Apply the appropriate compositing method based on the platform
    if (platform === 'macOS') {
    // Use 'lighter' composite operation or manual compositing for macOS
    //ctx.globalCompositeOperation = 'darken';
    ctx.strokeStyle = getColorA(0, 0, 100,0.5);
    } else {
    // Use the default behavior for other platforms (e.g., Windows, Linux)
    //ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = getColorA(0, 0, 100,0.01);
    }
    ctx.beginPath();  
    for(let i = 2; i < data.jitter.length-2; i++){
        let e =i*expectedYScale-1
        let ym2 = eym2 + (data.jitter[i-2] - (e-2*expectedYScale))*yScale;
        let ym1 = eym1 + (data.jitter[i-1] - (e-expectedYScale))*yScale;
        let y0 = ey0 + (data.jitter[i] - e)*yScale;
        let yp1 = eyp1 + (data.jitter[i+1] - (e+expectedYScale))*yScale;
        let yp2 = eyp2 + (data.jitter[i+2] - (e+2*expectedYScale))*yScale;
        
        let cpsm1 = getControlPoints(xm2, ym2, xm1, ym1, x0, y0, 0.3);
        let cps0 = getControlPoints(xm1, ym1, x0, y0, xp1, yp1, 0.3);
        let cpsp1 = getControlPoints(x0, y0, xp1, yp1, xp2, yp2, 0.3);

        ctx.moveTo(xm1, ym1);
        ctx.bezierCurveTo(cpsm1[2], cpsm1[3], cps0[0], cps0[1], x0, y0);
        ctx.bezierCurveTo(cps0[2], cps0[3], cpsp1[0], cpsp1[1], xp1, yp1);
    }
    ctx.stroke();
    //ctx.globalCompositeOperation = 'source-over';



        
    //Draw Dither Linearity

    //Dither Dither Linearity axis lines
    ctx.lineWidth = 1;
    ab= b;
    let ditherW =(ab-t)
    al = l+ itemW * 1.5 + itemW/2-ditherW/2;


    //Dither Linearity axis lines and expected line
    ctx.strokeStyle = getGreyColorA(100,0.4);
    ctx.beginPath(); 
    ctx.moveTo(al, ab);   
    ctx.lineTo(al+ditherW, t);
    ctx.moveTo(al, t);
    ctx.lineTo(al, ab);
    ctx.lineTo(al+ditherW, ab);
    ctx.stroke();

    //Dither Linearity labels
    ctx.fillStyle = getColor(0, 0, 0);
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("0.0", al, ab+15);
    ctx.fillText("0.5", al+ditherW/2, ab+15);
    ctx.fillText("1.0", al+ditherW, ab+15);
    ctx.fillText("0.0", al-15, ab+6);
    ctx.fillText("0.5", al-15, ab+6-ditherW/2);
    ctx.fillText("1.0", al-15, t+6);
    ctx.fillText("Input values", al+ditherW/2, ab+28);
    ctx.fillText("Dither", al+ditherW,ab-ditherW/4);
    ctx.fillText("Linearity", al+ditherW,ab-ditherW/4 + 15);

    ctx.save();
    ctx.translate(al-35, ab+6-ditherW/2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Average Output after dither", 0,0);
    ctx.restore();

    ctx.fillText("Dither Linearity", 0,0);


    ctx.strokeStyle = getColor(100, 0, 0);
    xScale = ditherW / (data.ditherLinear.length-1);
    yScale =  h;

    ctx.beginPath();
    for(let i = 0; i < data.ditherLinear.length; i++){
        let x = al + i * xScale;
        let y = ab - data.ditherLinear[i] * yScale;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();


    
    //Draw Dither Dynamic Range    
    const maxF =20000;
    const minF =50;
    const dbMax =12;
    const dbMin = -144
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(0, 100, 0);
    al = l+ w * 6/8;
    ab= b;
    at = t;
    xScale =itemW / Math.log10(maxF/minF);
    yScale =  h/(dbMin -dbMax);

    //Dither Dynamic Range axis lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColorA(100, 100, 100,0.8);
    ctx.moveTo(al, t);
    ctx.lineTo(al, ab);
    ctx.lineTo(al+itemW, ab);
    ctx.stroke();
    

    //Dither Linearity labels
    ctx.fillStyle = getColor(0, 0, 0);
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    
    ctx.fillText("100", al + Math.log10(100/minF) * xScale, ab+15);
    ctx.fillText("300", al + Math.log10(300/minF) * xScale, ab+15);
    ctx.fillText("1k", al + Math.log10(1000/minF) * xScale, ab+15);
    ctx.fillText("3k", al + Math.log10(3000/minF) * xScale, ab+15);
    ctx.fillText("10k", al + Math.log10(10000/minF) * xScale, ab+15);
    ctx.fillText("20k", al + Math.log10(20000/minF) * xScale, ab+15);
    //ctx.fillText("db", al-15, t+6);
    ctx.fillText("0db", al-15, at + (0 -dbMax)* yScale);
    ctx.fillText("-30", al-15, at + (-30 -dbMax)* yScale);
    ctx.fillText("-60", al-15, at + (-60 -dbMax)* yScale);
    ctx.fillText("-90", al-15, at + (-90 -dbMax)* yScale);
    ctx.fillText("-120", al-15, at + (-120 -dbMax)* yScale);
    //ctx.fillText("Dynamic Range", al+itemW/2, ab+28);

    ctx.save();
    ctx.translate(al-35, ab+6-ditherW/2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Dynamic Range", 0,0);
    ctx.restore();





    ctx.strokeStyle = getColorA(100, 0, 0,0.8);
    ctx.beginPath();   
    for(let i = 0; i < data.ditherDRF.length; i++){
        let f = data.ditherDRF[i];
        let v = Math.max(dbMin, data.ditherDRFBase[i]);
        let x = al + Math.log10(f/minF) * xScale;
        let y = at + (v -dbMax) * yScale;
        if (i === 0) {
            ctx.moveTo(x, y);
        }
        else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    ctx.strokeStyle = getColorA(0, 100, 0,0.8);
    ctx.beginPath();   
    for(let i = 0; i < data.ditherDRF.length; i++){
        let f = data.ditherDRF[i];
        let v = Math.max(dbMin, data.ditherDRdB[i]);
        let x = al + Math.log10(f/minF) * xScale;
        let y = at + (v -dbMax) * yScale;
        if (i === 0) {
            ctx.moveTo(x, y);
        }
        else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

}


//Getting spline which passes through 3 points: Rob Spencer, July 2010
//http://scaledinnovation.com/analytics/splines/aboutSplines.html
//Demo of above: https://output.jsbin.com/ApitIxo/2/
//Nice!
function getControlPoints(x0,y0,x1,y1,x2,y2,t){
    var d01=Math.sqrt(Math.pow(x1-x0,2)+Math.pow(y1-y0,2));
    var d12=Math.sqrt(Math.pow(x2-x1,2)+Math.pow(y2-y1,2));
    var fa=t*d01/(d01+d12);   // scaling factor for triangle Ta
    var fb=t*d12/(d01+d12);   // ditto for Tb, simplifies to fb=t-fa
    var p1x=x1-fa*(x2-x0);    // x2-x0 is the width of triangle T
    var p1y=y1-fa*(y2-y0);    // y2-y0 is the height of T
    var p2x=x1+fb*(x2-x0);
    var p2y=y1+fb*(y2-y0);  
    return [p1x,p1y,p2x,p2y];
}



let fixedScale = false;
function paintFilterPreview(buffer, canvasId){
    const maxBufferLength = 2000;//Can be bigger but will use this as scale for smaller
    if (!buffer) return;
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    let w=canvas.width;
    let h=canvas.height;
    ctx.clearRect(0, 0, w, h);




    let border = 25;
    let impW = w*0.33 -2*border;
    let impH2 = h*0.5 -2*border;
    const impB = h-border*2;
    const impT = 10;

    let maxValue = 0;
    [buffer.iirImpulse, buffer.fftImpulse].forEach((b, index)=>{
        const midpoint = index*((b.length-1)/2);
        for(let i = 0; i < b.length; i++){
            if (i==midpoint)continue;
            maxValue = Math.max(maxValue,Math.abs(b[i]));
        }
    });



    [buffer.iirImpulse, buffer.fftImpulse].forEach((b, index)=>{
        const midpoint = index*((b.length-1)/2);
        //
        const impL =border + 2*index*(impW + 2*border);
        const impR =impL+impW;
        const impMidX = impL + (impW/2)*index;
        const impMidY = impT +(impB-impT)/2;

        
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            index==0 ?"IIR Impulse":"FIR Impulse", 
            impL + (impR-impL)/2, impB+16);

        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColorA(100, 100, 100,0.8);
        ctx.moveTo(impMidX, impB);
        ctx.lineTo(impMidX, impT);
        ctx.moveTo(impL, impMidY);
        ctx.lineTo(impR, impMidY);
        ctx.stroke();

        
        if (maxValue==0 || b.length==1){
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = getColor(index*100, 0, (1-index)*100);
            ctx.moveTo(impL, impMidY);
            ctx.lineTo(impR, impMidY);
            ctx.stroke();
        }
        else{
            //Scaled to fit
            const step = impW / b.length;
            let x = impL;
            let scale = impH2 / maxValue;
        
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = getColor(index*100, 0, (1-index)*100);
            let isFirst = true;
            for (let i = 0; i < b.length; i++) {
                if (i==midpoint)continue;
                let y = impMidY - b[i] * scale;
                if (isFirst) {//may not be zero
                    ctx.moveTo(x, y);
                    isFirst=false;
                } else {
                    ctx.lineTo(x, y);
                }
                x += step;
            }
            // if (b.length ==1){
            //     ctx.lineTo(impMidX, impMidY);//won't be drawn otherwise
            // }
            ctx.stroke();
                
        }
    });


    //Filter Frequency response Range    
    const maxF =20000;
    const minF =50;
    const dbMax =24;
    const dbMin = -5
    let al =3 * border + impW;
    let ab= impB-border;
    let at = impT;
    let xScale =impW / Math.log10(maxF/minF);
    let yScale =  (ab-at)/(dbMin -dbMax);

    //Filter Frequency response axis lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColorA(100, 100, 100,0.8);
    ctx.moveTo(al, at);
    ctx.lineTo(al, ab);
    ctx.lineTo(al+impW, ab);
    ctx.stroke();
    

    //Filter Frequency response labels
    ctx.fillStyle = getColor(0, 0, 0);
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    
    ctx.fillText("100", al + Math.log10(100/minF) * xScale, ab+15);
    ctx.fillText("300", al + Math.log10(300/minF) * xScale, ab+15);
    ctx.fillText("1k", al + Math.log10(1000/minF) * xScale, ab+15);
    ctx.fillText("3k", al + Math.log10(3000/minF) * xScale, ab+15);
    ctx.fillText("10k", al + Math.log10(10000/minF) * xScale, ab+15);
    ctx.fillText("20k", al + Math.log10(20000/minF) * xScale, ab+15);
    //ctx.fillText("db", al-15, t+6);
    ctx.fillText("24", al-15, at + (24 -dbMax)* yScale);
    ctx.fillText("12", al-15, at + (12 -dbMax)* yScale);
    ctx.fillText("0db", al-15, at + (0 -dbMax)* yScale);
    // ctx.fillText("-12", al-15, at + (-12 -dbMax)* yScale);
    // ctx.fillText("-24", al-15, at + (-24 -dbMax)* yScale);
    //ctx.fillText("Dynamic Range", al+itemW/2, ab+28);


    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
        "IIR Frequency Response", 
        al + (impW)/2, ab+border+16);






    ctx.strokeStyle = getColorA(0, 0,100, 0.8);
    ctx.beginPath();   
    for(let i = 0; i < buffer.fft.f.length; i++){
        let f = buffer.fft.f[i];
        let v = Math.max(dbMin, buffer.fft.db[i]);
        let x = al + Math.log10(f/minF) * xScale;
        let y = at + (v -dbMax) * yScale;
        if (i === 0) {
            ctx.moveTo(x, y);
        }
        else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}



let THDGraphMaxF = 10000;
let THDGraphMinF = 30;
function paintTHDGraph(data, canvasId){
    if (!data) return;


    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";


    let tW = canvas.width*0.06;
    let l=tW;
    let r = canvas.width-tW*0.5;
    let t = 4;
    let tH = canvas.height*0.15;
    let b = canvas.height-tH;
    let w=r-l;
    let h=b-t;
    let yScale = h / 5;
    let xScale = w / Math.log2(THDGraphMaxF/THDGraphMinF); //range 20-20000


    ctx.fillStyle = getColor(255,255,255); //Color to clear to
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    //THD axis lines
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(100, 100, 100);
    ctx.moveTo(l, t);
    ctx.lineTo(l, b);
    ctx.lineTo(r, b);
    ctx.stroke();


    const freqs = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    //THD freq grid lines
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(210, 210, 210);
    ctx.fillStyle = getColor(0, 0, 0); // color of the text
    ctx.font = "12px Arial"; // font of the text
    ctx.textAlign = "center"; // horizontal alignment
    freqs.forEach(f=>{
        let x =l+ Math.log2(f/THDGraphMinF) * xScale;
        ctx.moveTo(x, t);
        ctx.lineTo(x, b);
        ctx.fillText(f.toString()+(f==500?"Hz":""), x, b + tH); // draw the frequency label 15 pixels below the line
    });
    ctx.stroke();

    const percents = [0.001,0.01,0.1,1,10,100];
    //THD db grid lines
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = getColor(210, 210, 210);
    ctx.fillStyle = getColor(0, 0, 0); // color of the text
    ctx.font = "12px Arial"; // font of the text
    ctx.textAlign = "right"; // horizontal alignment
    percents.forEach(p=>{
        let y = b - Math.log10(p/0.001) * yScale;
        ctx.moveTo(l, y);
        ctx.lineTo(r, y);        
        ctx.fillText(p.toString() +(p==1?"%":""), l-tW*0.1, y+6); // draw the frequency label 15 pixels below the line
    });
    ctx.stroke();


    ctx.save();
    ctx.translate(12, t+tH*0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("THD Freq. Response", 0,0);
    ctx.restore();



    if (data.thd && data.thd.length>0)
    {
        let xs =[];
        let ys =[];
        for(let i = 0; i < data.thd.length; i++){
            let frequency = data.frequencies[i];
            let thd = data.thd[i];
            let y = b - Math.log10(thd/0.001) * yScale;
            if (y>b) y=b;
            let x = l + Math.log2(frequency/THDGraphMinF) * xScale;
            xs.push(x);
            ys.push(y);
        }

        let cps=[]
        for(let i = 0; i < data.thd.length; i++){
            if (i === 0) {
                let x=xs[i];
                let y=ys[i];
                let x1=xs[i+1];
                let y1=ys[i+1];
                cps.push([0,0,x+0.3*(x1-x),y+0.3*(y1-y)]);
            }
            else 
            if (i === data.thd.length-1) {
                let x=xs[i];
                let y=ys[i];
                let x1=xs[i-1];
                let y1=ys[i-1];
                cps.push([x+0.3*(x1-x),y+0.3*(y1-y),0,0]);
            }
            else{
                cps.push(getControlPoints(xs[i-1],ys[i-1],xs[i],ys[i],xs[i+1],ys[i+1],0.3));
            }
        }


        // ctx.beginPath();    
        // ctx.lineWidth = 1;
        // ctx.strokeStyle = getColor(0, 0, 0);
        // for (let i = 0; i < data.thd.length; i++) {
        //     let x =xs[i];
        //     let y =ys[i];
        //     if (i === 0) {
        //         ctx.moveTo(x, y);
        //     } else {
        //         ctx.lineTo(x, y);
        //     }
        // }
        // ctx.stroke();

        ctx.beginPath();    
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColor(0, 0, 0);
        for (let i = 0; i < data.thd.length; i++) {
            let x =xs[i];
            let y =ys[i];
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.bezierCurveTo(cps[i-1][2], cps[i-1][3], cps[i][0], cps[i][1], x, y);
            }
        }
        ctx.stroke();
    }
}


function getPlatform() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
    // Check for macOS
    if (/Mac/i.test(userAgent)) {
      return 'macOS';
    }
  
    // Check for Windows
    if (/Win/i.test(userAgent)) {
      return 'Windows';
    }
  
    // Check for Linux
    if (/Linux/i.test(userAgent)) {
      return 'Linux';
    }
  
    // If none of the above is detected, return 'Unknown'
    return 'Unknown';
  }

function getUseFFT(){
    return useFFT;
}
function toggleUseFFT(){
    useFFT = !useFFT;
    return useFFT;
}

export {
    toLightMode, 

    getCanvasTooltips,

    //Realtime FFT from Web Audio API
    fftFade, 
    fftFill, 
    startFFT, 
    getUseFFT,
    toggleUseFFT,
    getfftFrameCall, 
    clearFFTFrameCall,

    //Large high resolution FFT
    detailedFFTResetFrequencyRange ,
    detailedFFTSetMinDb, 
    detailedFFTGetMinDb,
    paintDetailedFFT,

    //Waveforms A, B and nNll
    paintBuffer,
    paintEnvelope,
    paintFilterEnvelope,

    //Quick Preview
    paintPreview,
    paintDigitalPreview,
    paintFilterPreview,

    //THD Graph
    paintTHDGraph,

}