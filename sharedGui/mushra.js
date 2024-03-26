

import {getColor} from "./colors.js";
import { 
    initPlayerWorklet,
    getWavePlayer, 
    doPlaySound,
    doPause,
    logStatus,
    doLoadPlayerWave,
    setSampleRateReporting } from "./wavePlayerLauncher.js";

let audioContext = null;
let myWavePlayer = null;
let analyserNode = null;
export function getAnalyserNode(){
    return analyserNode;
}
let fftCanvasId = null;



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



export function startMushra() {
    disableSliders();
    let start =document.getElementById('startMushra')
    start.classList.add('blurredDisabled');    
}

let numberOfSliders=6;
export function setNumberOfSliders(n){
    numberOfSliders = n;
}


function playMushraSound(index) {
    doPlaySound(myWavePlayer, index);
}

export function reportMushra() {
    logStatus(myWavePlayer);
}

export function shutDownMushra() {
    disableSliders();
    if (audioContext) {
        audioContext.close();
        myWavePlayer.disconnect();
        audioContext = null;
        myWavePlayer = null;
        //cancelAnimationFrame(getfftFrameCall());
        //clearFFTFrameCall();
    }

}

export function doSetSampleRateReporting(isReporting) {
    setSampleRateReporting(myWavePlayer, isReporting);
}   


let waveLabels = [];
export async function startAudio(sampleRate, buffers, labels, fftId=null) {   //buffers is array of two member arrays, for stereo. Second member is null for mono
    myWavePlayer = await createMyAudioProcessor(sampleRate, fftId);
    if (!myWavePlayer) {
        console.error("Failed to create AudioWorkletNode");
        return;
    }

    doLoadPlayerWave(myWavePlayer, buffers);//array of arrays of Float32Arrays, [[L1,R1],[L2,R2]] or [[M1,null],[M2,null]]

    enableSliders(); 
    waveLabels = labels;
    results = [];
    shuffleMappings();
}

const fftSize = 4096*8;
async function createMyAudioProcessor(sampleRate, fftId) {
    if (!audioContext) {
        try {
            audioContext = new AudioContext({sampleRate: sampleRate});
            await audioContext.resume();
            await initPlayerWorklet(audioContext)
        } catch (e) {
            return null;
        }
    }    
    const node = getWavePlayer(audioContext, enableSliders, updateMax);
    let params = node.parameters;
    params.get("sampleRate").setValueAtTime(audioContext.sampleRate, audioContext.currentTime);

    if(fftId){
        //create an analyser, too
        analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
        analyserNode.fftSize = fftSize;
        analyserNode.smoothingTimeConstant = 0.0;
        analyserNode.minDecibels = -120;
        analyserNode.maxDecibels = 0;
        node.connect(analyserNode);
        analyserNode.connect(audioContext.destination);
    }
    else{
        node.connect(audioContext.destination); 
    }
    
    return node;
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
    showCount();
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
    doPause(myWavePlayer,isPaused);
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


function buttonFunction(index) {
    if (isPaused) return;
    playMushraSound(index==0?0:mapping[index-1]);
    setEnablesForIndex(index);
}


function sliderFunction(scoreElement, index, value) {
    values[index-1] = value;
    scoreElement.textContent = value;
}

function showCount(){
    document.getElementById('mushraCount').textContent = "Test number " + (results.length+1);
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//  Hidden mappings and results
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let values = [];//Set by shuffleMappings
let mapping = [];//Set by shuffleMappings
let results = [];

function shuffleMappings(){
    let newMapping = new Array(numberOfSliders).fill(0);
    newMapping.forEach((v,i)=>newMapping[i]=i);
    for (let i = newMapping.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newMapping[i], newMapping[j]] = [newMapping[j], newMapping[i]];
    }
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

showCount();


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


function createResultsTable(analysis){
    let table = document.getElementById('mushraResultsTable');

    const labels = analysis.labels;
    const pValues = analysis.pValues;

    let soundRow = table.rows[0];
    let pScoreRow = table.rows[1];
    let meaningRow = table.rows[2];
    for (let row of [soundRow, pScoreRow, meaningRow]) {
        for (let i = row.cells.length - 1; i > 0; i--) {
            row.deleteCell(i);
        }
    }


    for (let i=0; i<labels.length; i++){
        const label = labels[i];
        let meaningText ="" ;
        let pScoreText ="" ;
        // Add a new cell to the sound row
        let soundCell = soundRow.insertCell();
        soundCell.textContent = label;
    
        //No pValue for A - other sounds are compared to it!
        if(i>0){
            const pValue = pValues[i-1];
            const absPValue = Math.abs(pValue);
            // Add a new cell to the pScore row
            pScoreText = pValue.toFixed(2 + (absPValue<0.1?2:1));

            if (pValue===0){
                pScoreText=" - ";
                meaningText="Too similar";
            }
            else if (pValue===1){
                pScoreText=" - ";
                meaningText="Too few tests";
            }
            else if (absPValue===0.5){
                pScoreText=(pValue<0?"< -":">") + "0.25";
                meaningText="Too random";
            }
            else if(absPValue<0.05){
                meaningText="Significantly" + (pValue<0?" lower":" higher");

            }
            else {
                meaningText=(pValue<0?"Lower":"Higher");
            }
        }
        else{
            meaningText="Reference";
        }

        let pScoreCell = pScoreRow.insertCell();
        pScoreCell.textContent =pScoreText;
        let meaningCell = meaningRow.insertCell();
        meaningCell.textContent = meaningText;
    }


}


function createTextReport(analysis) {
    let div = document.getElementById('mushraTextAnalysis');
    div.innerHTML = '';

    // Create and append new p elements based on the analysis object
    for (let i=0; i<analysis.qualityChecks.length; i++) {
            let p = document.createElement('p');
            p.textContent = analysis.qualityChecks[i] ;
            if (p.textContent.startsWith("Warning"))
            {
                p.classList.add('warning');
            }
            div.appendChild(p);
    }
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Draw Results
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let paintShowLOBF = true;
let paintShowExpected = false;
let doReportOnB = false;
export function setResultsStyle(showLOBF, showExpected, reportOnB){
    paintShowLOBF = showLOBF;
    paintShowExpected = showExpected;
    doReportOnB = reportOnB;
    repaintMushra();
}


const resCanvas = document.getElementById("mushraResultCanvas");
const resCtx = resCanvas.getContext("2d");

function paintResults(analysis){
    //Reset ready for next frame
    const ctx = resCtx;    
    const canvas = resCanvas;

    checkBounds(canvas)


    const w = canvas.width;
    const h = canvas.height;
    const border=20;

    const labels = analysis.labels;
    const heatMap = analysis.heatMap;
    const means = analysis.means;
    const fit = analysis.line;

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

    if (paintShowExpected){
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
    }


    if (paintShowLOBF){
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
    }

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
function updateMax(maxValue){
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

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Analyse Results
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let lastAnalysis = null;
function generateReport(){
    let analysis = analyseResults(results);
    paintResults(analysis)
    createResultsTable(analysis);
    createTextReport(analysis);
    showResultsCount();
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
    const means = getMeans(r);
    let analysis = {
        labels : waveLabels,
        raw:r,
        means:means,
        heatMap:getHeatMaps(r, 200),
        line : getQuadraticFit(means),
        sds : getStandardDeviations(r,means),
        pValues : calculatePValues(r),
        qualityChecks:getChecks(r)
    };
    return analysis;
}


let specialResultsText="";
export function SetSpecialResultsText(text){
    specialResultsText = text;
}

function showResultsCount(){
    document.getElementById('resultsCount').textContent = "Tests Taken: " + (results.length);
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

function getStandardDeviations(r,means){
    //calculate standard deviation for each wave
    let sds = [];
    for(let i=0; i<numberOfSliders; i++){
        let sum = 0;
        for(let j=0; j<r.length; j++){
            sum+=Math.pow(r[j][i]-means[i],2);        
        }
        sds.push(Math.sqrt(sum/r.length));
    }
    return sds;

}

function getChecks(r){
    let ALessThan90 = 0;
    let BGreaterThan90 = 0;
    let AnchorGreaterThan90 = 0;
    for(let i=0; i<r.length; i++){
        if (r[i][0]<90) ALessThan90++;
        if (r[i][r.length-2]>90) BGreaterThan90++;
        if (r[i][r.length-1]>90) AnchorGreaterThan90++;
    }
    const ATooLow=ALessThan90/r.length;
    const BTooHigh=BGreaterThan90/r.length;
    const AnchorTooHigh=AnchorGreaterThan90/r.length;

    let report =[];
    if (specialResultsText && specialResultsText.length>0) report.push(specialResultsText);
    if (r.length<3) report.push("Too few tests to be reliable.");
    if (ATooLow>0.15) report.push("Too many low scores for reference A: "+(ATooLow*100).toFixed(0)+"%");
    if (doReportOnB){
        if (BTooHigh>0.15) report.push("Too many high score for B: "+(ATooLow*100).toFixed(0)+"%");
        if (BTooHigh>0.25) report.push("B probably too similar to A.");
    }
    if (AnchorTooHigh>0.15) report.push("Too many high scores for Anchor: "+(ATooLow*100).toFixed(0)+"%");
    if (AnchorTooHigh>0.25) report.push("Anchor may be too similar to do its job.");
    return report;
}

function getQuadraticFit(means) {
    let x_sum = 0;
    let x2_sum = 0;
    let x3_sum = 0;
    let x4_sum = 0;
    let y_sum = 0;
    let xy_sum = 0;
    let x2y_sum = 0;

    const n = means.length - 1; // Ignore the last point it is the anchor

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

    //Copilot version -wrong!
    // const denominator = n * (x2_sum * x4_sum - x3_sum * x3_sum) + x_sum * (x3_sum * x2_sum - x2_sum * x4_sum) + x2_sum * (x2_sum * x3_sum - x2_sum * x2_sum);
    // const a = (n * (x2y_sum * x4_sum - x3_sum * xy_sum) + x_sum * (x3_sum * xy_sum - x2y_sum * x4_sum) + x2_sum * (x2_sum * x2y_sum - x2_sum * xy_sum)) / denominator;
    // const b = (n * (x2_sum * x2y_sum - x2_sum * xy_sum) + x_sum * (x3_sum * xy_sum - x2y_sum * x2_sum) + x2_sum * (x2_sum * x3_sum - x2_sum * x2_sum)) / denominator;
    // const c = (x2_sum * (x2_sum * x2y_sum - x2_sum * xy_sum) + x_sum * (x2_sum * xy_sum - x3_sum * x2y_sum) + n * (x3_sum * x2y_sum - x2_sum * x2_sum)) / denominator;

    //My Hand version
    //ax^2+bx+c+e=y  where e is error
    //Total squared error, E = Σ(y - (ax^2+bx+c))^2
    //Minimise E by finding dE/da = 0, dE/db = 0, dE/dc = 0
    //dE/da = 0 = Σ[2(y - (ax^2+bx+c))x^2]
    //dE/db = 0 = Σ[2(y - (ax^2+bx+c))x]
    //dE/dc = 0 = Σ[2(y - (ax^2+bx+c))]
    //Couple of pages of calculations later to solve for a,b,c:
    //(Remember, Σc = cΣ1 = nc because c is constant)
    const Z_x2y = x2y_sum - x2_sum * y_sum / n;
    const Z_xy = xy_sum - x_sum * y_sum / n;
    const Z_x3 = x3_sum - x_sum * x2_sum / n;
    const Z_x4 = x4_sum - x2_sum * x2_sum / n;
    const Z_x2 = x2_sum - x_sum * x_sum / n;
    let a = (Z_x2y * Z_x2 - Z_xy * Z_x3) / (Z_x2 * Z_x4 - Z_x3 * Z_x3);
    let b = (Z_xy - a * Z_x3) / Z_x2;
    let c = (y_sum - a * x2_sum - b * x_sum) / n;

    
    let error_sum = 0;
    for (let i = 0; i < n; i++) {
        const x = i;
        const y_actual = means[i];
        const y_predicted = a * x * x + b * x + c;
        const error = y_actual - y_predicted;
        error_sum += error * error;
    }
    const mse = error_sum / n; // Mean squared error
    const rmse = Math.sqrt(mse); // Root mean square error
    return { a, b, c, rmse };
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


//Returns the p values for each sample compared to sample A, index 0
function calculatePValues(r) {
    let pValues = [];
    for(let i=1; i<numberOfSliders; i++){
        let pValue = calculatePValue(r.map((result)=>[result[0],result[i]]));
        pValues.push(pValue);
    }
    return pValues;

}

//Returns the calculate p value 0.001 to 0.25 (the confidence that the difference is real)
//If the calculated P value is negative, the difference is in favour of the second sample (unexpectedly)
//Or returns 1 if there are not enough samples
//returns 0 if the t value is 0 - i.e. no difference
//returns 0.5 if the t value is too small to be in the table
function calculatePValue(pairedScores) {
    let n = pairedScores.length;
    if (n < 2) return 1;
    let sd = 0;


    let differences = pairedScores.map((pair)=>pair[1]-pair[0]);
    let mean = differences.reduce((acc, val)=>acc+val,0)/n;
    differences.forEach((diff)=>sd+=Math.pow(diff-mean,2));

    //sd = Math.sqrt(sd / (n - 1));//Hmm, I think this can be considered the entire population so n-1 is wrong 
    sd = Math.sqrt(sd / n);//So, use n instead

    const t = mean / (sd / Math.sqrt(n));
    if (!t) return 0;
    const absT = Math.abs(t);
    const tRow = getT_Row(n);
    const p =  Math.sign(t) * interpolatePValue(tRow, absT)

    console.log("pairs: "+pairedScores.length+" mean: "+mean+" sd: "+sd+" t: "+t+" p: "+p);
    console.log(pairedScores);
    return p;
}

function interpolatePValue(tRow, t) {
    let pValue = 0.5;
    for (let i = 0; i < tRow.length; i++) {
        const cv2=tRow[i];
        if (t > cv2) {
            if (i === 0 ){
                pValue = significanceLevels[i];
            } else {
                const cv1 = tRow[i - 1];
                const sl2 = significanceLevels[i];
                const sl1 = significanceLevels[i - 1];
                pValue = sl1  +  (sl2 - sl1) * (cv1 - t)/ (cv1 - cv2);
            }
            break;
        }
    }
    return pValue;
}



function getT_Row(n){
    const df = n - 1;
    if (df<31) return tCriticalValues[df-1];
    if (df<85) return tCriticalValues[Math.floor((df-25)/10)+29];
    if(df<100) return tCriticalValues[34];
    return tCriticalValues[35];
}

//Via Copilot:
//Cross-referenced against https://www.tdistributiontable.com/?utm_content=cmp-true
//Sorting into this format, by Claude.ai
const significanceLevels = [0.001, 0.005, 0.01, 0.02, 0.025, 0.05, 0.10, 0.15, 0.20, 0.25];
const tCriticalValues = [
    //1..5
    [318.313, 63.657, 31.821, 15.894, 12.706, 6.314, 3.078, 1.963, 1.376, 1.000],//0
    [22.327, 9.925, 6.965, 4.849, 4.303, 2.920, 1.886, 1.386, 1.061, 0.816],
    [10.215, 5.841, 4.541, 3.482, 3.182, 2.353, 1.638, 1.250, 0.978, 0.765],
    [7.173, 4.604, 3.747, 2.999, 2.776, 2.132, 1.533, 1.190, 0.941, 0.741],
    [5.893, 4.032, 3.365, 2.757, 2.571, 2.015, 1.476, 1.156, 0.920, 0.727],//4
    
    //6..10
    [5.208, 3.707, 3.143, 2.612, 2.447, 1.943, 1.440, 1.134, 0.906, 0.718],
    [4.785, 3.499, 2.998, 2.517, 2.365, 1.895, 1.415, 1.119, 0.896, 0.711],
    [4.501, 3.355, 2.896, 2.449, 2.306, 1.860, 1.397, 1.108, 0.889, 0.706],
    [4.297, 3.250, 2.821, 2.398, 2.262, 1.833, 1.383, 1.100, 0.883, 0.703],
    [4.144, 3.169, 2.764, 2.359, 2.228, 1.812, 1.372, 1.093, 0.879, 0.700],//9

    //11..15
    [4.025, 3.106, 2.718, 2.328, 2.201, 1.796, 1.363, 1.088, 0.876, 0.697],
    [3.930, 3.055, 2.681, 2.303, 2.179, 1.782, 1.356, 1.083, 0.873, 0.695],
    [3.852, 3.012, 2.650, 2.282, 2.160, 1.771, 1.350, 1.079, 0.870, 0.694],
    [3.787, 2.977, 2.624, 2.264, 2.145, 1.761, 1.345, 1.076, 0.868, 0.692],
    [3.733, 2.947, 2.602, 2.249, 2.131, 1.753, 1.341, 1.074, 0.866, 0.691],//14
    
    //16..20
    [3.686, 2.921, 2.583, 2.235, 2.120, 1.746, 1.337, 1.071, 0.865, 0.690],
    [3.646, 2.898, 2.567, 2.224, 2.110, 1.740, 1.333, 1.069, 0.863, 0.689],
    [3.610, 2.878, 2.552, 2.214, 2.101, 1.734, 1.330, 1.067, 0.862, 0.688],
    [3.579, 2.861, 2.539, 2.204, 2.093, 1.729, 1.328, 1.066, 0.861, 0.688],
    [3.552, 2.845, 2.528, 2.195, 2.086, 1.725, 1.325, 1.064, 0.860, 0.687],//19

    //21..25
    [3.527, 2.831, 2.518, 2.187, 2.080, 1.721, 1.323, 1.063, 0.859, 0.686],
    [3.505, 2.819, 2.508, 2.180, 2.074, 1.717, 1.321, 1.061, 0.858, 0.686],
    [3.485, 2.807, 2.500, 2.173, 2.069, 1.714, 1.319, 1.060, 0.858, 0.685],
    [3.467, 2.797, 2.492, 2.167, 2.064, 1.711, 1.318, 1.059, 0.857, 0.685],
    [3.450, 2.787, 2.485, 2.160, 2.060, 1.708, 1.316, 1.058, 0.856, 0.684],//24

    //26..30
    [3.435, 2.779, 2.479, 2.154, 2.056, 1.706, 1.315, 1.058, 0.856, 0.684],
    [3.421, 2.771, 2.473, 2.149, 2.052, 1.703, 1.314, 1.057, 0.855, 0.684],
    [3.408, 2.763, 2.467, 2.145, 2.048, 1.701, 1.313, 1.056, 0.855, 0.683],
    [3.396, 2.756, 2.462, 2.140, 2.045, 1.699, 1.312, 1.055, 0.854, 0.683],
    [3.385, 2.750, 2.457, 2.136, 2.042, 1.697, 1.310, 1.055, 0.854, 0.683],//29

    //40, 50, 60, 70, 80
    [3.307, 2.704, 2.423, 2.120, 2.021, 1.684, 1.303, 1.050, 0.851, 0.679],//30
    [3.261, 2.678, 2.403, 2.110, 2.009, 1.676, 1.299, 1.047, 0.849, 0.676],
    [3.232, 2.660, 2.390, 2.101, 2.000, 1.671, 1.296, 1.045, 0.848, 0.674],
    [3.210, 2.648, 2.381, 2.093, 1.994, 1.667, 1.294, 1.044, 0.847, 0.672],
    [3.194, 2.639, 2.374, 2.086, 1.990, 1.664, 1.292, 1.043, 0.846, 0.671],//34

    //infinity
    [3.090, 2.576, 2.326, 2.000, 1.960, 1.645, 1.282, 1.036, 0.842, 0.674] //35
    ];

