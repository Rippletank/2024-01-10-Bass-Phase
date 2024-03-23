import { getGreyColorA, getColor } from "../sharedGui/colors.js";


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


let fftFrameCall ={};
let ultrasonicContent = {};


const fftStartF = 200;
const fftEndF = 48000;
export function startFFT(context, analyser, canvasId){
    if (fftFrameCall[canvasId]) return;
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
    let fftB = 0;
    let fftCanvasWidth = 0;
    let fftCanvasHeight = 0;
    let octaveStep = 0;
    const fftDraw =()=>{
        fftFrameCall[canvasId] =useFFT? requestAnimationFrame(fftDraw): null;
        
        const w = canvas.width;
        const h = canvas.height;
        fftCanvasWidth = w;
        fftCanvasHeight = h;
        fftT = h*0.05;
        fftL = h*0.05;
        ffrW = w-fftL*2;
        fftH = h-fftT*2 -20;
        fftB = fftT + fftH;

        const maxLogF = Math.log2(fftEndF/fftStartF);
        octaveStep = maxLogF / ffrW;
        const hScale = fftH / 256;

        //Draw grid
        ctx.beginPath();    
        ctx.lineWidth = 1;
        ctx.strokeStyle = getColor(210, 210, 210);
        ctx.fillStyle = getColor(0, 0, 0); // color of the text
        ctx.font = "14px Arial"; // font of the text
        ctx.textAlign = "center"; // horizontal alignment
        [1,5,10,20,30,40].forEach((i)=>{
            let x = Math.log2(i*1000/fftStartF) / octaveStep;
            ctx.moveTo(x, fftT);
            ctx.lineTo(x, fftB);
            ctx.fillText(i+'kHz', x,fftB+15); 
        });
        ctx.stroke();


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

        //Check for ultrasonic content
        let ultrasonic = new Float32Array(28);
        for (let i = 0; i < 28; i++) {
            let startF = (20000 + 1000 * i) * octaveStep;
            let endF = (20000 + 1000 * (i+1)) * octaveStep;
            let startBin = Math.round(startF * freqStep );
            let endBin = Math.min(fft.length-1, Math.round(endF * freqStep ));
            let max = 0;
            for (let j = startBin; j < endBin; j++) {
                max = Math.max(max,fft[j]);
            }
            ultrasonic[i] = max;
        }
        ultrasonicContent[canvasId] = ultrasonic;
    }
    fftDraw();
}