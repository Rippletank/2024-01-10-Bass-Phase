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
    ctx.fillStyle = "rgba(240, 240, 240, 0.05)";
    ctx.fillRect(0,0,w,h);  
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
        ctx.fillStyle = "rgba(240, 240, 240, 0.05)";
        ctx.fillRect(0,0,w,h);        
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = "rgb(0, 50, 0)";
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
//Buffer should be 64k samples long float32array
function paintDetailedFFT(buffer, sampleRate, canvasId){
    if (buffer.length!=65536) {
        console.log('paintDetailedFFT buffer length is not 65536');
        return;
    }
    let canvas = document.getElementById(canvasId);
    let ctx = canvas.getContext("2d");
    const w = canvas.width; 
    const h = canvas.height;
    const fftL= h*0.01;
    const fftT= h*0.01;
    const fftW = w-fftL*2;
    const fftH = h-fftT*2;
    const fftB = fftT+fftH;
    const bufferLength = 65536;//fixed at max
    let fft = getFFT64k(buffer);

    const maxLogF = Math.log2(detailedMaxF/detailedMinF);
    const octaveStep = maxLogF / fftW;
    const freqStep = bufferLength / sampleRate;
    const dbScale = (detailedMaxDb-detailedMinDb) / 20;
    const dbOffset = detailedMinDb / 20;
    const hScale = fftH/dbScale;
 
    ctx.fillStyle = "rgb(245, 245, 245)";
    ctx.fillRect(0,0,w,h);        
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(50, 0, 0)";
    ctx.fillStyle = "rgb(50, 0, 0)";
    ctx.beginPath();

    let lastX = 0;
    let startBin = Math.round((detailedMinF * Math.pow(2,octaveStep))  * freqStep );
    for (let i = 0; i < fftW; i++) {
        let endOctave = (i+1) * octaveStep;
        let endBin = Math.round((detailedMinF * Math.pow(2,endOctave))  * freqStep );
        if (endBin>startBin){
            let max = 0;
            for (let j = startBin; j < endBin; j++) {
                max = Math.max(max,fft.magnitude[j]);
            }
            let y = fftB - ( (Math.log10(max) -dbOffset) * hScale);// (20*Math.log10(max) -detailedMinDb)/(detailedMaxDb-detailedMinDb) * fftH;
            if (!y || y>fftB) y=fftB-1;
            const x = fftL+i;
            const midX = (lastX+x)/2;
            ctx.moveTo(midX, fftB);
            ctx.lineTo(midX, y);
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
        drag:(deltaX,deltaY) =>{//both -1=>1, scaled by dimensions of canvas
            const currentRange = Math.log2(detailedMaxF/detailedMinF);
            let midRange = currentRange/2;
            let deltaRange = midRange; //how wide either side of mid range
            midRange -=midRange*deltaX;

            if (Math.abs(deltaY)>0.5)deltaY = Math.sign(deltaY)*0.5;
            deltaRange *=Math.pow(2,deltaY);//up down to zoom in/out

            detailedMinF = detailedMinF *Math.pow(2,midRange-deltaRange);
            detailedMaxF = detailedMinF *Math.pow(2,midRange+deltaRange);
            }
    }
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

    for (let i = 0; i < maxLength; i++) {
        if (i >= bufferSize) break;
        const f = c / b[i];
        let y =h- scale *(filterEnvIsLog ? Math.log2(f-20) : f);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);//Minus to ensure positive is up
        }
        x += step;
    }
    ctx.stroke();
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
            }
        }
    };



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

    adjustForPhase(magnitude,phases,showPolarity)
    ctx.beginPath();    
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgb(0, 0, 200)";
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