

import {setMushraBufferCallback, calculateMushraBuffer} from "./workerLauncher.js";
import {getColor, getColorA} from "./painting.js";


let audioContext = null;
let myAudioProcessor = null;



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//  Setup Web Audio API player 
//              - connect a AudioWorkletNode based on mushraWorklet.js
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

export function initMushra(){
    document.getElementById('nextMushra').style.display = "none";
    document.getElementById('pauseMushra').style.display = "none";
    document.getElementById('resultsMushra').style.display = "none";
    let start =document.getElementById('startMushra')
    start.style.display = "block";
    start.classList.remove('blurredDisabled');

    clearWaveform();
    setEnablesForIndex(-100)
}



export function setupMushra(patches,subjectList, sampleRate, isNormToLoudest) {
    disableSliders();
    let start =document.getElementById('startMushra')
    start.classList.add('blurredDisabled');
    
    const patchList = [[patches[0],patches[1]], [patches[2],patches[3]]]
    calculateMushraBuffer(getInterpolatedPatches(patchList, subjectList), sampleRate, isNormToLoudest);
}

const numberOfSliders=6;
let lastInterpolations = [];
function getInterpolatedPatches(patchList, subjectList){
    const patches = new Array(numberOfSliders);
    patches[0]=patchList[0];
    patches[numberOfSliders-2]=patchList[1];

    let interpolations =[];
    let intersCount = numberOfSliders-3;
    let intersStep = 1/(1+intersCount);
    for(let i=1; i<=intersCount; i++){
        interpolations.push(intersStep*i);
    }

    interpolations.forEach((x, pos)=>{
        let newPair = [];
        for(let i=0; i<2; i++){
            let A = patchList[0][i]? {...patchList[0][i]} : null;
            let B = patchList[1][i]? {...patchList[1][i]} : null;
            if (A==null || B==null) {
                newPair.push(null);
                continue;
            }
    
            subjectList.forEach((subject)=>{
                A[subject] = A[subject]*(1-x)+B[subject]*x;
            });
            newPair.push(A);
        }
        patches[pos+1] = newPair;
    });
    lastInterpolations = interpolations;

    //Work out the anchor patch - should be bad sounding - but filter alone is often not enough
    let activePatches = patchList.reduce((acc, val)=>{   
                                acc.push(val[0]);
                                if (val[1]) acc.push(val[1]);
                                return acc;
                                },[]);
    let hasBitDepth = activePatches.some((patch)=>patch.digitalBitDepth<25);
    let hasNoise = activePatches.some((patch)=>patch.inharmonicNoiseLevel>-91);
    let BadL = {...patchList[1][0]};    
    BadL.badFilter=true;
    if (!hasBitDepth) BadL.digitalBitDepth=9; 
    if (hasBitDepth && !hasNoise) BadL.inharmonicNoiseLevel=-50;                         
    
    let BadR = null;
    if (patchList[0][1]){
        BadR = {...patchList[1][1]};
        BadR.badFilter=true;
        if (!hasBitDepth) BadR.digitalBitDepth=9; 
        if (hasBitDepth && !hasNoise) BadR.inharmonicNoiseLevel=-50;  
    }
    patches[numberOfSliders-1] = [BadL, BadR];
    return patches;
}

function playMushraSound(index) {
    postWorkletMessage("playSound", {index:index});
}

export function reportMushra() {
    postWorkletMessage("report", null);
}

export function shutDownMushra() {
    disableSliders();
    if (audioContext) {
        audioContext.close();
        myAudioProcessor.disconnect();
        audioContext = null;
        myAudioProcessor = null;
        //cancelAnimationFrame(getfftFrameCall());
        //clearFFTFrameCall();
    }

}

setMushraBufferCallback((buffers)=>{
    startAudio(buffers) 
    results = [];
    shuffleMappings();
})


async function startAudio(buffers) {
    myAudioProcessor = await createMyAudioProcessor();
    if (!myAudioProcessor) {
        console.error("Failed to create AudioWorkletNode");
        return;
    }

    //postWorkletMessage("report", null)
    postWorkletMessage("loadSounds", {sounds:buffers});

    enableSliders()
}


async function createMyAudioProcessor() {
    if (!audioContext) {
        try {
        audioContext = new AudioContext();
        await audioContext.resume();
        await audioContext.audioWorklet.addModule("mushraWorklet.js");
        } catch (e) {
        return null;
        }
    }
    
    const node = new AudioWorkletNode(audioContext, "mushraPlayer",{
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
    
    });
    const srParam =  node.parameters.get("sampleRate");
    srParam.setValueAtTime(audioContext.sampleRate, audioContext.currentTime);
    node.port.onmessage = (event)=>{
        switch(event.data.type){
            case "SoundsOk":
                enableSliders();
                break;
            case "max":
                updateMinMax(event.data.data);
                break;
            default:
                console.log("Message from AudioWorklet: "+event.data.type+": "+event.data.data);
                break;
        }
    }

    node.connect(audioContext.destination); 
    return node;
}


function postWorkletMessage(name, data){
    if (!audioContext) return;
    let payload = {type:name, data:data};
    if (myAudioProcessor) myAudioProcessor.port.postMessage(payload);
}





//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//  Wire up the Mushra form controls
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


const reportButton = document.getElementById('reportMushra')
if (reportButton) reportButton.addEventListener('click', function() {
    reportMushra()
  });

document.getElementById('nextMushra').addEventListener('click', function() {    
    results.push({mapping,values});
    shuffleMappings();
    
});

let isPaused=false;
const pauseButton =document.getElementById('pauseMushra');
pauseButton.addEventListener('click', function() {  
    isPaused = !isPaused;  
    if (isPaused){
        pauseButton.textContent = "Resume";
        pauseButton.classList.add('active');
    }
    else{
        pauseButton.textContent = "Pause";
        pauseButton.classList.remove('active');
    }
    postWorkletMessage("pause",isPaused);
});
document.getElementById('resultsMushra').addEventListener('click', function() {    
    document.getElementById('mushraModal').style.display = 'none';
    document.getElementById('mushraResultsModal').style.display = 'flex'; 
    results.push({mapping,values});
    generateReport();
});

document.querySelectorAll('.vSlideGroup').forEach(function(group) {
    var index = parseInt(group.id.replace('mGroup', ''));

    group.querySelectorAll('button').forEach(function(button) {
        button.addEventListener('click', function() {
            buttonFunction(index);
        });
    });

    if (index == 0) return; //Reference column, no sliders

    const scoreElement = group.querySelector('.score');
    scoreElement.textContent = '0';

    group.querySelectorAll('input[type=range]').forEach(function(slider) {
        slider.addEventListener('input', function() {
            sliderFunction(scoreElement, index, parseInt(slider.value));
        });
        slider.value =0;
    });
});

let values = [];//Set by shuffleMappings
let mapping = [];//Set by shuffleMappings
let results = [];
function buttonFunction(index) {
    if (isPaused) return;
    playMushraSound(index==0?0:mapping[index-1]);
    setEnablesForIndex(index);
}


function sliderFunction(scoreElement, index, value) {
    values[index-1] = value;
    scoreElement.textContent = value;
}


function shuffleMappings(){
    let newMapping = new Array(numberOfSliders).fill(0);
    newMapping.forEach((v,i)=>newMapping[i]=i);
    // for (let i = newMapping.length - 1; i > 0; i--) {
    //     const j = Math.floor(Math.random() * (i + 1));
    //     [newMapping[i], newMapping[j]] = [newMapping[j], newMapping[i]];
    // }
    mapping = newMapping;
    values = new Array(numberOfSliders).fill(0);

    document.querySelectorAll('.vSlideGroup').forEach(function(group) {
        var index = parseInt(group.id.replace('mGroup', ''));
        
        if (index == 0) return; //Reference column, no sliders
    
        const scoreElement = group.querySelector('.score');
        scoreElement.textContent = '0';
    
        group.querySelectorAll('input[type=range]').forEach(function(slider) {
            slider.value =0;
        });
    });
}



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//  Enable and disable GUI elements
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

function enableSliders() {
    document.querySelectorAll('.vertical-slider-container ').forEach(function(container) {
        container.classList.remove("blurredDisabled");
    });
    document.getElementById('nextMushra').style.display = "block";
    document.getElementById('startMushra').style.display = "none";
    document.getElementById('pauseMushra').style.display = "block";
    document.getElementById('resultsMushra').style.display =  "block";
}

function disableSliders() {
    document.querySelectorAll('.vertical-slider-container ').forEach(function(container) {
        container.classList.add("blurredDisabled");
    });
    document.getElementById('nextMushra').style.display = "none";
}

function setEnablesForIndex(index){
    document.querySelectorAll('.vSlideGroup').forEach(function(group) {
        var thisIndex = parseInt(group.id.replace('mGroup', ''));
    
        group.querySelectorAll('button').forEach(function(button) {
            if (index == thisIndex) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    
        if (thisIndex == 0) return; //Reference column, no sliders
        if (thisIndex == index)
        {
            group.classList.remove('blurredDisabled');
        }
        else
        {
            group.classList.add('blurredDisabled');
        }
    });
}




//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Analyse Results
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let lastAnalysis = null;
function generateReport(){
    let analysis = analyseResults(results);
    paintResults(analysis)
    lastAnalysis = analysis;
}

export function repaintMushra(){
    if (lastAnalysis) paintResults(lastAnalysis);
}


function analyseResults(){
    //get array of values in the correct order (A=>B,anchor)
    let r = results.map((result)=>{
        return unShuffleMapping(result.mapping, result.values);
    });
    let analysis = {};
    analysis.means=getMeans(r);
    analysis.heatMap=getHeatMaps(r, 200);
    analysis.line = getQuadraticFit(analysis.means);
    return analysis;
}


//Turn mapping and values list into one list of values in the correct order
function unShuffleMapping(mapping, values){
    let newValues = new Array(numberOfSliders).fill(0);
    mapping.forEach((value, index)=>{
        newValues[value] = values[index];
    });
    return newValues;
}

function getMeans(r){
    //calculate mean values for each wave
    let means=[];
    for(let i=0; i<numberOfSliders; i++){
        let sum = 0;
        for(let j=0; j<r.length; j++){
            sum+=r[j][i];        
        }
        means.push(sum/r.length);
    }
    return means;
}

function getQuadraticFit(means) {
    let x_sum = 0;
    let x2_sum = 0;
    let x3_sum = 0;
    let x4_sum = 0;
    let y_sum = 0;
    let xy_sum = 0;
    let x2y_sum = 0;

    const n = means.length - 1; // Ignore the last point

    for (let i = 0; i < n; i++) {
        const x = i;
        const y = means[i];
        const x2 = x * x;
        const x3 = x2 * x;
        const x4 = x2 * x2;
        const xy = x * y;
        const x2y = x2 * y;

        x_sum += x;
        x2_sum += x2;
        x3_sum += x3;
        x4_sum += x4;
        y_sum += y;
        xy_sum += xy;
        x2y_sum += x2y;
    }

    //Copilot version -wrong
    // const denominator = n * (x2_sum * x4_sum - x3_sum * x3_sum) + x_sum * (x3_sum * x2_sum - x2_sum * x4_sum) + x2_sum * (x2_sum * x3_sum - x2_sum * x2_sum);
    // const a = (n * (x2y_sum * x4_sum - x3_sum * xy_sum) + x_sum * (x3_sum * xy_sum - x2y_sum * x4_sum) + x2_sum * (x2_sum * x2y_sum - x2_sum * xy_sum)) / denominator;
    // const b = (n * (x2_sum * x2y_sum - x2_sum * xy_sum) + x_sum * (x3_sum * xy_sum - x2y_sum * x2_sum) + x2_sum * (x2_sum * x3_sum - x2_sum * x2_sum)) / denominator;
    // const c = (x2_sum * (x2_sum * x2y_sum - x2_sum * xy_sum) + x_sum * (x2_sum * xy_sum - x3_sum * x2y_sum) + n * (x3_sum * x2y_sum - x2_sum * x2_sum)) / denominator;

    //My Hand version
    //ax^2+bx+c+e=y  where e is error
    //Total squared error, E = Σ(y - (ax^2+bx+c))^2
    //minimimise E by finding dE/da = 0, dE/db = 0, dE/dc = 0
    //dE/da = 0 = Σ2(y - (ax^2+bx+c))x^2
    //dE/db = 0 = Σ2(y - (ax^2+bx+c))x
    //dE/dc = 0 = Σ2(y - (ax^2+bx+c))
    //Couple of pages of calculations later to solve for a,b,c:
    const Z_x2y = x2y_sum - x2_sum * y_sum / n;
    const Z_xy = xy_sum - x_sum * y_sum / n;
    const Z_x3 = x3_sum - x_sum * x2_sum / n;
    const Z_x4 = x4_sum - x2_sum * x2_sum / n;
    const Z_x2 = x2_sum - x_sum * x_sum / n;
    let a = (Z_x2y * Z_x2 - Z_xy * Z_x3) / (Z_x2 * Z_x4 - Z_x3 * Z_x3);
    let b = (Z_xy - a * Z_x3) / Z_x2;
    let c = (y_sum - a * x2_sum - b * x_sum) / n;


    return { a, b, c};
}




function getHeatMaps(r, pointsCount){
    //Scan through the results
    //Create an array representing pointsCount points. 
    //Each point has a sum of distances to each of the values
    let heatMaps = [];
    let pScale = 100/pointsCount;
    let min = Number.MAX_SAFE_INTEGER;
    let max = Number.MIN_SAFE_INTEGER;
    const lowP =-Math.round(pointsCount*0.1);
    const highP = pointsCount - lowP;
    for(let i=0; i<numberOfSliders; i++){
        let heatMap = new Array(pointsCount).fill(0);
        for (let p=lowP; p<highP; p++){
            let point = p*pScale;
            let sum = 0;
            for(let j=0; j<r.length; j++){
                let value = r[j][i];
                const dist = (100 - Math.abs(value-point))*0.01;//
                sum+= dist*dist*dist*dist*dist*dist;
            }
            heatMap[p-lowP]=sum;
            if (sum<min) min = sum;
            if (sum>max) max = sum;
        }
        heatMaps.push(heatMap);
    }


    //Remap all of the values so that the hottest is 1 and the coldest is 0
    //The distance calc gives hottest as lowest number, so need to inverse
    //If min and max are the same, set all values to 0.5
    let range = max-min;
    let scale =range!=0? -1/range : 0;
    let offset = range!=0? 1 : 0.5;

    heatMaps.forEach((heatMap)=>{
        heatMap.forEach((point,index)=>{
            heatMap[index] = (point-min)*scale+offset;
        });
    });
    return heatMaps;
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Draw Results
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const resCanvas = document.getElementById("mushraResultCanvas");
const resCtx = resCanvas.getContext("2d");

function paintResults(analysis){
    //Reset ready for next frame
    const ctx = resCtx;    
    const canvas = resCanvas;

    checkBounds(canvas)

    const labels = [
        "A",
        ...lastInterpolations.map((x)=>x.toFixed(2)), 
        "B",
        "Anchor"];

    const w = canvas.width;
    const h = canvas.height;
    const border=20;

    let heatMap = analysis.heatMap;
    let means = analysis.means;
    let fit = analysis.line;

    const gL = border*2;
    const gT = border;
    const gB = h-border;
    const gW = w-border*3;
    const gH = gB-gT;
    const gy0 =gB- gH/12;
    const gy100 = gT+ gH/12;
    const gyh= gy0-gy100;

    const columnWidth = gW / heatMap.length;

    ctx.clearRect(0, 0, w, h);

    const len = heatMap[0].length;
    const rectangleHeight =  gH / len;
    
    //Draw heat map and mean plot
    for (let i = 0; i < heatMap.length; i++) {
        const columnX =gL + i * columnWidth;
        const meanY = gy0 - (means[i] / 100) * gyh;

        // Draw heatmap
        for (let j = 0; j < len; j++) {
            const rectangleY =gT + (len-1-j) * rectangleHeight;
            const colorIntensity = Math.round(255 * heatMap[i][j]);
            ctx.fillStyle = `rgb(255,${colorIntensity},${colorIntensity})`;
            ctx.fillRect(columnX, rectangleY, columnWidth, 1+rectangleHeight);
        }
        // Draw mean
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(columnX + columnWidth / 2, meanY, 5, 0, 2 * Math.PI);
        ctx.fill();
    }

    //Draw grid and column labels
    for (let i = 0; i < heatMap.length; i++) {
        const columnX =gL + i * columnWidth;

        // Draw column
        ctx.strokeStyle = 'gray';
        ctx.beginPath();
        ctx.moveTo(columnX + columnWidth, gT);
        ctx.lineTo(columnX+ columnWidth, gB);
        ctx.stroke();

        // Draw text number
        ctx.fillStyle = getColor(0,0,0);
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(labels[i], columnX + columnWidth / 2, gB + 18);
    }
    // Draw Ideal Line
    ctx.beginPath();
    ctx.lineWidth = columnWidth*0.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,128,0.1)';
    const startY = gy0 - (100 / 100) * gyh; // Start at a value of 100
    const endY = gy0 - (0 / 100) * gyh; // End at a value of 0
    ctx.moveTo(gL + 0.5 * columnWidth, startY); // Start at column zero
    ctx.lineTo(gL + (0.5 + heatMap.length - 2) * columnWidth, endY); // End at the last column (the one before the ignored one)
    ctx.stroke();


    //Draw quadratic fit
    const pointsPerColumn = 5;
    const length = (heatMap.length-2)*pointsPerColumn +1;// Ignore the last column, plot centre of first to centre of last, 
    
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,255,0.5)';
    for (let i = 0; i < length; i++) { 
        const x = i/pointsPerColumn;
        const columnX = gL + (0.5+x) * columnWidth;    
        
        // Draw quadratic fit
        const y = gy0 - (((fit.a * x  + fit.b) * x + fit.c) / 100) * gyh;
        if (i==0){
            ctx.moveTo(columnX , y);
        }
        else{
            ctx.lineTo(columnX, y);
        }
    }
    ctx.stroke();

    ctx.lineCap = 'butt';


    //Labels
    ctx.fillStyle = getColor(0,0,0);
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText('100', gL-15, gy100);
    ctx.fillText('0', gL-15, gy0);

    //Axis
    
    ctx.strokeStyle = getColor(0,0,0);
    ctx.beginPath();
    ctx.moveTo(gL, gT);
    ctx.lineTo(gL, gB);
    ctx.lineTo(gL + gW, gB);
    ctx.stroke();


}



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Draw Waveform
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let frameCall = null;
let maxValues = [];
function updateMinMax(maxValue){
    const variation = 0.6 -maxValue*0.5;
    maxValues.push(maxValue*(variation+Math.random()*((1-variation)*2)));
    if (frameCall) return;
    frameCall = requestAnimationFrame(paintWaveform);

}

const waveCanvas = document.getElementById("mushraOutputCanvas");
const waveCTX = waveCanvas.getContext("2d");


function clearWaveform(){
    checkBounds(waveCanvas)
    waveCTX.fillStyle =  getColor(215,215,215);
    waveCTX.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
}


function paintWaveform(){
    //Reset ready for next frame
    frameCall = null;
    const values = maxValues;
    maxValues = [];
    const ctx = waveCTX;    
    const canvas = waveCanvas;

    checkBounds(canvas)

    const waveformWidth = canvas.width;
    const waveformHeight = canvas.height;
    if (waveformHeight<2 || waveformWidth<2) return;
    ctx.fillStyle =  getColor(215,215,215);
    const scale = waveformHeight/2.2;//slightly bigger than +/-1
    const halfHeight = waveformHeight/2;

    values.forEach((max)=>{    
        ctx.drawImage(canvas, -1, 0);  
        
        //ctx.clearRect(waveformWidth - 1, 0, 2, waveformHeight);
        ctx.fillRect(waveformWidth - 1, 0, 2, waveformHeight);
        ctx.beginPath();  
        ctx.strokeStyle = getColor(0,0,255);
        ctx.lineWidth = 1;
        ctx.moveTo(waveformWidth-1 , halfHeight );
        ctx.lineTo(waveformWidth , halfHeight);
        ctx.moveTo(waveformWidth , halfHeight + max*scale);
        ctx.lineTo(waveformWidth , halfHeight - max*scale);
        ctx.stroke();
        });

}

function checkBounds(canvas){
    if (canvas.width != canvas.clientWidth || canvas.height != canvas.clientHeight){
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
}