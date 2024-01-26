//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Audio API link Code
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



let useFFT = true;

function fftClear(canvasId){
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "rgb(240, 240, 240)";
    ctx.fillRect(0, 0, w, h);  
}



let fftFrameCall = null;
const fftStartF = 20;
const fftEndF = 20000;
function startFFT(context, analyser, canvasId){
    if (fftFrameCall) return;
    if (!useFFT) {
        fftClear();
        return;
    }
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const bufferLength = analyser.fftSize;
    const maxLogF = Math.log2(fftEndF-fftStartF);
    const octaveStep = maxLogF / w;
    const freqStep = bufferLength / context.sampleRate;
    const hScale = h / 256;
    const fft = new Uint8Array(bufferLength);
    const bins = new Uint8Array(w);
    const fftDraw =()=>{
        fftFrameCall = requestAnimationFrame(fftDraw);
        analyser.getByteFrequencyData(fft);  
        ctx.fillStyle = "rgb(240, 240, 240)";
        ctx.fillRect(0, 0, w, h);        
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgb(0, 0, 0)";
        ctx.beginPath();

        let startBin = 0;
        for (let i = 0; i < w; i++) {
            let endOctave = (i+1) * octaveStep;
            let endBin = Math.round((fftStartF + Math.pow(2,endOctave))  * freqStep );
            if (endBin>startBin){
                let max = 0;
                for (let j = startBin; j < endBin; j++) {
                    max = Math.max(max,fft[j]);
                }
                let y = h - max * hScale;
                if (i === 0) {
                    ctx.moveTo(i, y);
                } else {
                    ctx.lineTo(i, y);
                }
                startBin = endBin;
            }
        }
        ctx.stroke();
    }
    fftDraw();
}





function paintBuffer(buffer, maxLength, canvasId){
    let b = buffer.getChannelData(0);
    let bufferSize = buffer.length;

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    const h = canvas.height/2;
    const step = canvas.width / maxLength;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    //Centre line
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgb(50, 50, 50)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(canvas.width, h);
    ctx.stroke();

    //Waveform
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 0)";
    let x = 0;

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        let y=h-b[i] * h;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);//Minus to ensure positive is up
        }
        x += step;
    }
    ctx.stroke();
    ctx.stroke();
         
}

//Envelope is an float array of values between 0 and 1 for each sample
function paintEnvelope(envelop, maxLength, canvasId){
    let b = envelop;
    let bufferSize = b.length;

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.strokeStyle = "rgb(0, 128, 0)";
    let x = 0;
    const h = canvas.height/2;
    const step = canvas.width / maxLength;

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        let y=h-b[i] * h;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);//Minus to ensure positive is up
        }
        x += step;
    }
    ctx.stroke();
}

let filterEnvIsLog = true;
//Filter is the filter object returned from the audio.js getFilter function
function paintFilterEnvelope(filter, maxLength, canvasId){
    if (!filter) return;
    const b = filter.invW0;//1/wo  = sampleRate/(2*Math.PI*f0)
    const maxF = filter.sampleRate/2;//-20 to avoid log(0)
    const invLogMaxF =1/Math.log2(maxF-20);
    const c = filter.sampleRate/(2*Math.PI);//retrieve f0 from 1/wo and scale to max frequency
    const bufferSize = b.length;

    var canvas = document.getElementById(canvasId);
    var ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.strokeStyle = "rgb(0, 0, 128)";
    let x = 0;
    const h = canvas.height;
    const step = canvas.width / maxLength;
    const scale  = filterEnvIsLog ? h * invLogMaxF : h/maxF;
    const doLog = filterEnvIsLog;//for jit optimisation

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        const f = c / b[i];
        let y =h- scale *(doLog ? Math.log2(f-20) : f);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);//Minus to ensure positive is up
        }
        x += step;
    }
    ctx.stroke();
}


function doPreviewPaint(
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
    showPhase //show phase graph of harmonics
){
    let canvas = document.getElementById(id);
    let ctx = canvas.getContext("2d");
    let w=canvas.width;
    let h=canvas.height;
    ctx.clearRect(0, 0, w, h);

    //Waveform Preview - left side square
    let wpCorner= h/16;
    let wpSize = wpCorner*14;
    ctx.fillStyle = "rgb(240, 240, 240)";
    ctx.fillRect(0, 0, wpSize+wpCorner*2, wpSize+wpCorner*2);  
    ctx.beginPath();    
    let waveScale = 1/Math.max(Math.abs(min),Math.abs(max));
    //waveForm axis lines
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(wpCorner, wpCorner + 0.5 * wpSize);
    ctx.lineTo(wpCorner + wpSize, wpCorner + 0.5 * wpSize); 
    ctx.moveTo(wpCorner+ 0.5 * wpSize, wpCorner );
    ctx.lineTo(wpCorner + 0.5 * wpSize, wpCorner + wpSize); 
    ctx.stroke();
  
    //Waveform preview
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 0)";
    for(let i=0;i<samples.length;i++){
        let x =wpCorner + i * wpSize / samples.length;
        let y =wpCorner + (0.5-0.5 * waveScale * samples[i]) * wpSize;
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
    let spL= wpCorner*3+wpSize;
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
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(spL, sp0);
    ctx.lineTo(spL + spW, sp0); 
    ctx.moveTo(spL, spT );
    ctx.lineTo(spL , spB); 
    ctx.stroke();


    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 200)";
    for (let i = 0; i < count; i++) {
        let x =spL + i * spW / count;
        let mag = magnitude[i];
        let polarity = showPolarity ? Math.sign(mag) : 1;
        let offset = spH - polarity*spH; //either 0 or spH*2 
        let y =spT +offset + polarity * Math.max(minDB, Math.log10( Math.abs(mag))) * spScale;
        ctx.moveTo(x, sp0);
        ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (!showFullSpectrum)
    {
        //Draw dots to show harmonics on zoomed in view        
        ctx.fillStyle = "rgb(0, 0, 100)";
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
        ctx.strokeStyle = "rgb(0, 140, 0)";
        const filter = filter;
        const invW0 = filter.invW0[filter.invW0.length*0.5]
        const rootW = patch.frequency * 2 * Math.PI  / filter.sampleRate;
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
    ctx.strokeStyle = "rgb(150, 150, 150)";
    ctx.moveTo(pL, p0);
    ctx.lineTo(pL + pW, p0); 
    ctx.moveTo(pL, pT );
    ctx.lineTo(pL , pB); 
    ctx.stroke();


    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(100, 0, 0)";
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
        ctx.fillStyle = "rgb(50, 0, 0)";
        for (let i = 0; i < count; i++) {
            let x =pL + i * pW / count;
            ctx.fillRect(x-0.5, p0-0.5, 1, 1); 
        }
    }


}