import { startFFT } from "./painting.js";
import {initMushra, setNumberOfSliders, startMushra, startAudio, getAnalyserNode } from "../sharedGui/mushra.js"; 
import {initWorkers, setMushraBufferCallback, calculateMushraBuffer, setAudioEngineSampleBuffers} from "./workerLauncher.js"; 
import {getDefaultPatch} from "../sharedAudio/defaults.js";
import {fetchWaveByName} from "../sharedGui/waves.js";


//web audio api objects
let audioContext = null;



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Input monitoring to check samplerate is correctly implemented 
//and not being faked by the drivers/browser/OS
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


export function startListening(){
    createInputChain();
    startFFT(audioContext, analyserNode, "inputFFTCanvas");
}

export function setupPlayer(){
}

export function stopListening(){
    if (source){
        source.disconnect(analyserNode);
        source = null;
    }
}

const requestedSampleRate = 96000;
function ensureAudioContext(){
    if (!audioContext){
        //Will throw a warning in some browsers if not triggered by a user action
        //On page start up this is called anyway to get the playback samplerate to use for buffer generation
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate:requestedSampleRate}); 
        console.log('Sample rate: ' + audioContext.sampleRate + 'Hz')
        initWorkers(numberOfSliders);

    }    
    if (!audioContext) {
        console.error("Failed to create AudioWorkletNode");
    }
}


const fftSize = 4096*8;
let analyserNode = null;
let source = null;
function createInputChain(){
    ensureAudioContext();
    if (!audioContext) return;
    if (source) return;

    analyserNode = audioContext.createAnalyser();//blackman window with default smoothing 0.8
    analyserNode.fftSize = fftSize;
    analyserNode.smoothingTimeConstant = 0.0;
    analyserNode.minDecibels = -120;
    analyserNode.maxDecibels = 0;
    //https://stackoverflow.com/questions/71978189/lag-when-playing-mic-audio-directly-to-output-using-web-audio-api
    //https://w3c.github.io/mediacapture-main/#media-track-supported-constraints
    const constraints = { audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false
    } };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyserNode);  
      })
        .catch((error) => {
            console.error('Error accessing Input device:', error);
        });
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Connect mushra and the WavePlayer
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

const numberOfSliders=6;
setNumberOfSliders(numberOfSliders);

export function doInitMushra(){
    initMushra();
}


export function doStartMushra() {
    ensureAudioContext();
    startMushra();
    
setSampledWave(sampleName, audioContext.sampleRate, (sampleTime)=>{//load the sample then builld the buffers
    let patches = getPatches(sampleTime);
    returnedBuffers =new Array(numberOfSliders).fill(null);
    returnedIds =new Array(numberOfSliders).fill(0);
    lastId++;
    for (let i=0; i<numberOfSliders; i++){
        let patchList = [];
        if (i>0)patchList.push(patches[0]);
        patchList.push(patches[i]);
        calculateMushraBuffer(i, patchList, audioContext.sampleRate, false, lastId  );
    }
}); 
}

let lastId = 1;
let returnedBuffers =[];
let returnedIds =[];
setMushraBufferCallback(async (index, buffers, id)=>{
    //Wait for all buffers to return before starting the audio
    returnedIds[index] = id;
    returnedBuffers[index] = buffers[index==0?0:1];
    if (returnedBuffers.every((x)=>x!=null) && returnedIds.every((x)=>x==lastId)){
        await startAudio(audioContext.sampleRate, returnedBuffers, getLabels(), "outputFFTCanvas");
        startFFT(audioContext, getAnalyserNode(), "outputFFTCanvas");
    };
})



//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Setup the patches and generate the buffers for the mushra test
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++


let sampleName = "Vocal";


function getLabels(){
    return [
        "A",
        ...lastInterpolations.map((x)=>x.toFixed(2)), 
        "B",
        "Anchor"];
    }


function getCorePatch(){
    let patch = { ...getDefaultPatch()}
    patch.sampleMix =1;
    return patch;
}




function setSampledWave(name,sampleRate, callback){
    let loadingCallback = (wave)=>{
        if (wave){
            let sampleTime = wave[0].length/sampleRate;
            setAudioEngineSampleBuffers(wave);//NEVER USE WAVE AGAIN, BUFFER HAS GONE TO Worker
            callback(sampleTime);//return the duration of the sample
        }
    };
    if (!name || name=="" || name==null){
        loadingCallback(null);
        return;
    }
    fetchWaveByName(audioContext.sampleRate, name, loadingCallback);
}


    
let lastInterpolations = [];
function getPatches(sampleTime){
    const patches = new Array(numberOfSliders);
    let defaultP = getCorePatch();
    for (let i=0; i<numberOfSliders; i++){
        patches[i]=[ {...defaultP}, null];
        if (i>0 && i<numberOfSliders){
            for(let j=0; j<2; j++){
                let p =patches[i][j]
                if (!p) continue;
                p.sampleMix = 1;
                p.attack=Math.min(sampleTime*0.1, 0.5);
                p.decay = Math.min(sampleTime*0.2, 1);
                p.hold = (sampleTime - p.attack - p.decay) *0.98 ;
                p.ultraSonicReferenceLevel = 1;
                p.ultraSonicCutlevel = 10;
                p.ultraSonicCutOff = 22000;
                p.tanhDistortion = 0.5;
                p.distortion =1;
                p.oversampleTimes =0;
                //p.inharmonicNoiseLevel = -10;
            }
        }
    }

    

    return patches;
}