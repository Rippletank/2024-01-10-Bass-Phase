

import {setMushraBufferCallback, calculateMushraBuffer} from "./workerLauncher.js";


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
    document.getElementById('startMushra').style.display = "block";
    clearWaveform();
    setEnablesForIndex(-100)
}



export function setupMushra(patches,subjectList, sampleRate, isNormToLoudest) {
    disableSliders();
    const patchList = [[patches[0],patches[1]], [patches[2],patches[3]]]
    calculateMushraBuffer(getInterpolatedPatches(patchList, subjectList), sampleRate, isNormToLoudest);
}


function getInterpolatedPatches(patchList, subjectList){
    const patches = new Array(6);
    patches[0]=patchList[0];
    patches[4]=patchList[1];
    [0.25,0.5,0.75].forEach((x, pos)=>{
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
    patches[5] = [BadL, BadR];
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

let values = [0,0,0,0,0,0];
let mapping = [0,1,2,3,4,5];
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
    let newMapping = [0,1,2,3,4,5];
    for (let i = newMapping.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newMapping[i], newMapping[j]] = [newMapping[j], newMapping[i]];
    }
    mapping = newMapping;
    values = [0,0,0,0,0,0];

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
    document.getElementById('resultsMushra').style.display = "block";
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
// Draw Waveform
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

let frameCall = null;
function getFrameCall(){
    return frameCall;
}
function clearFrameCall(){
    frameCall = null;
}


let maxValues = [];
function updateMinMax(maxValue){
    const variation = 0.6 -maxValue*0.5;
    maxValues.push(maxValue*(variation+Math.random()*((1-variation)*2)));
    if (frameCall) return;
    frameCall = requestAnimationFrame(paintWaveform);

}

const canvas = document.getElementById("mushraOutput");
const ctx = canvas.getContext("2d");


function clearWaveform(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}


function paintWaveform(){
    //Reset ready for next frame
    frameCall = null;
    const values = maxValues;
    maxValues = [];


    if (canvas.width != canvas.clientWidth || canvas.height != canvas.clientHeight){
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        return;
    }


    const waveformWidth = canvas.width;
    const waveformHeight = canvas.height;
    ctx.fillStyle = "white";
    const scale = waveformHeight/2.2;//slightly bigger than +/-1
    const halfHeight = waveformHeight/2;

    values.forEach((max)=>{    
        ctx.drawImage(canvas, -1, 0);  
        ctx.strokeStyle = "green";  
        //ctx.clearRect(waveformWidth - 1, 0, 2, waveformHeight);
        ctx.fillRect(waveformWidth - 1, 0, 2, waveformHeight);
        ctx.beginPath();  
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 1;
        ctx.moveTo(waveformWidth-1 , halfHeight );
        ctx.lineTo(waveformWidth , halfHeight);
        ctx.moveTo(waveformWidth , halfHeight + max*scale);
        ctx.lineTo(waveformWidth , halfHeight - max*scale);
        ctx.stroke();
        });

}

